import { Router, type IRouter } from "express";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { ENVIRONMENT_PRESETS, getEnvironmentMedia, listAvailableEnvironments } from "../lib/environment-catalog";
import { ObjectStorageService } from "../lib/object-storage";
import { recordInputOwner } from "../lib/perform-media";
import { getAuthenticatedUserId } from "../lib/access-control";
import { fetchComfy } from "./comfy";
import { getComfyUrl } from "./settings";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const attachmentLimits = new Map<string, { count: number; until: number }>();
router.get("/environments", async (_req, res): Promise<void> => {
  try { res.json(await listAvailableEnvironments()); }
  catch { res.status(503).json({ error: "The environment library is temporarily unavailable." }); }
});
router.get("/environments/:id/image", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  if (!ENVIRONMENT_PRESETS.some((p) => p.id === id)) { res.sendStatus(404); return; }
  try {
    const media = (await getEnvironmentMedia())[id];
    if (!media) { res.sendStatus(404); return; }
    const response = await storage.downloadObject(await storage.getObjectEntityFile(media.objectPath));
    if (!response.ok || !response.body) throw new Error("Missing image.");
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "private, max-age=3600");
    Readable.fromWeb(response.body as never).on("error", () => res.destroy()).pipe(res);
  } catch { res.status(502).json({ error: "Environment image is temporarily unavailable." }); }
});
router.post("/environments/:id/attach", async (req, res): Promise<void> => {
  const ownerId = getAuthenticatedUserId(res);
  const id = String(req.params.id);
  if (!ENVIRONMENT_PRESETS.some((p) => p.id === id)) { res.status(404).json({ error: "Environment not found." }); return; }
  const now = Date.now();
  for (const [key, value] of attachmentLimits) if (value.until <= now) attachmentLimits.delete(key);
  const limit = attachmentLimits.get(ownerId) ?? { count: 0, until: now + 60000 };
  if (limit.count >= 10) { res.status(429).json({ error: "Please wait a minute before choosing another environment." }); return; }
  limit.count += 1; attachmentLimits.set(ownerId, limit);
  try {
    const media = (await getEnvironmentMedia())[id];
    if (!media) { res.status(404).json({ error: "This environment is not available yet." }); return; }
    const source = await storage.downloadObject(await storage.getObjectEntityFile(media.objectPath));
    const bytes = new Uint8Array(await source.arrayBuffer());
    if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("Environment image exceeds the safety limit.");
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/webp" }), `${randomUUID()}-environment-${id}.webp`);
    form.append("type", "input");
    const workerUrl = await getComfyUrl();
    const response = await fetchComfy(workerUrl, "/upload/image", { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
    if (!response.ok) { res.status(502).json({ error: "Connect your ComfyUI worker before using an environment. Its image must be uploaded to the execution backend." }); return; }
    const data = await response.json() as { name: string; subfolder?: string; type?: string };
    await recordInputOwner(data.name, ownerId, data.subfolder ?? "", "image/webp", workerUrl);
    res.json({ name: data.name, subfolder: data.subfolder ?? "", type: data.type ?? "input" });
  } catch { res.status(502).json({ error: "Could not attach the environment. Check your ComfyUI connection and try again." }); }
});
export default router;
