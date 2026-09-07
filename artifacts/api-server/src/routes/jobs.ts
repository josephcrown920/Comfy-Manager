import { Router, type IRouter } from "express";
import { db, jobsTable, outputsTable } from "@workspace/db";
import {
  ListJobsQueryParams,
  CreateJobBody,
  GetJobParams,
  DeleteJobParams,
  RefreshJobParams,
  ListJobsResponse,
  CreateJobResponse,
  GetJobStatsResponse,
  GetJobResponse,
  DeleteJobResponse,
  RefreshJobResponse,
} from "@workspace/api-zod";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { WORKFLOWS } from "./workflows";
import { getComfyUrl } from "./settings";
import { fetchComfy } from "./comfy";
import { getModelAssignments } from "./model-assignments";
import { withGpuSubmissionLease } from "./gpu-lease";
import { reconcileJob } from "../lib/job-reconciliation";

const router: IRouter = Router();

function buildJobOutput(job: typeof jobsTable.$inferSelect, outputs: typeof outputsTable.$inferSelect[]) {
  return {
    id: job.id,
    workflowId: job.workflowId,
    workflowName: job.workflowName,
    status: job.status,
    params: job.params as Record<string, unknown>,
    comfyPromptId: job.comfyPromptId ?? null,
    progress: job.progress ?? null,
    errorMessage: job.errorMessage ?? null,
    batchId: job.batchId ?? null,
    batchIndex: job.batchIndex ?? null,
    outputs: outputs.map((o) => ({
      id: o.id,
      jobId: o.jobId,
      filename: o.filename,
      outputType: o.outputType,
      comfyUrl: `/api/comfy/view?filename=${encodeURIComponent(o.filename)}&subfolder=${encodeURIComponent(o.subfolder)}&type=output`,
      thumbnailUrl: null,
      createdAt: o.createdAt,
    })),
    createdAt: job.createdAt,
    completedAt: job.completedAt ?? null,
  };
}

router.get("/jobs", async (req, res): Promise<void> => {
  const params = ListJobsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, workflowId, limit } = params.data;
  const conditions = [];
  if (status) conditions.push(eq(jobsTable.status, status));
  if (workflowId) conditions.push(eq(jobsTable.workflowId, workflowId));

  const jobs = await db
    .select()
    .from(jobsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(jobsTable.createdAt))
    .limit(limit ?? 50);

  const allOutputs = jobs.length > 0
    ? await db
        .select()
        .from(outputsTable)
        .where(
          sql`${outputsTable.jobId} = ANY(ARRAY[${sql.join(jobs.map((j) => sql`${j.id}`), sql`, `)}]::int[])`
        )
    : [];

  const outputsByJob = new Map<number, typeof allOutputs>();
  for (const o of allOutputs) {
    if (!outputsByJob.has(o.jobId)) outputsByJob.set(o.jobId, []);
    outputsByJob.get(o.jobId)!.push(o);
  }

  res.json(
    ListJobsResponse.parse(
      jobs.map((j) => buildJobOutput(j, outputsByJob.get(j.id) ?? []))
    )
  );
});

router.get("/jobs/stats", async (_req, res): Promise<void> => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [counts, todayCount] = await Promise.all([
    db
      .select({
        status: jobsTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(jobsTable)
      .groupBy(jobsTable.status),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobsTable)
      .where(gte(jobsTable.createdAt, todayStart)),
  ]);

  const byStatus = Object.fromEntries(counts.map((r) => [r.status, r.count]));
  const total = counts.reduce((s, r) => s + r.count, 0);

  res.json(
    GetJobStatsResponse.parse({
      total,
      pending: byStatus["pending"] ?? 0,
      running: byStatus["running"] ?? 0,
      completed: byStatus["completed"] ?? 0,
      failed: byStatus["failed"] ?? 0,
      todayCount: todayCount[0]?.count ?? 0,
    })
  );
});

