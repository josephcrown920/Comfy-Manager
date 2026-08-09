import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import comfyRouter from "./comfy";
import workflowsRouter from "./workflows";
import jobsRouter from "./jobs";
import outputsRouter from "./outputs";
import filesRouter from "./files";
import modelAssignmentsRouter from "./model-assignments";
import savedWorkflowsRouter from "./saved-workflows";
import assistantRouter from "./assistant";
import { getComfyUrl } from "./settings";
import { fetchComfy } from "./comfy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(comfyRouter);
router.use(workflowsRouter);
router.use(jobsRouter);
router.use(outputsRouter);
router.use(filesRouter);
router.use(modelAssignmentsRouter);
router.use(savedWorkflowsRouter);
router.use(assistantRouter);

// Proxy ComfyUI view requests (for serving generated images/videos)
router.get("/comfy/view", async (req, res): Promise<void> => {
  const comfyUrl = await getComfyUrl();
  const { filename, subfolder, type } = req.query as Record<string, string>;
  const path = `/view?filename=${encodeURIComponent(filename ?? "")}&subfolder=${encodeURIComponent(subfolder ?? "")}&type=${encodeURIComponent(type ?? "output")}`;
  try {
    const r = await fetchComfy(comfyUrl, path, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) {
      res.status(r.status).json({ error: "File not found" });
      return;
    }
    const contentType = r.headers.get("content-type") ?? "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    const buffer = await r.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(502).json({ error: "Could not fetch from ComfyUI" });
  }
});

export default router;
