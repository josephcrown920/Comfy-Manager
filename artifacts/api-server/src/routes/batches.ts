import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, batchesTable, jobsTable, outputsTable } from "@workspace/db";
import {
  CancelBatchParams,
  CancelBatchResponse,
  CreateBatchBody,
  CreateBatchResponse,
  GetBatchParams,
  GetBatchResponse,
  ListBatchesResponse,
  RefreshBatchParams,
  RefreshBatchResponse,
  RetryBatchChildParams,
  RetryBatchChildResponse,
} from "@workspace/api-zod";
import { getComfyUrl } from "./settings";
import { fetchComfy } from "./comfy";
import { buildComfyPrompt } from "./jobs";
import { withGpuSubmissionLease } from "./gpu-lease";

const router: IRouter = Router();
const TERMINAL = new Set(["completed", "failed", "cancelled"]);
type BatchStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

function formatChild(job: typeof jobsTable.$inferSelect, outputs: typeof outputsTable.$inferSelect[]) {
  return {
    id: job.id,
    workflowId: job.workflowId,
    workflowName: job.workflowName,
    status: job.status,
    params: job.params as Record<string, unknown>,
    comfyPromptId: job.comfyPromptId ?? null,
    progress: job.progress ?? null,
    errorMessage: job.errorMessage ?? null,
    outputs: outputs.map((output) => ({
      id: output.id,
      jobId: output.jobId,
      filename: output.filename,
      outputType: output.outputType,
      comfyUrl: `/api/comfy/view?filename=${encodeURIComponent(output.filename)}&subfolder=${encodeURIComponent(output.subfolder)}&type=output`,
      thumbnailUrl: null,
      createdAt: output.createdAt,
    })),
    createdAt: job.createdAt,
    completedAt: job.completedAt ?? null,
    batchId: job.batchId ?? null,
    batchIndex: job.batchIndex ?? null,
  };
}

async function getBatchDetail(id: number) {
  const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, id)).limit(1);
  if (!batch) return null;
  const children = await db.select().from(jobsTable).where(eq(jobsTable.batchId, id)).orderBy(asc(jobsTable.batchIndex));
  const outputs = children.length
    ? await db.select().from(outputsTable).where(inArray(outputsTable.jobId, children.map((child) => child.id)))
    : [];
  const byChild = new Map<number, typeof outputs>();
  for (const output of outputs) {
    const group = byChild.get(output.jobId) ?? [];
    group.push(output);
    byChild.set(output.jobId, group);
  }
  return {
    id: batch.id,
    name: batch.name,
    batchType: batch.batchType,
    status: batch.status,
    totalJobs: batch.totalJobs,
    completedJobs: batch.completedJobs,
    failedJobs: batch.failedJobs,
    cancelledJobs: batch.cancelledJobs,
    settings: batch.settings as Record<string, unknown>,
    children: children.map((child) => formatChild(child, byChild.get(child.id) ?? [])),
    createdAt: batch.createdAt,
    completedAt: batch.completedAt ?? null,
  };
}

function seedFor(strategy: "incremental" | "fixed" | "random", baseSeed: number, index: number) {
  if (strategy === "fixed") return baseSeed;
  if (strategy === "random") return Math.floor(Math.random() * 2_000_000_000);
  return baseSeed + index;
}

function sceneChildParams(input: ReturnType<typeof CreateBatchBody.parse>, index: number) {
  const cameras = input.cameraTreatments?.length ? input.cameraTreatments : ["zoom-in", "pan-left", "pan-right", "tilt-up"];
  const aspects = input.aspectRatios?.length ? input.aspectRatios : ["16:9", "9:16"];
  const grades = input.colorGrades?.length ? input.colorGrades : ["teal-orange"];
  const camera = cameras[index % cameras.length]!;
  const aspect = aspects[index % aspects.length]!;
  const grade = grades[index % grades.length]!;
  const seed = seedFor(input.seedStrategy, input.baseSeed ?? 24681357, index);
  return {
    source_image: input.masterAsset,
    motion_preset: camera,
    motion_strength: 48 + ((index * 9) % 34),
    num_frames: 24,
    aspect_ratio: aspect,
    color_grade: grade,
    caption_treatment: input.captionTreatment ?? "safe-lower-third",
    seed,
    prompt: `${input.scenePrompt}. ${input.styleAnchor}. Reference image anchor: ${input.identityAnchor || input.masterAsset}. Camera: ${camera}. Frame: ${aspect}. Color palette: ${grade}. Variant ${index + 1}.`,
    variation: { camera, aspect, colorGrade: grade, captionTreatment: input.captionTreatment ?? "safe-lower-third", seed },
  };
}