router.post("/jobs", async (req, res): Promise<void> => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { workflowId, params } = parsed.data;
  await withGpuSubmissionLease(async () => {
  // Batch Studio owns a user-connected GPU exclusively. Ordinary single-job
  // submission remains unchanged when the GPU is free, but cannot bypass an
  // active batch child and contend for the same ComfyUI queue.
  const [activeBatchChild] = await db.select({ id: jobsTable.id }).from(jobsTable)
    .where(and(sql`${jobsTable.batchId} IS NOT NULL`, eq(jobsTable.status, "running"))).limit(1);
  if (activeBatchChild) {
    res.status(409).json({ error: "A Batch Studio variation is using this GPU. Wait for it to finish or stop its batch queue before starting a single generation." });
    return;
  }

  // Custom workflow: pass raw JSON directly to ComfyUI unchanged
  if (workflowId === "custom-workflow") {
    const rawJson = (params as Record<string, unknown>).workflow_json;
    if (!rawJson || typeof rawJson !== "string") {
      res.status(400).json({ error: "workflow_json is required for custom workflows" });
      return;
    }

    let comfyPrompt: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawJson);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        res.status(400).json({ error: "workflow_json must be a ComfyUI API-format prompt object (not an array or primitive)" });
        return;
      }
      comfyPrompt = parsed as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: "workflow_json is not valid JSON" });
      return;
    }

    const comfyUrl = await getComfyUrl();
    let comfyPromptId: string | null = null;
    let initialStatus = "pending";

    try {
      const promptRes = await fetchComfy(comfyUrl, "/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: comfyPrompt }),
      });
      if (promptRes.ok) {
        const data = (await promptRes.json()) as { prompt_id?: string };
        comfyPromptId = data.prompt_id ?? null;
        initialStatus = "running";
      } else {
        // ComfyUI rejected the graph (bad nodes, missing models, invalid JSON) —
        // surface the validation error instead of silently queueing a dead job.
        const errBody = await promptRes.text().catch(() => "");
        res.status(400).json({
          error: `ComfyUI rejected the workflow (HTTP ${promptRes.status}): ${errBody.slice(0, 500)}`,
        });
        return;
      }
    } catch {
      // ComfyUI unreachable — job stays pending
    }

    const [newJobRow] = await db
      .insert(jobsTable)
      .values({
        workflowId,
        workflowName: "Custom Workflow",
        status: initialStatus as "pending" | "running",
        params: params as Record<string, unknown>,
        comfyPromptId,
        progress: 0,
      })
      .returning();

    res.json(CreateJobResponse.parse(buildJobOutput(newJobRow!, [])));
    return;
  }

  const workflow = WORKFLOWS.find((w) => w.id === workflowId);
  if (!workflow) {
    res.status(400).json({ error: "Unknown workflow: " + workflowId });
    return;
  }

  const comfyUrl = await getComfyUrl();
  const assignments = await getModelAssignments();

  // Resolve checkpoint assignment. Per-workflow assignments always apply.
  // The global default only applies to SD1.5-style workflows — applying it to
  // SVD (img2vid) or SadTalker (lip sync) would break them, since those need
  // architecture-specific checkpoints.
  const GLOBAL_CHECKPOINT_WORKFLOWS = new Set([
    "video-generation-txt2vid",
    "motion-control-animatediff",
    "seedance-reference-motion",
    "seedance-camera-path",
    "seedance-vertical-social",
    "seedance-product-reveal",
  ]);
  const wfAssignment = assignments.workflows[workflowId];
  const primaryCheckpoint =
    wfAssignment?.checkpoint ||
    (GLOBAL_CHECKPOINT_WORKFLOWS.has(workflowId)
      ? assignments.global.checkpoint
      : "") ||
    "";
  const fallbackCheckpoint =
    wfAssignment?.checkpointFallback ||
    (GLOBAL_CHECKPOINT_WORKFLOWS.has(workflowId)
      ? assignments.global.checkpointFallback
      : "") ||
    "";

  // If a fallback is configured, check whether primary is available; use fallback if not
  let resolvedCheckpoint = primaryCheckpoint;
  if (fallbackCheckpoint && primaryCheckpoint) {
    try {
      const modelsRes = await fetchComfy(comfyUrl, "/api/models/checkpoints");
      if (modelsRes.ok) {
        const available = (await modelsRes.json()) as unknown;
        if (Array.isArray(available) && !available.includes(primaryCheckpoint)) {
          resolvedCheckpoint = fallbackCheckpoint;
        }
      }
    } catch {
      // Cannot verify availability — proceed with primary
    }
  }

  // Build the ComfyUI API prompt; only override checkpoint when assigned
  const comfyPrompt = buildComfyPrompt(
    workflowId,
    resolvedCheckpoint
      ? { ...(params as Record<string, unknown>), checkpoint: resolvedCheckpoint }
      : (params as Record<string, unknown>)
  );

  let comfyPromptId: string | null = null;
  let initialStatus = "pending";

  try {
    const promptRes = await fetchComfy(comfyUrl, "/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: comfyPrompt }),
    });

    if (promptRes.ok) {
      const data = (await promptRes.json()) as { prompt_id?: string };
      comfyPromptId = data.prompt_id ?? null;
      initialStatus = "running";
    } else {
      const errBody = await promptRes.text().catch(() => "");
      res.status(400).json({
        error: `ComfyUI rejected the workflow (HTTP ${promptRes.status}): ${errBody.slice(0, 500)}`,
      });
      return;
    }
  } catch {
    // ComfyUI unreachable — job stays pending
  }

  const [newJobRow] = await db
    .insert(jobsTable)
    .values({
      workflowId,
      workflowName: workflow.name,
      status: initialStatus as "pending" | "running",
      params: params as Record<string, unknown>,
      comfyPromptId,
      progress: 0,
    })
    .returning();

  res.status(201).json(CreateJobResponse.parse(buildJobOutput(newJobRow!, [])));
  });
});

router.get("/jobs/:id", async (req, res): Promise<void> => {
  const params = GetJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, params.data.id))
    .limit(1);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const outputs = await db
    .select()
    .from(outputsTable)
    .where(eq(outputsTable.jobId, job.id));

  res.json(GetJobResponse.parse(buildJobOutput(job, outputs)));
});

router.delete("/jobs/:id", async (req, res): Promise<void> => {
  const params = RefreshJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, params.data.id))
    .limit(1);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  await db.delete(outputsTable).where(eq(outputsTable.jobId, job.id));
  await db.delete(jobsTable).where(eq(jobsTable.id, job.id));

  res.sendStatus(204);
  DeleteJobResponse.parse(undefined);
});

router.post("/jobs/:id/refresh", async (req, res): Promise<void> => {
  const params = RefreshJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, params.data.id))
    .limit(1);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  try {
    await reconcileJob(job.id);
  } catch {
    // Keep refresh available when ComfyUI is temporarily unreachable.
  }

  const [updated] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, job.id))
    .limit(1);

  const outputs = await db
    .select()
    .from(outputsTable)
    .where(eq(outputsTable.jobId, job.id));

  res.json(RefreshJobResponse.parse(buildJobOutput(updated, outputs)));
});

/**
 * Build a ComfyUI API-format prompt graph for the given workflow.
 *
 * Each workflow-specific builder wires uploaded file references (returned by
 * /api/files/upload) into the appropriate ComfyUI loader nodes so that
 * face_image, source_image, and audio_file inputs are actually consumed.
 *
 * Audio files are stored in the `audio/` subfolder by the upload endpoint, so
 * their ComfyUI path is `audio/<filename>` (subfolder prefix + name).
 */
