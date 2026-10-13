import { Router, type IRouter } from "express";
import { Readable } from "node:stream";
import { db, jobsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "../lib/access-control";
import { falMotionReady, isFalMotion } from "../lib/fal-motion";
import { getModelArkReadiness } from "../lib/modelark";
import { getConfiguredWorkers } from "./settings";
import { fetchComfy } from "./comfy";
import { ObjectStorageService } from "../lib/object-storage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
router.get("/motion/providers", async (_req, res): Promise<void> => {
  const [falReady, workers] = await Promise.all([falMotionReady(), getConfiguredWorkers()]);
  const required = ["LoadImage", "ImageScale", "VHS_LoadVideo", "DownloadAndLoadMimicMotionModel", "MimicMotionGetPoses", "MimicMotionSampler", "MimicMotionDecode", "VHS_VideoCombine"];
  const localReady = await Promise.all(workers.map(async (worker) => {
    try {
      const r = await fetchComfy(worker.url, "/object_info", { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return false;
      const info = await r.json() as Record<string, unknown>;
      return required.every((key) => Object.hasOwn(info, key));
    } catch { return false; }
  }));
  const seedance = getModelArkReadiness().configured;
  const mimic = localReady.some(Boolean);
  res.setHeader("Cache-Control", "private, no-store");
  res.json([
    { id: "seedance", name: "Seedance", ready: seedance, message: seedance ? "ModelArk configured; billed by your provider." : "ModelArk is not configured.", inputKind: "video", directDepth: false },
    { id: "mimicmotion", name: "MimicMotion", ready: mimic, message: mimic ? "MimicMotion nodes available; uses your GPU time." : "Connect a ComfyUI worker with MimicMotion and VideoHelperSuite.", inputKind: "video", directDepth: false },
    { id: "kling", name: "Kling Motion Control", ready: falReady, message: falReady ? "fal.ai connected; video motion reference, up to 30 seconds. Provider fees apply." : "Connect fal.ai to enable Kling.", inputKind: "video", directDepth: false },
    { id: "omnihuman", name: "OmniHuman 1.5", ready: falReady, message: falReady ? "fal.ai connected; requires audio under 60 seconds at 720p. Provider fees apply." : "Connect fal.ai to enable OmniHuman.", inputKind: "audio", directDepth: false },
  ]);
});
router.get("/motion/outputs/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid output." }); return; }
  const [job] = await db.select().from(jobsTable).where(and(eq(jobsTable.id, id), eq(jobsTable.ownerId, getAuthenticatedUserId(res))));
  const objectPath = (job?.params as Record<string, unknown> | undefined)?._falObjectPath;
  if (!job || !isFalMotion(job.workflowId) || job.status !== "completed" || typeof objectPath !== "string" || !/^\/objects\/uploads\/[a-f0-9-]{36}$/i.test(objectPath)) { res.status(404).json({ error: "Output not found." }); return; }
  try {
    const response = await storage.downloadObject(await storage.getObjectEntityFile(objectPath));
    if (!response.ok || !response.body) throw new Error("Output unavailable.");
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "private, no-store");
    Readable.fromWeb(response.body as never).on("error", () => res.destroy()).pipe(res);
  } catch { res.status(502).json({ error: "Could not load the saved output." }); }
});
export default router;