function finishedChildParams(input: ReturnType<typeof CreateBatchBody.parse>, index: number) {
  const aspects = input.aspectRatios?.length ? input.aspectRatios : ["16:9", "9:16", "1:1"];
  const grades = input.colorGrades?.length ? input.colorGrades : ["teal-orange", "warm-vintage", "cold-thriller"];
  const aspect = aspects[index % aspects.length]!;
  const grade = grades[index % grades.length]!;
  const seed = seedFor(input.seedStrategy, input.baseSeed ?? 24681357, index);
  return {
    source_video: input.masterAsset,
    grade_style: grade,
    grain_power: 35 + ((index * 11) % 45),
    aspect_ratio: aspect,
    duration_seconds: input.durationSeconds ?? 12,
    caption_treatment: input.captionTreatment ?? "safe-lower-third",
    shared_scene_prompt: input.scenePrompt,
    style_anchor: input.styleAnchor,
    seed,
    variation: { aspect, colorGrade: grade, captionTreatment: input.captionTreatment ?? "safe-lower-third", seed },
  };
}

async function updateBatchRollup(batchId: number) {
  const children = await db.select({ status: jobsTable.status }).from(jobsTable).where(eq(jobsTable.batchId, batchId));
  const completed = children.filter((child) => child.status === "completed").length;
  const failed = children.filter((child) => child.status === "failed").length;
  const cancelled = children.filter((child) => child.status === "cancelled").length;
  const active = children.some((child) => !TERMINAL.has(child.status));
  const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, batchId)).limit(1);
  if (!batch) return;
  let status: BatchStatus = batch.status as BatchStatus;
  if (status !== "cancelled" && status !== "failed") {
    status = active ? "running" : completed > 0 ? "completed" : failed > 0 ? "failed" : "cancelled";
  }
  await db.update(batchesTable).set({
    completedJobs: completed,
    failedJobs: failed,
    cancelledJobs: cancelled,
    status,
    completedAt: active ? null : new Date(),
  }).where(eq(batchesTable.id, batchId));
}

async function submitNextChild() {
  await withGpuSubmissionLease(async () => {
  // Atomically claim the oldest queued batch child only when NO batch child is
  // running anywhere. This is a global one-GPU queue, not one queue per batch.
  // Claiming it before contacting ComfyUI prevents duplicate submission when
  // refreshes race in different browser tabs.
  const claimed = await db.execute<{ id: number }>(sql`
    UPDATE jobs
    SET status = 'running', progress = 0, error_message = NULL, started_at = NOW()
    WHERE id = (
      SELECT child.id
      FROM jobs child
      JOIN batches parent ON parent.id = child.batch_id
      WHERE child.status = 'pending'
        AND parent.status IN ('pending', 'running')
      ORDER BY parent.created_at ASC, child.batch_index ASC
      LIMIT 1
    )
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM jobs active
      WHERE active.status = 'running'
    )
    RETURNING id
  `);
  const childId = claimed.rows[0]?.id;
  if (!childId) return;
  const [child] = await db.select().from(jobsTable).where(eq(jobsTable.id, childId)).limit(1);
  if (!child) return;

  try {
    const comfyUrl = await getComfyUrl();
    const prompt = buildComfyPrompt(child.workflowId, child.params as Record<string, unknown>);
    const response = await fetchComfy(comfyUrl, "/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      await db.update(jobsTable).set({
        status: "failed",
        errorMessage: `GPU setup rejected this variation (HTTP ${response.status}): ${detail.slice(0, 400)}`,
      }).where(eq(jobsTable.id, child.id));
      return;
    }
    const payload = await response.json() as { prompt_id?: string };
    await db.update(jobsTable).set({
      status: "running",
      comfyPromptId: payload.prompt_id ?? null,
      progress: 0,
      errorMessage: null,
    }).where(eq(jobsTable.id, child.id));
  } catch (error) {
    await db.update(jobsTable).set({
      status: "failed",
      errorMessage: `Could not reach the connected GPU. Start ComfyUI and check Settings before retrying. ${error instanceof Error ? error.message : ""}`.trim(),
    }).where(eq(jobsTable.id, child.id));
  }
  });
}