export function buildComfyPrompt(
  workflowId: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  switch (workflowId) {
    case "lip-sync-basic":
      return buildLipSyncPrompt(params);
    case "motion-control-animatediff":
    case "seedance-reference-motion":
    case "seedance-camera-path":
    case "seedance-vertical-social":
    case "seedance-product-reveal":
      return buildMotionControlPrompt(params);
    case "perform-anywhere-angles":
      return buildPerformAnywhereAnglePrompt(params);
    case "perform-anywhere-motion":
      return buildPerformAnywhereMotionPrompt(params);
    case "img2vid-stable-video":
      return buildImg2VidPrompt(params);
    case "video-generation-txt2vid":
      return buildTxt2VidPrompt(params);
    case "cinematic-film-grade":
      return buildFilmGradePrompt(params);
    case "cinematic-portrait":
      return buildCinematicPortraitPrompt(params);
    case "cinematic-slowmo-upscale":
      return buildSlowmoUpscalePrompt(params);
    case "cinematic-epic-landscape":
      return buildEpicLandscapePrompt(params);
    case "content-reel-loop":
      return buildReelLoopPrompt(params);
    case "content-product-swap":
      return buildProductSwapPrompt(params);
    case "content-talking-avatar":
      return buildTalkingAvatarPrompt(params);
    case "content-blog-hero":
      return buildBlogHeroPrompt(params);
    default:
      return buildGenericPrompt(workflowId, params);
  }
}

/**
 * Film Grain & Color Grade — post-processing on uploaded video.
 * Requires ComfyUI-VideoHelperSuite, ComfyUI-ProPost, and a color-correct
 * node pack (comfyui-easy-use / comfyui-art-venture style ColorCorrect).
 */
function buildFilmGradePrompt(params: Record<string, unknown>): Record<string, unknown> {
  const sourceVideo = String(params.source_video ?? "");
  const grainPower = Number(params.grain_power ?? 60) / 100;
  const style = String(params.grade_style ?? "teal-orange");
  const aspect = String(params.aspect_ratio ?? "original");
  const outputSize: Record<string, { width: number; height: number }> = {
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 720, height: 1280 },
    "1:1": { width: 720, height: 720 },
  };
  const size = outputSize[aspect] ?? { width: 0, height: 0 };
  const duration = Number(params.duration_seconds ?? 0);
  const frameCap = Number.isFinite(duration) && duration > 0 ? Math.min(Math.round(duration * 24), 1440) : 0;
  const seed = Number.isFinite(Number(params.seed)) ? Number(params.seed) : Math.floor(Math.random() * 1e9);
  const captionTreatment = String(params.caption_treatment ?? "safe-lower-third");
  const captionCenterY = captionTreatment === "safe-lower-third" ? 0.42 : captionTreatment === "safe-upper-third" ? 0.58 : 0.5;

  // Map grade style to color-correct settings
  const grades: Record<string, { temperature: number; saturation: number; contrast: number; gamma: number }> = {
    "teal-orange":   { temperature: -12, saturation: -8,  contrast: 14, gamma: 1.05 },
    "warm-vintage":  { temperature: 18,  saturation: -15, contrast: 6,  gamma: 1.1 },
    "cold-thriller": { temperature: -25, saturation: -20, contrast: 18, gamma: 0.95 },
    "bleach-bypass": { temperature: 0,   saturation: -45, contrast: 25, gamma: 1.0 },
  };
  const g = grades[style] ?? grades["teal-orange"]!;

  return {
    "1": {
      class_type: "VHS_LoadVideo",
      inputs: {
        video: sourceVideo,
        force_rate: 24,
        custom_width: size.width,
        custom_height: size.height,
        frame_load_cap: frameCap,
        skip_first_frames: 0,
        select_every_nth: 1,
      },
    },
    "2": {
      class_type: "ColorCorrect",
      inputs: {
        image: ["1", 0],
        temperature: g.temperature,
        hue: 0,
        brightness: -4,
        contrast: g.contrast,
        saturation: g.saturation,
        gamma: g.gamma,
      },
    },
    "3": {
      class_type: "ProPostFilmGrain",
      inputs: {
        image: ["2", 0],
        gray_scale: false,
        grain_type: "Fine",
        grain_sat: 0.4,
        grain_power: grainPower,
        shadows: 0.25,
        highs: 0.15,
        scale: 1.0,
        sharpen: 0,
        src_gamma: 1.0,
        seed,
      },
    },
    "4": {
      class_type: "ProPostVignette",
      // Shift the visual center away from the caption-safe third so titles
      // retain contrast and do not sit on the brightest focal area.
      inputs: { image: ["3", 0], intensity: 0.35, center_x: 0.5, center_y: captionCenterY },
    },
    "5": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["4", 0],
        // Preserve the source clip's audio track (VHS_LoadVideo output 2)
        audio: ["1", 2],
        frame_rate: 24,
        loop_count: 0,
        filename_prefix: `film-grade-${aspect.replace(":", "x")}`,
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
      },
    },
  };
}

/**
 * Cinematic Portrait — SDXL text-to-image with lens/lighting language baked
 * into the prompt. Core nodes only so it runs on any ComfyUI install.
 */
function buildCinematicPortraitPrompt(params: Record<string, unknown>): Record<string, unknown> {
  const subject = String(params.prompt ?? "a person");
  const bokeh = Number(params.bokeh_strength ?? 70);
  const lighting = String(params.lighting ?? "golden-hour");

  const lightingText: Record<string, string> = {
    "golden-hour":  "golden hour rim lighting, warm sun flare",
    "neon-night":   "neon night lighting, cyan and magenta glow",
    "soft-window":  "soft window light, gentle shadows",
    "dramatic-rim": "dramatic rim lighting, deep shadows, chiaroscuro",
  };
  const bokehText = bokeh > 66 ? "extremely shallow depth of field, creamy dreamy bokeh" : bokeh > 33 ? "shallow depth of field, soft bokeh background" : "moderate depth of field";

  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: String(params.checkpoint ?? "sd_xl_base_1.0.safetensors") } },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: `cinematic portrait photograph of ${subject}, 85mm f/1.2 lens, ${bokehText}, ${lightingText[lighting] ?? lightingText["golden-hour"]}, film still, kodak portra 800, sharp focus on eyes`,
        clip: ["1", 1],
      },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "flat lighting, deep focus, cartoon, illustration, low quality, watermark", clip: ["1", 1] },
    },
    "4": { class_type: "EmptyLatentImage", inputs: { width: 832, height: 1216, batch_size: 1 } },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: Number.isFinite(Number(params.seed)) ? Number(params.seed) : Math.floor(Math.random() * 1e9),
        steps: 32,
        cfg: 6.5,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "cinematic-portrait" } },
  };
}

