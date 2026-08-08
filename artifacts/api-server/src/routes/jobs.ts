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
  const workflow = WORKFLOWS.find((w) => w.id === workflowId);
  if (!workflow) {
    res.status(400).json({ error: "Unknown workflow: " + workflowId });
    return;
  }

    const comfyUrl = await getComfyUrl();
  const assignments = await getModelAssignments();

  // Resolve checkpoint: per-workflow setting > global setting > param > default
  const wfAssignment = assignments.workflows[workflowId];
  const primaryCheckpoint =
    wfAssignment?.checkpoint ||
    assignments.global.checkpoint ||
    String((params as Record<string, unknown>).checkpoint ?? "v1-5-pruned-emaonly.safetensors");
  const fallbackCheckpoint =
    wfAssignment?.checkpointFallback ||
    assignments.global.checkpointFallback ||
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

  // Build a simple ComfyUI API prompt for the workflow
  const comfyPrompt = buildComfyPrompt(workflowId, {
    ...(params as Record<string, unknown>),
    checkpoint: resolvedCheckpoint,
  });

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

  res.json(CreateJobResponse.parse(buildJobOutput(newJobRow!, [])));
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

  // Poll ComfyUI for updated status
  if (job.comfyPromptId && job.status === "running") {
    const comfyUrl = await getComfyUrl();
    try {
      const histRes = await fetchComfy(
        comfyUrl,
        `/history/${job.comfyPromptId}`
      );
      if (histRes.ok) {
        const hist = (await histRes.json()) as Record<
          string,
          {
            status?: { completed?: boolean; status_str?: string };
            outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
          }
        >;
        const entry = hist[job.comfyPromptId];
        if (entry?.status?.completed) {
          // Collect output files
          const outputFiles: Array<{ filename: string; subfolder: string; type: string }> = [];
          for (const nodeOutput of Object.values(entry.outputs ?? {})) {
            for (const img of nodeOutput.images ?? []) {
              outputFiles.push(img);
            }
          }

          // Save outputs to DB
          for (const f of outputFiles) {
            const ext = f.filename.split(".").pop()?.toLowerCase() ?? "";
            const outputType = ["mp4", "webm", "avi", "mov", "gif"].includes(ext)
              ? "video"
              : ["wav", "mp3", "ogg", "flac"].includes(ext)
              ? "audio"
              : "image";
            await db.insert(outputsTable).values({
              jobId: job.id,
              filename: f.filename,
              subfolder: f.subfolder,
              outputType,
            });
          }

          await db
            .update(jobsTable)
            .set({ status: "completed", progress: 100, completedAt: new Date() })
            .where(eq(jobsTable.id, job.id));
        } else if (entry?.status?.status_str === "error") {
          await db
            .update(jobsTable)
            .set({ status: "failed", errorMessage: "ComfyUI reported an error" })
            .where(eq(jobsTable.id, job.id));
        }
      }
    } catch {
      // Ignore fetch errors
    }
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
function buildComfyPrompt(
  workflowId: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  switch (workflowId) {
    case "lip-sync-basic":
      return buildLipSyncPrompt(params);
    case "motion-control-animatediff":
      return buildMotionControlPrompt(params);
    case "img2vid-stable-video":
      return buildImg2VidPrompt(params);
    case "video-generation-txt2vid":
      return buildTxt2VidPrompt(params);
    default:
      return buildGenericPrompt(workflowId, params);
  }
}

/**
 * Lip Sync — SadTalker-style graph.
 * Requires the SadTalker ComfyUI extension (comfyui-sadtalker or similar).
 * face_image  → LoadImage → SadTalker (portrait input)
 * audio_file  → VHS_LoadAudio → SadTalker (audio input)
 */
function buildLipSyncPrompt(params: Record<string, unknown>): Record<string, unknown> {
  const faceImage = String(params.face_image ?? "");
  const audioFile = String(params.audio_file ?? "");
  // Audio files are stored under the `audio/` subfolder by the upload endpoint
  const audioPath = audioFile.startsWith("audio/") ? audioFile : `audio/${audioFile}`;

  return {
    "1": {
      class_type: "LoadImage",
      inputs: { image: faceImage, upload: "image" },
    },
    "2": {
      class_type: "VHS_LoadAudio",
      inputs: { audio: audioPath, start_time: 0.0, duration: 0.0 },
    },
    "3": {
      class_type: "SadTalker",
      inputs: {
        source_image: ["1", 0],
        driven_audio: ["2", 0],
        checkpoint: String(params.sadtalker_model ?? "SadTalker_V0.0.2_256.safetensors"),
        size: 256,
        expression_scale: 1.0,
        still_mode: false,
        preprocess: "crop",
      },
    },
    "4": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["3", 0],
        frame_rate: 25,
        loop_count: 0,
        filename_prefix: "lip-sync",
        format: "video/h264-mp4",
        save_output: true,
      },
    },
  };
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
      inputs: { ckpt_name: "svd_xt.safetensors" },
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

  return {
    "1": {
      class_type: "LoadImage",
      inputs: { image: sourceImage, upload: "image" },
    },
    "2": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "v1-5-pruned-emaonly.safetensors" },
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
      inputs: { pixels: ["1", 0], vae: ["2", 2] },
    },
    "9": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 1e9),
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
    "11": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["10", 0],
        frame_rate: 8,
        loop_count: 0,
        filename_prefix: `motion-control-${motionPreset}`,
        format: "video/h264-mp4",
        save_output: true,
      },
    },
  };
}
