import { Router, type IRouter } from "express";
import {
  getOrCreateVastWorker,
  getVastAutoscalerStatus,
  stopVastAutoscaler,
  updateVastAutoscaleConfig,
} from "../lib/vast-autoscaler";

const router: IRouter = Router();

router.get("/gpu/vast/autoscaler", async (_req, res): Promise<void> => {
  res.json(await getVastAutoscalerStatus());
});

router.put("/gpu/vast/autoscaler", async (req, res): Promise<void> => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "Configuration must be an object." });
    return;
  }
  const config = await updateVastAutoscaleConfig(req.body);
  res.json({ config, ...(await getVastAutoscalerStatus()) });
});

router.post("/gpu/vast/autoscaler/start", async (req, res): Promise<void> => {
  try {
    const worker = await getOrCreateVastWorker();
    if (!worker) {
      res.status(409).json({ error: "Enable Vast.ai autoscaling before starting a worker." });
      return;
    }
    res.json({ worker, ...(await getVastAutoscalerStatus()) });
  } catch (error) {
    req.log.error({ err: error }, "Could not start Vast autoscale worker");
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not start Vast.ai worker." });
  }
});

router.post("/gpu/vast/autoscaler/stop", async (req, res): Promise<void> => {
  try {
    await stopVastAutoscaler();
    res.json(await getVastAutoscalerStatus());
  } catch (error) {
    req.log.error({ err: error }, "Could not stop Vast autoscale worker");
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not stop Vast.ai worker." });
  }
});

export default router;