/**
 * Slow-Motion Upscale — RIFE frame interpolation + optional ESRGAN 2x.
 * The source is normalized to 24 fps on load (force_rate) and the output is
 * written at 24 fps, so N× interpolated frames yield an exact N× slowdown
 * regardless of the source clip's native frame rate. The output is silent by
 * design: slowed footage cannot keep the original audio in sync.
 * Requires ComfyUI-Frame-Interpolation and ComfyUI-VideoHelperSuite.
 */
function buildSlowmoUpscalePrompt(params: Record<string, unknown>): Record<string, unknown> {
  const sourceVideo = String(params.source_video ?? "");
  const multiplier = Number(params.slowdown_factor ?? 4);
  const doUpscale = String(params.upscale ?? "2x") === "2x";

  const graph: Record<string, unknown> = {
    "1": {
      class_type: "VHS_LoadVideo",
      inputs: {
        video: sourceVideo,
        // Normalize to 24 fps so the slowdown factor is exact for any source
        force_rate: 24,
        custom_width: 0,
        custom_height: 0,
        frame_load_cap: 0,
        skip_first_frames: 0,
        select_every_nth: 1,
      },
    },
    "2": {
      class_type: "RIFE VFI",
      inputs: {
        frames: ["1", 0],
        ckpt_name: "rife47.pth",
        clear_cache_after_n_frames: 10,
        multiplier: Math.round(multiplier),
        fast_mode: true,
        ensemble: true,
        scale_factor: 1.0,
        dtype: "float32",
        torch_compile: false,
        batch_size: 1,
      },
    },
  };

  let lastImageNode = "2";
  if (doUpscale) {
    graph["3"] = { class_type: "UpscaleModelLoader", inputs: { model_name: "RealESRGAN_x2.pth" } };
    graph["4"] = { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["3", 0], image: ["2", 0] } };
    lastImageNode = "4";
  }

  graph["5"] = {
    class_type: "VHS_VideoCombine",
    inputs: {
      images: [lastImageNode, 0],
      // No audio: original audio cannot stay in sync with slowed footage
      frame_rate: 24,
      loop_count: 0,
      filename_prefix: "slow-motion",
      format: "video/h264-mp4",
      pingpong: false,
      save_output: true,
    },
  };
  return graph;
}

/**
 * Epic Landscape — wide SDXL landscape with sky style in the prompt.
 * Core nodes only for maximum compatibility.
 */
function buildEpicLandscapePrompt(params: Record<string, unknown>): Record<string, unknown> {
  const scene = String(params.prompt ?? "mountain range");
  const skyStyle = String(params.sky_style ?? "storm-god-rays");
  const aspect = String(params.aspect ?? "16:9");

  const skyText: Record<string, string> = {
    "storm-god-rays": "dramatic storm clouds parting with golden god rays",
    "sunset-fire":    "blazing sunset sky, fiery orange and crimson clouds",
    "aurora-night":   "night sky with vivid green and violet aurora borealis",
    "clear-alpine":   "crisp clear blue alpine sky with wispy cirrus clouds",
  };
  const dims: Record<string, { width: number; height: number }> = {
    "16:9": { width: 1344, height: 768 },
    "21:9": { width: 1536, height: 640 },
    "3:2":  { width: 1216, height: 832 },
  };
  const d = dims[aspect] ?? dims["16:9"]!;

  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: String(params.checkpoint ?? "sd_xl_base_1.0.safetensors") } },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: `epic wide-angle landscape photograph, ${scene}, ${skyText[skyStyle] ?? skyText["storm-god-rays"]}, vast cinematic scale, ultra wide 14mm lens, national geographic, hyperdetailed`,
        clip: ["1", 1],
      },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "people, buildings, text, watermark, low quality, blurry, oversaturated", clip: ["1", 1] },
    },
    "4": { class_type: "EmptyLatentImage", inputs: { width: d.width, height: d.height, batch_size: 1 } },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: Number.isFinite(Number(params.seed)) ? Number(params.seed) : Math.floor(Math.random() * 1e9),
        steps: 35,
        cfg: 7,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "epic-landscape" } },
  };
}

/**
 * Instagram Reel Loop — AnimateDiff Evolved with closed-loop context for
 * seamless looping vertical video. Uses the same load/apply/context pattern
 * as the proven Motion Control builder (ADE_LoadAnimateDiffModel →
 * ADE_UseEvolvedSampling with ADE_StandardStaticContextOptions), but with
 * closed_loop enabled so the last frame flows back into the first.
 * Requires AnimateDiff-Evolved + VideoHelperSuite.
 */
