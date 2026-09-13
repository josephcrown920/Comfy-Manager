import { Router, type IRouter } from "express";
import healthRouter from "./health";
import freeGpuRouter from "./free-gpu";
import settingsRouter from "./settings";
import comfyRouter from "./comfy";
import workflowsRouter from "./workflows";
import jobsRouter from "./jobs";
import outputsRouter from "./outputs";
import filesRouter from "./files";
import modelAssignmentsRouter from "./model-assignments";
import savedWorkflowsRouter from "./saved-workflows";
import assistantRouter from "./assistant";
import batchesRouter from "./batches";
import modelarkRouter from "./modelark";
import videoAgentRouter from "./video-agent";
import grwmRouter from "./grwm";
import runpodRouter from "./runpod";
import { getComfyUrl } from "./settings";
import { db, jobsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { fetchComfy } from "./comfy";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdmin, getAuthenticatedUserId } from "../lib/access-control";

const router: IRouter = Router();
router.use(healthRouter);
router.use(freeGpuRouter);
router.use(requireAuth);
router.use(requireAdmin, settingsRouter);
router.use(comfyRouter);
router.use(workflowsRouter);
router.use(jobsRouter);
router.use(outputsRouter);
router.use(filesRouter);
router.use(requireAdmin, modelAssignmentsRouter);
router.use(savedWorkflowsRouter);
router.use(assistantRouter);
router.use(batchesRouter);
router.use(modelarkRouter);
router.use(videoAgentRouter);
router.use(grwmRouter);
router.use(runpodRouter);

router.get("/comfy/view", async (req, res): Promise<void> => {
  const { filename, subfolder, type, jobId } = req.query as Record<string, string>;
  const userId = getAuthenticatedUserId(res);
  let comfyUrl = await getComfyUrl();
  if (jobId && Number.isFinite(Number(jobId))) {
    const [job] = await db.select({ workerUrl: jobsTable.workerUrl }).from(jobsTable).where(and(eq(jobsTable.id, Number(jobId)), eq(jobsTable.ownerId, userId))).limit(1);
    if (!job) { res.status(404).json({ error: "Output not found" }); return; }
    if (job.workerUrl) comfyUrl = job.workerUrl;
  } else if (type !== "input") {
    res.status(400).json({ error: "A job id is required for generated outputs." }); return;
  }
  const viewPath = `/view?filename=${encodeURIComponent(filename ?? "")}&subfolder=${encodeURIComponent(subfolder ?? "")}&type=${encodeURIComponent(type ?? "output")}`;
  try {
    const r = await fetchComfy(comfyUrl, viewPath, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { res.status(r.status).json({ error: "File not found" }); return; }
    res.setHeader("Content-Type", r.headers.get("content-type") ?? "application/octet-stream");
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch { res.status(502).json({ error: "Could not fetch from ComfyUI" }); }
});

export default router;
