import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, like, sql } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { SaveWorkflowAppBody, RunWorkflowAppBody, RunWorkflowAppBatchBody } from "@workspace/api-zod";
import { appSchema, validateApp, singleAppParams, COMPLETE_APP, allowedMotionProviders, type StoredApp } from "../lib/workflow-apps";
import { getAuthenticatedUserId } from "../lib/access-control";
import jobsRouter from "./jobs";
import batchesRouter from "./batches";

const router: IRouter = Router();
const PREFIX = "workflow-app:";
const buckets = new Map<string, { count: number; reset: number }>();
router.use("/workflow-apps", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "GET") { next(); return; }
  const userId = getAuthenticatedUserId(res);
  const now = Date.now();
  for (const [key, value] of buckets) if (value.reset <= now) buckets.delete(key);
  const bucket = buckets.get(userId) ?? { count: 0, reset: now + 60_000 };
  if (bucket.count >= 20) { res.setHeader("Retry-After", "60"); res.status(429).json({ error: "Too many app actions. Try again in a minute." }); return; }
  bucket.count++;
  buckets.set(userId, bucket);
  next();
});

function readStored(value: string): StoredApp {
  const raw = JSON.parse(value) as StoredApp;
  return { ...appSchema.parse(rawWithoutOwner(raw)), slug: raw.slug, ownerId: raw.ownerId };
}
function rawWithoutOwner(app: StoredApp) {
  const { ownerId: _ownerId, ...data } = app;
  return data;
}
function output(app: StoredApp, userId: string) { return { ...rawWithoutOwner(app), isOwner: app.ownerId === userId }; }
async function load(slug: unknown, userId: string) {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return null;
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, PREFIX + slug));
  if (!row) return null;
  const app = readStored(row.value);
  return app.isPublished || app.ownerId === userId ? app : null;
}

router.get("/workflow-apps", async (_req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const rows = await db.select().from(settingsTable).where(like(settingsTable.key, PREFIX + "%"));
  const apps = rows.map((r) => readStored(r.value)).filter((a) => a.ownerId === userId);
  res.json(apps.map((a) => output(a, userId)));
});

router.post("/workflow-apps", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const parsed = SaveWorkflowAppBody.safeParse(req.body);
  const strict = appSchema.safeParse(req.body);
  if (!parsed.success || !strict.success || JSON.stringify(req.body).length > 25000) {
    res.status(400).json({ error: "Invalid app configuration." }); return;
  }
  let input;
  try { input = validateApp(strict.data); } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid workflow settings." }); return;
  }
  const slug = input.slug ?? `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "app"}-${randomUUID().slice(0, 8)}`;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"workflow-apps:" + userId}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"workflow-app-slug:" + slug}))`);
    const [existing] = await tx.select().from(settingsTable).where(eq(settingsTable.key, PREFIX + slug));
    if (existing && readStored(existing.value).ownerId !== userId) return { error: "App not found.", status: 404 };
    if (!existing) {
      const rows = await tx.select().from(settingsTable).where(like(settingsTable.key, PREFIX + "%"));
      if (rows.filter((r) => readStored(r.value).ownerId === userId).length >= 100) return { error: "Maximum 100 workflow apps per account.", status: 409 };
    }
    const app: StoredApp = { ...input, slug, ownerId: userId };
    await tx.insert(settingsTable).values({ key: PREFIX + slug, value: JSON.stringify(app) }).onConflictDoUpdate({
      target: settingsTable.key, set: { value: JSON.stringify(app), updatedAt: new Date() },
    });
    return { app };
  });
  if (result.error) { res.status(result.status!).json({ error: result.error }); return; }
  res.json(output(result.app!, userId));
});

router.get("/workflow-apps/:slug", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const app = await load(req.params.slug, userId);
  if (!app) { res.status(404).json({ error: "App unavailable." }); return; }
  res.json(output(app, userId));
});
router.delete("/workflow-apps/:slug", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"workflow-apps:" + userId}))`);
    const app = await load(req.params.slug, userId);
    if (!app || app.ownerId !== userId) { res.status(404).json({ error: "App not found." }); return; }
    await tx.delete(settingsTable).where(eq(settingsTable.key, PREFIX + app.slug));
    res.json({ success: true });
  });
});

router.post("/workflow-apps/:slug/run", async (req, res, next): Promise<void> => {
  const app = await load(req.params.slug, getAuthenticatedUserId(res));
  if (!app) { res.status(404).json({ error: "App unavailable." }); return; }
  const parsed = RunWorkflowAppBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid generation inputs." }); return; }
  if (app.workflowId === COMPLETE_APP) {
    const p = parsed.data.params;
    const provider = String(p.motion_provider ?? app.presetParams.motion_provider ?? "seedance");
    if (!allowedMotionProviders(app.presetParams).includes(provider)) { res.status(400).json({ error: "This motion provider is not enabled in the app." }); return; }
    const workflowId = provider === "mimicmotion" ? "perform-anywhere-motion" : `perform-anywhere-${provider}`;
    // Only the motion handoff inputs are forwarded; infrastructure and model settings stay code-defined.
    req.body = { workflowId, params: {
      source_image: p.source_image, source_video: p.source_video, performance_video: p.performance_video,
      audio_file: p.audio_file, motion_provider: provider,
      motion_context: app.exposedKeys.includes("motion_context") ? p.motion_context : app.presetParams.motion_context,
      aspect_ratio: "16:9", ratio: "16:9", resolution: "720p", duration: 5, num_frames: 48,
    } };
  } else {
    req.body = { workflowId: app.workflowId, params: singleAppParams(app, parsed.data.params) };
  }
  req.url = "/jobs";
  jobsRouter(req, res, next);
});

router.post("/workflow-apps/:slug/batch", async (req, res, next): Promise<void> => {
  const app = await load(req.params.slug, getAuthenticatedUserId(res));
  if (!app || app.workflowId !== COMPLETE_APP) { res.status(404).json({ error: "Complete Perform Anywhere app unavailable." }); return; }
  const parsed = RunWorkflowAppBatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid shot board inputs." }); return; }
  const p = parsed.data;
  req.body = {
    ...p, name: app.name, batchType: "perform-anywhere-angles", batchSize: 5,
    scenePrompt: app.exposedKeys.includes("scene_description") ? p.scenePrompt : String(app.presetParams.scene_description),
    styleAnchor: app.exposedKeys.includes("visual_direction") ? p.styleAnchor : String(app.presetParams.visual_direction),
    cameraTreatments: ["wide-shot", "low-angle", "close-up-face", "over-shoulder", "dutch-angle"],
    aspectRatios: ["16:9"], colorGrades: ["cinematic-neutral"], seedStrategy: "incremental", baseSeed: 24681357,
  };
  req.url = "/batches";
  batchesRouter(req, res, next);
});
export default router;