function buildReelLoopPrompt(params: Record<string, unknown>): Record<string, unknown> {
  const visual = String(params.prompt ?? "abstract flowing gradient waves");
  const duration = Number(params.duration ?? 2);
  const style = String(params.style ?? "neon-abstract");
  const frames = Math.min(Math.max(duration * 16, 16), 96);

  const styleText: Record<string, string> = {
    "neon-abstract":    "vibrant neon colors, glowing abstract shapes",
    "nature-calm":      "calm natural tones, organic soft movement",
    "retro-vhs":        "retro VHS aesthetic, scan lines, 80s color palette",
    "minimal-gradient": "minimal smooth gradients, muted elegant palette",
  };

  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: String(params.checkpoint ?? "v1-5-pruned-emaonly.safetensors") } },
    "2": {
      class_type: "ADE_LoadAnimateDiffModel",
      inputs: { model_name: "mm_sd_v15_v2.ckpt" },
    },
    // Wrap the raw motion model (MOTION_MODEL_ADE) into M_MODELS
    "3": {
      class_type: "ADE_ApplyAnimateDiffModelSimple",
      inputs: { motion_model: ["2", 0] },
    },
    "4": {
      class_type: "ADE_StandardStaticContextOptions",
      inputs: { context_length: 16, context_stride: 1, context_overlap: 4, closed_loop: true },
    },
    "5": {
      class_type: "ADE_UseEvolvedSampling",
      inputs: {
        model: ["1", 0],
        beta_schedule: "sqrt_linear (AnimateDiff)",
        m_models: ["3", 0],
        context_options: ["4", 0],
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: `seamless looping animation, ${visual}, ${styleText[style] ?? styleText["neon-abstract"]}, smooth hypnotic motion, vertical composition`,
        clip: ["1", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: "static, jerky motion, text, watermark, low quality", clip: ["1", 1] },
    },
    "8": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 896, batch_size: frames } },
    "9": {
      class_type: "KSampler",
      inputs: {
        seed: Number.isFinite(Number(params.seed)) ? Number(params.seed) : Math.floor(Math.random() * 1e9),
        steps: 25,
        cfg: 8,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["5", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["8", 0],
      },
    },
    "10": { class_type: "VAEDecode", inputs: { samples: ["9", 0], vae: ["1", 2] } },
    "11": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["10", 0],
        frame_rate: 16,
        loop_count: 0,
        filename_prefix: "reel-loop",
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
      },
    },
  };
}

/**
 * Product Background Swap — automatic product masking (Inspyrenet background
 * removal) followed by masked inpainting so the product itself is preserved
 * while only the background is regenerated. The Inspyrenet node is installed
 * by the GPU launcher's `image` capability and self-downloads its weights.
 */
function buildProductSwapPrompt(params: Record<string, unknown>): Record<string, unknown> {
  const productImage = String(params.product_image ?? "");
  const backgroundPrompt = String(params.background_prompt ?? "clean minimal studio backdrop, soft shadows");

  return {
    "1": { class_type: "LoadImage", inputs: { image: productImage, upload: "image" } },
    // InspyrenetRembg outputs (IMAGE, MASK); the mask covers the product.
    "2": { class_type: "InspyrenetRembg", inputs: { image: ["1", 0], torchscript_jit: "default" } },
    // Invert so inpainting only touches the background and the product
    // pixels are preserved.
    "3": { class_type: "InvertMask", inputs: { mask: ["2", 1] } },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: String(params.checkpoint ?? "sd_xl_base_1.0.safetensors") } },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: `professional product photography, ${backgroundPrompt}, e-commerce hero shot, studio quality`,
        clip: ["4", 1],
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: "cluttered, busy background, text, watermark, low quality", clip: ["4", 1] },
    },
    "7": { class_type: "VAEEncode", inputs: { pixels: ["1", 0], vae: ["4", 2] } },
    "8": { class_type: "SetLatentNoiseMask", inputs: { samples: ["7", 0], mask: ["3", 0] } },
    "9": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 1e9),
        steps: 28,
        cfg: 7,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 0.85,
        model: ["4", 0],
        positive: ["5", 0],
        negative: ["6", 0],
        latent_image: ["8", 0],
      },
    },
    "10": { class_type: "VAEDecode", inputs: { samples: ["9", 0], vae: ["4", 2] } },
    "11": { class_type: "SaveImage", inputs: { images: ["10", 0], filename_prefix: "product-swap" } },
  };
}

/**
 * Talking Avatar — LatentSync graph, using the same node pack the GPU
 * launcher already installs for the Lip Sync capability (LatentSyncWrapper +
 * VideoHelperSuite). The still portrait is repeated into a frame batch,
 * stretched to the audio length, then lip-synced.
 */
function buildTalkingAvatarPrompt(params: Record<string, unknown>): Record<string, unknown> {
  const portrait = String(params.portrait_image ?? "");
  const audioFile = String(params.speech_audio ?? "");
  const audioPath = audioFile.startsWith("audio/") ? audioFile : `audio/${audioFile}`;
  // Map 0-100 expressiveness to LatentSync lips_expression 1.0-3.0
  const lipsExpression = 1 + (Math.min(Math.max(Number(params.expression_scale ?? 50), 0), 100) / 100) * 2;

  return {
    "1": { class_type: "LoadImage", inputs: { image: portrait, upload: "image" } },
    "2": { class_type: "VHS_LoadAudio", inputs: { audio_file: audioPath, seek_seconds: 0.0 } },
    // Repeat the still portrait into a batch of frames, then loop/trim the
    // batch to match the audio duration at 25 fps.
    "3": { class_type: "RepeatImageBatch", inputs: { image: ["1", 0], amount: 25 } },
    "4": {
      class_type: "VideoLengthAdjuster",
      inputs: {
        images: ["3", 0],
        audio: ["2", 0],
        mode: "loop_to_audio",
        fps: 25.0,
        silent_padding_sec: 0.5,
      },
    },
    "5": {
      class_type: "LatentSyncNode",
      inputs: {
        images: ["4", 0],
        audio: ["4", 1],
        seed: Math.floor(Math.random() * 1e9),
        lips_expression: Math.round(lipsExpression * 10) / 10,
        inference_steps: 20,
      },
    },
    "6": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["5", 0],
        // Mux the speech audio into the output video
        audio: ["5", 1],
        frame_rate: 25,
        loop_count: 0,
        filename_prefix: String(params.output_prefix ?? "talking-avatar"),
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
      },
    },
  };
}

/**
 * Blog Hero Image — wide SDXL illustration with headline space.
 */
