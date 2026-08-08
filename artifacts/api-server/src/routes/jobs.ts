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
import { getComfyUrl, } from "./settings";
import { fetchComfy } from "./comfy";

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

  // Build a simple ComfyUI API prompt for the workflow
  const comfyPrompt = buildComfyPrompt(workflowId, params as Record<string, unknown>);

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

  const [job] = await db
    .insert(jobsTable)
    .values({
      workflowId,
      workflowName: workflow.name,
      status: initialStatus,
      params,
      comfyPromptId,
      progress: 0,
    })
    .returning();

  res.status(201).json(CreateJobResponse.parse(buildJobOutput(job, [])));
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
  const params = DeleteJobParams.safeParse(req.params);
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

// Simple ComfyUI prompt builder — returns a minimal API workflow JSON
function buildComfyPrompt(
  workflowId: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  // Generic passthrough prompt — real workflow JSON depends on user's ComfyUI setup
  // This sends the params as metadata; users can customize workflows on their ComfyUI
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

export default router;