async function refreshRunningChildren(batchId: number) {
  const running = await db.select().from(jobsTable).where(and(eq(jobsTable.batchId, batchId), eq(jobsTable.status, "running")));
  if (!running.length) return;
  const comfyUrl = await getComfyUrl();
  for (const child of running) {
    if (!child.comfyPromptId) {
      // A worker that dies after atomically claiming a child would otherwise
      // leave the global GPU slot locked forever. A brief grace window avoids
      // racing normal prompt submission, then turns the stalled claim into a
      // recoverable failed child.
      if (child.startedAt && Date.now() - child.startedAt.getTime() > 120_000) {
        await db.update(jobsTable).set({ status: "failed", errorMessage: "Submission to the GPU did not return a prompt ID. Retry this variation." })
          .where(and(eq(jobsTable.id, child.id), eq(jobsTable.status, "running"), sql`${jobsTable.comfyPromptId} IS NULL`));
      }
      continue;
    }
    try {
      const response = await fetchComfy(comfyUrl, `/history/${child.comfyPromptId}`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) continue;
      const history = await response.json() as Record<string, { status?: { completed?: boolean; status_str?: string }; outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string }>; gifs?: Array<{ filename: string; subfolder: string }>; videos?: Array<{ filename: string; subfolder: string }> }> }>;
      const entry = history[child.comfyPromptId];
      if (entry?.status?.completed) {
        const claimedCompletion = await db.update(jobsTable)
          .set({ status: "completed", progress: 100, completedAt: new Date() })
          .where(and(eq(jobsTable.id, child.id), eq(jobsTable.status, "running")))
          .returning({ id: jobsTable.id });
        if (!claimedCompletion.length) continue;
        const files = Object.values(entry.outputs ?? {}).flatMap((output) => [...(output.images ?? []), ...(output.gifs ?? []), ...(output.videos ?? [])]);
        for (const file of files) {
          const extension = file.filename.split(".").pop()?.toLowerCase() ?? "";
          await db.insert(outputsTable).values({
            jobId: child.id,
            filename: file.filename,
            subfolder: file.subfolder,
            outputType: ["mp4", "mov", "webm", "avi", "gif"].includes(extension) ? "video" : "image",
          });
        }
      } else if (entry?.status?.status_str === "error") {
        await db.update(jobsTable).set({ status: "failed", errorMessage: "ComfyUI reported an error for this variation." }).where(eq(jobsTable.id, child.id));
      }
    } catch {
      // The existing child remains running; the next refresh can recover.
    }
  }
}

let batchWorkerActive = false;

async function processBatchQueue() {
  if (batchWorkerActive) return;
  batchWorkerActive = true;
  try {
    const activeBatches = await db.select({ id: batchesTable.id }).from(batchesTable)
      .where(inArray(batchesTable.status, ["pending", "running"]));
    for (const batch of activeBatches) {
      await refreshRunningChildren(batch.id);
      await updateBatchRollup(batch.id);
    }
    await submitNextChild();
    for (const batch of activeBatches) await updateBatchRollup(batch.id);
  } catch (error) {
    console.error("Batch queue worker could not reconcile active variations", error);
  } finally {
    batchWorkerActive = false;
  }
}

// Keep batch progression owned by the API process, not by a tab's polling
// lifecycle. The interval is deliberately small because exactly one child can
// own the GPU lease at a time.
const batchWorkerTimer = setInterval(() => void processBatchQueue(), 5_000);
batchWorkerTimer.unref();
void processBatchQueue();

router.get("/batches", async (_req, res) => {
  const batches = await db.select().from(batchesTable).orderBy(desc(batchesTable.createdAt)).limit(25);
  const details = await Promise.all(batches.map((batch) => getBatchDetail(batch.id)));
  res.json(ListBatchesResponse.parse(details.filter(Boolean)));
});