function buildBlogHeroPrompt(params: Record<string, unknown>): Record<string, unknown> {
  const topic = String(params.prompt ?? "modern workspace");
  const brandStyle = String(params.brand_style ?? "flat-pastel");
  const textSpace = String(params.text_space ?? "left");

  const styleText: Record<string, string> = {
    "flat-pastel":    "flat design illustration, soft pastel brand colors, subtle gradients",
    "bold-editorial": "bold editorial illustration, strong shapes, confident color blocking",
    "soft-3d":        "soft 3D render style, rounded shapes, gentle studio lighting",
    "line-art":       "elegant line art illustration, minimal color accents, clean strokes",
  };
  const spaceText: Record<string, string> = {
    left:   "generous negative space on the left side for headline text",
    right:  "generous negative space on the right side for headline text",
    center: "generous negative space in the center for headline text",
    none:   "full-bleed composition",
  };

  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: String(params.checkpoint ?? "sd_xl_base_1.0.safetensors") } },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: `clean modern blog hero illustration about ${topic}, ${styleText[brandStyle] ?? styleText["flat-pastel"]}, ${spaceText[textSpace] ?? spaceText["left"]}, wide 16:9 composition`,
        clip: ["1", 1],
      },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "photo-realistic, cluttered, busy, text, words, letters, watermark, low quality", clip: ["1", 1] },
    },
    "4": { class_type: "EmptyLatentImage", inputs: { width: 1344, height: 768, batch_size: 1 } },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 1e9),
        steps: 30,
        cfg: 7,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "blog-hero" } },
  };
}

/**
 * Lip Sync — LatentSync graph.
 * Uses the same supported node pack and checkpoints as Talking Avatar.
 */
function buildLipSyncPrompt(params: Record<string, unknown>): Record<string, unknown> {
  const faceImage = String(params.face_image ?? "");
  const audioFile = String(params.audio_file ?? "");
  return buildTalkingAvatarPrompt({
    portrait_image: faceImage,
    speech_audio: audioFile,
    expression_scale: params.expression_scale ?? 50,
    output_prefix: "lip-sync",
  });
}
export default router;

/**
 * Image to Video — Stable Video Diffusion.
 * source_image → LoadImage → SVD_img2vid_Conditioning → VideoLinearCFGGuidance
 */
function buildImg2VidPrompt(params: Record<string, unknown>): Record<string, unknown> {
  const sourceImage = String(params.source_image ?? "");
  const motionBucketId = Number(params.motion_bucket_id ?? 127);
  const fps = Number(params.fps ?? 6);
  const numFrames = Number(params.num_frames ?? 25);

  return {
    "1": {
      class_type: "LoadImage",
      inputs: { image: sourceImage, upload: "image" },
    },
    "2": {
      class_type: "ImageScale",
      inputs: { image: ["1", 0], upscale_method: "lanczos", width: 1024, height: 576, crop: "center" },
    },
    "3": {
      class_type: "ImageToMask",
      inputs: { image: ["2", 0], channel: "red" },
    },
    "4": {
      class_type: "SVD_img2vid_Conditioning",
      inputs: {
        clip_vision: ["5", 0],
        init_image: ["2", 0],
        vae: ["5", 2],
        width: 1024,
        height: 576,
        video_frames: numFrames,
        motion_bucket_id: motionBucketId,
        fps: fps,
        augmentation_level: 0.0,
      },
    },
    "5": {
      class_type: "ImageOnlyCheckpointLoader",
      inputs: { ckpt_name: String(params.checkpoint ?? "svd_xt_1_1.safetensors") },
    },
    "6": {
      class_type: "VideoLinearCFGGuidance",
      inputs: { model: ["5", 0], min_cfg: 1.0 },
    },
    "7": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "8": {
      class_type: "SamplerCustom",
      inputs: {
        model: ["6", 0],
        add_noise: true,
        noise_seed: Math.floor(Math.random() * 1e9),
        cfg: 2.5,
        positive: ["4", 0],
        negative: ["4", 1],
        sampler: ["7", 0],
        sigmas: ["9", 0],
        latent_image: ["4", 2],
      },
    },
    "9": {
      class_type: "BasicScheduler",
      inputs: { model: ["6", 0], scheduler: "karras", steps: 20, denoise: 1.0 },
    },
    "10": {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["5", 2] },
    },
    "11": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["10", 0],
        frame_rate: fps,
        loop_count: 0,
        filename_prefix: "img2vid",
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
      },
    },
  };
}

/**
 * Text to Video — generic KSampler-based txt2vid graph.
 */
function buildTxt2VidPrompt(params: Record<string, unknown>): Record<string, unknown> {
  return buildGenericPrompt("video-generation-txt2vid", params);
}

/**
 * Fallback generic prompt used for unknown workflow IDs.
 */
function buildGenericPrompt(workflowId: string, params: Record<string, unknown>): Record<string, unknown> {
  return {
    "1": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 1e9),
        steps: Number(params.steps ?? 25),
        cfg: 7.5,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1.0,
        model: ["2", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
      },
    },
    "2": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: String(params.checkpoint ?? "v1-5-pruned-emaonly.safetensors"),
      },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: String(params.prompt ?? workflowId),
        clip: ["2", 1],
      },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: String(params.negative_prompt ?? "blurry, low quality"),
        clip: ["2", 1],
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: Number(params.width ?? 512),
        height: Number(params.height ?? 512),
        batch_size: 1,
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["1", 0], vae: ["2", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: `comfyui-studio-${workflowId}` },
    },
  };
}

/**
 * Motion Control (AnimateDiff) — animates a still image.
 * Requires AnimateDiff-Evolved ComfyUI extension.
 * source_image → LoadImage → SVD/AnimateDiff conditioning pipeline
 */
