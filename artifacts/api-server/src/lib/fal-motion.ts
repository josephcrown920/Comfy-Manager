import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, jobsTable, outputsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ownedInputDataUri, requireOwnedInput } from "./perform-media";
import { ObjectStorageService } from "./object-storage";
import { FAL_MOTION_MODELS, hostedMotionInput, falTrackingPath } from "./fal-motion-inputs";
export { FAL_MOTION_MODELS } from "./fal-motion-inputs";

const connectors = new ReplitConnectors();
const proxy = connectors.createProxyFetch("falai");
const storage = new ObjectStorageService();
export const FAL_OUTPUT_SUBFOLDER = "fal-motion";
export const isFalMotion = (workflowId: string) => Object.hasOwn(FAL_MOTION_MODELS, workflowId);
export const falOutputUrl = (jobId: number) => `/api/motion/outputs/${jobId}`;
let readinessCache: { ready: boolean; until: number } | undefined;
export async function falMotionReady() {
  if (readinessCache && readinessCache.until > Date.now()) return readinessCache.ready;
  try {
    const connections = await connectors.listConnections({ connector_names: "falai" });
    const ready = connections.some((c) => c.connector_name === "falai" && !["revoked", "error", "not_connected"].includes(c.status ?? ""));
    readinessCache = { ready, until: Date.now() + 30000 };
    return ready;
  } catch { return false; }
}
async function request(path: string, init: RequestInit = {}) {
  const response = await proxy(`https://queue.fal.run${path}`, {
    ...init, headers: { "Content-Type": "application/json", "X-Fal-No-Retry": "1", ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(120000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new FalResponseError(response.status);
  return body as Record<string, unknown>;
}
class FalResponseError extends Error {
  constructor(public status: number) {
    super(`Hosted motion request failed (${status}). ${status === 401 || status === 403 ? "Reconnect fal.ai." : "Check the media requirements and provider credit balance."}`);
  }
}
const motionInputs = z.object({
  source_image: z.string().min(1).max(255),
  source_video: z.string().max(255).optional(),
  performance_video: z.string().max(255).optional(),
  audio_file: z.string().max(255).optional(),
  motion_context: z.string().max(2500).optional(),
}).passthrough();

export class MotionInputError extends Error { statusCode = 400; }
export class MotionQuotaError extends Error { statusCode = 429; }

export async function startFalMotion(userId: string, workflowId: string, params: Record<string, unknown>) {
  if (!isFalMotion(workflowId)) throw new MotionInputError("Unsupported motion provider.");
  const parsed = motionInputs.safeParse(params);
  if (!parsed.success) throw new MotionInputError("A selected still and valid performance inputs are required.");
  const omni = workflowId === "perform-anywhere-omnihuman";
  const p = parsed.data;
  const drive = omni ? p.audio_file : p.source_video || p.performance_video;
  try {
    await requireOwnedInput(p.source_image, userId, "image");
    await requireOwnedInput(drive, userId, omni ? "audio" : "video");
  } catch (e) { throw new MotionInputError(e instanceof Error ? e.message : "Invalid media ownership."); }
  if (!await falMotionReady()) throw new MotionInputError("Connect fal.ai before using Kling or OmniHuman.");
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const reserved = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('fal-motion-global'))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"fal-motion:" + userId}))`);
    const [shared] = await tx.select({
      daily: sql<number>`count(*) FILTER (WHERE ${jobsTable.createdAt} >= ${today})::int`,
      active: sql<number>`count(*) FILTER (WHERE ${jobsTable.status} IN ('pending','running'))::int`,
    }).from(jobsTable).where(sql`${jobsTable.workflowId} IN ('perform-anywhere-kling','perform-anywhere-omnihuman')`);
    if ((shared?.daily ?? 0) >= 20 || (shared?.active ?? 0) >= 4) throw new MotionQuotaError("Aurora's shared hosted-provider capacity is reached (20 jobs/day, 4 active). Try later; no new render was submitted.");
    const [usage] = await tx.select({
      daily: sql<number>`count(*) FILTER (WHERE ${jobsTable.createdAt} >= ${today})::int`,
      active: sql<number>`count(*) FILTER (WHERE ${jobsTable.status} IN ('pending','running'))::int`,
    }).from(jobsTable).where(and(
      eq(jobsTable.ownerId, userId),
      sql`${jobsTable.workflowId} IN ('perform-anywhere-kling','perform-anywhere-omnihuman')`,
    ));
    if ((usage?.daily ?? 0) >= 20 || (usage?.active ?? 0) >= 4) throw new MotionQuotaError("Hosted motion limit reached: 20 jobs per day and 4 active jobs per account.");
    const [job] = await tx.insert(jobsTable).values({
      ownerId: userId, workflowId, workflowName: omni ? "Perform Anywhere — OmniHuman 1.5" : "Perform Anywhere — Kling Motion Control",
      params, status: "pending", progress: 0,
    }).returning();
    return job!;
  });
  let submitted = false;
  try {
    const [image, media] = await Promise.all([
      ownedInputDataUri(p.source_image, userId, "image"),
      ownedInputDataUri(drive, userId, omni ? "audio" : "video"),
    ]);
    const input = hostedMotionInput(workflowId, image, media, p.motion_context);
    submitted = true;
    const result = await request(`/${FAL_MOTION_MODELS[workflowId]}`, { method: "POST", body: JSON.stringify(input) });
    const task = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).parse(result.request_id);
    const [job] = await db.update(jobsTable).set({ comfyPromptId: `fal:${task}`, status: "running", progress: 5 }).where(eq(jobsTable.id, reserved.id)).returning();
    return job!;
  } catch (e) {
    if (submitted && !(e instanceof FalResponseError && e.status >= 400 && e.status < 500)) {
      // The queue may have accepted a timed-out POST. Never expose a blind paid retry.
      const [uncertain] = await db.update(jobsTable).set({
        status: "running", progress: 0,
        errorMessage: "Submission outcome is uncertain. Check your fal.ai queue before retrying; this shot is locked to prevent duplicate charges.",
        params: { ...params, _falSubmissionUncertain: true },
      }).where(eq(jobsTable.id, reserved.id)).returning();
      return uncertain!;
    }
    await db.update(jobsTable).set({ status: "failed", errorMessage: e instanceof Error ? e.message : "Hosted motion submission failed." }).where(eq(jobsTable.id, reserved.id));
    throw e;
  }
}

export async function cancelFalMotion(workflowId: string, promptId: string) {
  await request(`${falTrackingPath(workflowId, promptId)}/cancel`, { method: "PUT" });
}
function safeVideoUrl(value: unknown) {
  const url = new URL(z.string().url().max(4096).parse(value));
  const allowed = url.hostname === "fal.media" || url.hostname.endsWith(".fal.media")
    || (url.hostname === "storage.googleapis.com" && url.pathname.startsWith("/falserverless/"));
  if (!allowed || url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Provider returned an unsupported output URL.");
  return url.href;
}
export async function reconcileFalMotion(job: typeof jobsTable.$inferSelect) {
  const path = falTrackingPath(job.workflowId, job.comfyPromptId!);
  const status = await request(`${path}/status`);
  if (status.status !== "COMPLETED") return;
  if (status.error) {
    await db.update(jobsTable).set({ status: "failed", errorMessage: "Hosted motion generation failed. Check input duration, provider credits and content requirements." }).where(and(eq(jobsTable.id, job.id), eq(jobsTable.status, "running")));
    return;
  }
  let result: Record<string, unknown>;
  try { result = await request(path); }
  catch (e) {
    if (e instanceof FalResponseError && e.status === 422) {
      await db.update(jobsTable).set({
        status: "failed", errorMessage: "The provider finished but rejected generation. Check your media, content requirements and provider account before submitting another paid render.",
      }).where(and(eq(jobsTable.id, job.id), eq(jobsTable.status, "running")));
      return;
    }
    throw e;
  }
  const video = z.object({ url: z.string() }).parse(result.video);
  // Claim only the save operation, not completion; retries can recover a failed download.
  await db.transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(sql`SELECT pg_try_advisory_xact_lock(hashtext(${"fal-result:" + job.id})) AS locked`);
    if (!lock.rows[0]?.locked) return;
    const [current] = await tx.select().from(jobsTable).where(eq(jobsTable.id, job.id));
    if (current?.status !== "running") return;
    const response = await fetch(safeVideoUrl(video.url), { redirect: "error", signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error("Provider output is not available for download yet.");
    const limit = 100 * 1024 * 1024;
    if (Number(response.headers.get("content-length") ?? 0) > limit || !response.body) throw new Error("Provider output is too large to save.");
    const parts: Uint8Array[] = []; let size = 0;
    for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += part.byteLength; if (size > limit) throw new Error("Provider output exceeds the 100MB storage limit.");
      parts.push(part);
    }
    const upload = await storage.getObjectEntityUploadURL();
    const saved = await fetch(upload.uploadURL, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: Buffer.concat(parts), signal: AbortSignal.timeout(90000) });
    if (!saved.ok) throw new Error("Could not save the generated video.");
    await tx.update(jobsTable).set({ status: "completed", progress: 100, completedAt: new Date(), params: { ...current.params as Record<string, unknown>, _falObjectPath: upload.objectPath } }).where(eq(jobsTable.id, job.id));
    await tx.insert(outputsTable).values({ ownerId: job.ownerId, jobId: job.id, filename: `perform-anywhere-${job.id}.mp4`, subfolder: FAL_OUTPUT_SUBFOLDER, outputType: "video" });
  });
}