router.post("/batches", async (req, res): Promise<void> => {
  const parsed = CreateBatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  if (!input.masterAsset.trim()) {
    res.status(400).json({ error: "Upload a shared master asset before creating a batch." });
    return;
  }
  if (input.batchType === "scene-variation" && !input.identityAnchor?.trim()) {
    res.status(400).json({ error: "Scene batches require a reference identity anchor. This prevents a plain checkpoint from being presented as identity preservation." });
    return;
  }
  const [batch] = await db.insert(batchesTable).values({
    name: input.name.trim(),
    batchType: input.batchType,
    status: "pending",
    totalJobs: input.batchSize,
    settings: input,
  }).returning();
  const workflowId = input.batchType === "scene-variation" ? "motion-control-animatediff" : "cinematic-film-grade";
  const workflowName = input.batchType === "scene-variation" ? "Cinematic Scene Variation" : "Finished Video Variation";
  await db.insert(jobsTable).values(Array.from({ length: input.batchSize }, (_, index) => ({
    workflowId,
    workflowName,
    status: "pending",
    params: input.batchType === "scene-variation" ? sceneChildParams(input, index) : finishedChildParams(input, index),
    batchId: batch!.id,
    batchIndex: index + 1,
    progress: 0,
  })));
  await submitNextChild();
  await updateBatchRollup(batch!.id);
  res.status(201).json(CreateBatchResponse.parse(await getBatchDetail(batch!.id)));
});

router.get("/batches/:id", async (req, res): Promise<void> => {
  const parsed = GetBatchParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const batch = await getBatchDetail(parsed.data.id);
  if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }
  res.json(GetBatchResponse.parse(batch));
});

router.post("/batches/:id/refresh", async (req, res): Promise<void> => {
  const parsed = RefreshBatchParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!await getBatchDetail(parsed.data.id)) { res.status(404).json({ error: "Batch not found" }); return; }
  await refreshRunningChildren(parsed.data.id);
  await updateBatchRollup(parsed.data.id);
  await submitNextChild();
  await updateBatchRollup(parsed.data.id);
  res.json(RefreshBatchResponse.parse(await getBatchDetail(parsed.data.id)));
});

router.post("/batches/:id/children/:jobId/retry", async (req, res): Promise<void> => {
  const parsed = RetryBatchChildParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [child] = await db.select().from(jobsTable).where(and(eq(jobsTable.id, parsed.data.jobId), eq(jobsTable.batchId, parsed.data.id))).limit(1);
  if (!child) { res.status(404).json({ error: "Batch child not found" }); return; }
  const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, parsed.data.id)).limit(1);
  if (batch?.status === "cancelled") { res.status(400).json({ error: "This batch is cancelled. Create a new batch to resume its queue." }); return; }
  if (child.status !== "failed") { res.status(400).json({ error: "Only failed variations can be retried." }); return; }
  await db.delete(outputsTable).where(eq(outputsTable.jobId, child.id));
  await db.update(jobsTable).set({ status: "pending", comfyPromptId: null, progress: 0, errorMessage: null, startedAt: null, completedAt: null }).where(eq(jobsTable.id, child.id));
  await db.update(batchesTable).set({ status: "running", completedAt: null }).where(eq(batchesTable.id, parsed.data.id));
  await submitNextChild();
  await updateBatchRollup(parsed.data.id);
  res.json(RetryBatchChildResponse.parse(await getBatchDetail(parsed.data.id)));
});

router.delete("/batches/:id", async (req, res): Promise<void> => {
  const parsed = CancelBatchParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const batch = await getBatchDetail(parsed.data.id);
  if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }
  await db.update(jobsTable).set({ status: "cancelled", completedAt: new Date() })
    .where(and(eq(jobsTable.batchId, parsed.data.id), eq(jobsTable.status, "pending")));
  await db.update(batchesTable).set({ status: "cancelled", completedAt: new Date() }).where(eq(batchesTable.id, parsed.data.id));
  await updateBatchRollup(parsed.data.id);
  res.json(CancelBatchResponse.parse(await getBatchDetail(parsed.data.id)));
});

export default router;