function buildMotionControlPrompt(params: Record<string, unknown>): Record<string, unknown> {
  const sourceImage = String(params.source_image ?? "");
  const motionPreset = String(params.motion_preset ?? "zoom-in");
  const motionStrength = Number(params.motion_strength ?? 50) / 100;
  const numFrames = Number(params.num_frames ?? 16);
  const prompt = String(params.prompt ?? `${motionPreset} camera motion`);
  const aspect = String(params.aspect_ratio ?? "16:9");
  const dimensions: Record<string, { width: number; height: number }> = {
    "16:9": { width: 512, height: 288 },
    "9:16": { width: 288, height: 512 },
    "1:1": { width: 512, height: 512 },
  };
  const frame = dimensions[aspect] ?? dimensions["16:9"]!;
  const colorGrade = String(params.color_grade ?? "teal-orange");
  const colorGrades: Record<string, { temperature: number; saturation: number; contrast: number }> = {
    "teal-orange": { temperature: -12, saturation: -8, contrast: 14 },
    "warm-vintage": { temperature: 18, saturation: -15, contrast: 6 },
    "cold-thriller": { temperature: -25, saturation: -20, contrast: 18 },
  };
  const grade = colorGrades[colorGrade] ?? colorGrades["teal-orange"]!;
  const captionTreatment = String(params.caption_treatment ?? "none");
  const seed = Number.isFinite(Number(params.seed)) ? Number(params.seed) : Math.floor(Math.random() * 1e9);

  return {
    "1": {
      class_type: "LoadImage",
      inputs: { image: sourceImage, upload: "image" },
    },
    "1b": {
      class_type: "ImageScale",
      inputs: { image: ["1", 0], upscale_method: "lanczos", width: frame.width, height: frame.height, crop: "center" },
    },
    "2": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: String(params.checkpoint ?? "v1-5-pruned-emaonly.safetensors") },
    },
    "3": {
      class_type: "ADE_LoadAnimateDiffModel",
      inputs: { model_name: "mm_sd_v15_v2.ckpt" },
    },
    "4": {
      class_type: "ADE_UseEvolvedSampling",
      inputs: {
        model: ["2", 0],
        m_models: ["3", 0],
        context_options: ["5", 0],
      },
    },
    "5": {
      class_type: "ADE_StandardStaticContextOptions",
      inputs: { context_length: numFrames, context_stride: 1, context_overlap: 4, closed_loop: false },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry, low quality, distorted", clip: ["2", 1] },
    },
    "8": {
      class_type: "VAEEncode",
      inputs: { pixels: ["1b", 0], vae: ["2", 2] },
    },
    "9": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: 20,
        cfg: 7.5,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: motionStrength,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["8", 0],
      },
    },
    "10": {
      class_type: "VAEDecode",
      inputs: { samples: ["9", 0], vae: ["2", 2] },
    },
    "10b": {
      class_type: "ColorCorrect",
      inputs: {
        image: ["10", 0],
        temperature: grade.temperature,
        hue: 0,
        brightness: 0,
        contrast: grade.contrast,
        saturation: grade.saturation,
        gamma: captionTreatment === "safe-lower-third" ? 1.03 : 1.0,
      },
    },
    "11": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["10b", 0],
        frame_rate: 8,
        loop_count: 0,
        filename_prefix: `motion-control-${motionPreset}`,
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
      },
    },
  };
}

/**
 * Perform Anywhere angle still — SDXL plus five reference images through
 * IPAdapter Plus. Each batch child changes only the camera treatment, keeping
 * the identity, wardrobe, location, pose, and prop anchors stable.
 *
 * Requires ComfyUI_IPAdapter_plus and its SDXL IP-Adapter / CLIP Vision files.
 */
function buildPerformAnywhereAnglePrompt(params: Record<string, unknown>): Record<string, unknown> {
  const identity = String(params.identity_image ?? "");
  const outfit = String(params.outfit_image ?? "");
  const location = String(params.location_image ?? "");
  const pose = String(params.pose_image ?? "");
  const prop = String(params.prop_image ?? "");
  const camera = String(params.camera_treatment ?? "wide shot");
  const scenePrompt = String(params.scene_prompt ?? params.prompt ?? "cinematic performance scene");
  const style = String(params.style_anchor ?? "photorealistic cinematic lighting, natural skin texture, shallow depth of field");
  const aspect = String(params.aspect_ratio ?? "16:9");
  const dims: Record<string, { width: number; height: number }> = {
    "16:9": { width: 1024, height: 576 },
    "9:16": { width: 576, height: 1024 },
    "1:1": { width: 768, height: 768 },
  };
  const frame = dims[aspect] ?? dims["16:9"]!;
  const seed = Number.isFinite(Number(params.seed)) ? Number(params.seed) : Math.floor(Math.random() * 1e9);
  const prompt = [
    scenePrompt,
    style,
    `camera treatment: ${camera}`,
    "preserve the same performer identity, facial structure, outfit, environment, and prop",
    "professional music-video still, ARRI Alexa 35, Cooke anamorphic lens, cinematic color science, realistic optical depth",
    "high-fidelity skin texture, natural highlights, accurate anatomy, no text or logos",
  ].join(", ");

  return {
    "1": { class_type: "LoadImage", inputs: { image: identity, upload: "image" } },
    "2": { class_type: "LoadImage", inputs: { image: outfit, upload: "image" } },
    "3": { class_type: "LoadImage", inputs: { image: location, upload: "image" } },
    "4": { class_type: "LoadImage", inputs: { image: pose, upload: "image" } },
    "5": { class_type: "LoadImage", inputs: { image: prop, upload: "image" } },
    "6": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: String(params.checkpoint ?? "sd_xl_base_1.0.safetensors") },
    },
    "7": {
      class_type: "IPAdapterModelLoader",
      inputs: { ipadapter_file: String(params.ipadapter_model ?? "ip-adapter-plus_sdxl_vit-h.safetensors") },
    },
    "8": {
      class_type: "CLIPVisionLoader",
      inputs: { clip_name: String(params.clip_vision_model ?? "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors") },
    },
    "9": { class_type: "CLIPVisionEncode", inputs: { clip: ["8", 0], image: ["1", 0], crop: "center" } },
    "10": { class_type: "CLIPVisionEncode", inputs: { clip: ["8", 0], image: ["2", 0], crop: "center" } },
    "11": { class_type: "CLIPVisionEncode", inputs: { clip: ["8", 0], image: ["3", 0], crop: "center" } },
    "12": { class_type: "CLIPVisionEncode", inputs: { clip: ["8", 0], image: ["4", 0], crop: "center" } },
    "13": { class_type: "CLIPVisionEncode", inputs: { clip: ["8", 0], image: ["5", 0], crop: "center" } },
    "14": {
      class_type: "IPAdapterAdvanced",
      inputs: {
        model: ["6", 0],
        ipadapter: ["7", 0],
        image: ["9", 0],
        weight: 0.9,
        weight_type: "strong",
        combine_embeds: "concat",
        start_at: 0,
        end_at: 1,
        embeds_scaling: "V only",
      },
    },
    "15": {
      class_type: "IPAdapterAdvanced",
      inputs: {
        model: ["14", 0],
        ipadapter: ["7", 0],
        image: ["10", 0],
        weight: 0.55,
        weight_type: "style transfer",
        combine_embeds: "concat",
        start_at: 0,
        end_at: 1,
        embeds_scaling: "V only",
      },
    },
    "16": {
      class_type: "IPAdapterAdvanced",
      inputs: {
        model: ["15", 0],
        ipadapter: ["7", 0],
        image: ["11", 0],
        weight: 0.55,
        weight_type: "style transfer",
        combine_embeds: "concat",
        start_at: 0,
        end_at: 1,
        embeds_scaling: "V only",
      },
    },
    "17": {
      class_type: "IPAdapterAdvanced",
      inputs: {
        model: ["16", 0],
        ipadapter: ["7", 0],
        image: ["12", 0],
        weight: 0.45,
        weight_type: "composition",
        combine_embeds: "concat",
        start_at: 0,
        end_at: 1,
        embeds_scaling: "V only",
      },
    },
    "18": {
      class_type: "IPAdapterAdvanced",
      inputs: {
        model: ["17", 0],
        ipadapter: ["7", 0],
        image: ["13", 0],
        weight: 0.4,
        weight_type: "style transfer",
        combine_embeds: "concat",
        start_at: 0,
        end_at: 1,
        embeds_scaling: "V only",
      },
    },
    "19": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["6", 1] } },
    "20": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "different person, changed outfit, warped face, duplicate subject, bad hands, extra limbs, distorted vehicle, text, watermark, logo, blurry, low quality",
        clip: ["6", 1],
      },
    },
    "21": { class_type: "EmptyLatentImage", inputs: { width: frame.width, height: frame.height, batch_size: 1 } },
    "22": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: 30,
        cfg: 6.5,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1,
        model: ["18", 0],
        positive: ["19", 0],
        negative: ["20", 0],
        latent_image: ["21", 0],
      },
    },
    "23": { class_type: "VAEDecode", inputs: { samples: ["22", 0], vae: ["6", 2] } },
    "24": {
      class_type: "SaveImage",
      inputs: { images: ["23", 0], filename_prefix: `perform-anywhere-${camera.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` },
    },
  };
}

/**
 * Perform Anywhere motion transfer — MimicMotion driven by the user's
 * original performance recording. This preserves movement while changing the
 * visual world from the selected generated still.
 */
function buildPerformAnywhereMotionPrompt(params: Record<string, unknown>): Record<string, unknown> {
  const sourceImage = String(params.source_image ?? "");
  const performanceVideo = String(params.performance_video ?? "");
  const context = String(params.motion_context ?? "a performer moving naturally inside the scene");
  const numFrames = Math.min(Math.max(Number(params.num_frames ?? 48), 16), 72);
  const aspect = String(params.aspect_ratio ?? "16:9");
  const dims: Record<string, { width: number; height: number }> = {
    "16:9": { width: 576, height: 324 },
    "9:16": { width: 576, height: 1024 },
    "1:1": { width: 576, height: 576 },
  };
  const frame = dims[aspect] ?? dims["16:9"]!;

  return {
    "1": {
      class_type: "LoadImage",
      inputs: { image: sourceImage, upload: "image" },
    },
    "1b": {
      class_type: "ImageScale",
      inputs: { image: ["1", 0], upscale_method: "lanczos", width: frame.width, height: frame.height, crop: "center" },
    },
    "2": {
      class_type: "VHS_LoadVideo",
      inputs: {
        video: performanceVideo,
        force_rate: 15,
        custom_width: frame.width,
        custom_height: frame.height,
        frame_load_cap: numFrames,
        skip_first_frames: 0,
        select_every_nth: 1,
      },
    },
    "3": {
      class_type: "DownloadAndLoadMimicMotionModel",
      inputs: { model: "MimicMotionMergedUnet_1-1-fp16.safetensors", precision: "fp16" },
    },
    "4": {
      class_type: "MimicMotionGetPoses",
      inputs: {
        ref_image: ["1b", 0],
        pose_images: ["2", 0],
        include_body: true,
        include_hand: true,
        include_face: true,
      },
    },
    "5": {
      class_type: "MimicMotionSampler",
      inputs: {
        mimic_pipeline: ["3", 0],
        ref_image: ["1b", 0],
        pose_images: ["4", 1],
        steps: 25,
        cfg_min: 2,
        cfg_max: 2,
        seed: Number.isFinite(Number(params.seed)) ? Number(params.seed) : Math.floor(Math.random() * 1e9),
        fps: 15,
        noise_aug_strength: 0,
        context_size: 16,
        context_overlap: 6,
        keep_model_loaded: true,
        prompt: context,
      },
    },
    "6": {
      class_type: "MimicMotionDecode",
      inputs: { mimic_pipeline: ["3", 0], samples: ["5", 0], decode_chunk_size: 4 },
    },
    "7": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["6", 0],
        frame_rate: 15,
        loop_count: 0,
        filename_prefix: "perform-anywhere-motion",
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
      },
    },
  };
}
