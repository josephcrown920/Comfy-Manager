import { Router, type IRouter } from "express";
import { Buffer } from "node:buffer";
import { getComfyUrl } from "./settings";
import { fetchComfy } from "./comfy";

const router: IRouter = Router();
const MODELARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const MODELARK_GRWM_MODEL = "dreamina-seedance-2-5-260628";
const MAX_REFERENCE_IMAGES = 8;
const MAX_REFERENCE_VIDEOS = 4;
const MAX_SCENE_REFERENCE_IMAGES = 4;

function getKey(): string {
  const key = process.env.MODELARK_API_KEY?.trim();
  if (!key) throw new Error("ModelArk is not configured. Add MODELARK_API_KEY in Replit Secrets.");
  return key;
}

function filename(value: unknown, label: string): string {
  const name = String(value ?? "").trim();
  if (!name || name.length > 255 || name.includes("\0") || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`${label} is missing or invalid.`);
  }
  return name;
}

async function readInputAsset(name: string, kind: "image" | "video") {
  const comfyUrl = await getComfyUrl();
  const query = new URLSearchParams({ filename: name, subfolder: "", type: "input" });
  const response = await fetchComfy(comfyUrl, `/view?${query.toString()}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Could not read ${kind} upload ${name} from ComfyUI (${response.status}).`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (contentType !== "application/octet-stream" && !contentType.toLowerCase().startsWith(`${kind}/`)) {
    throw new Error(`${name} is not a valid ${kind} upload.`);
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
}

function extension(contentType: string, kind: "image" | "video") {
  const value = contentType.toLowerCase();
  if (value.includes("jpeg")) return "jpg";
  if (value.includes("webp")) return "webp";
  if (value.includes("quicktime")) return "mov";
  return kind === "image" ? "png" : "mp4";
}

async function uploadAsset(asset: { bytes: Buffer; contentType: string }, name: string, kind: "image" | "video") {
  const form = new FormData();
  const bytes = new Uint8Array(asset.bytes.byteLength);
  bytes.set(asset.bytes);
  form.append("file", new Blob([bytes.buffer], { type: asset.contentType }), `${name}.${extension(asset.contentType, kind)}`);
  form.append("purpose", "user_data");
  form.append("expire_at", String(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60));
  if (kind === "video") form.append("preprocess_configs", JSON.stringify({ video: { model: process.env.MODELARK_SEEDANCE_MODEL?.trim() || MODELARK_GRWM_MODEL, fps: 2 } }));

  const response = await fetch(`${process.env.MODELARK_BASE_URL || MODELARK_BASE_URL}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getKey()}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { download_url?: string; status?: string; error?: { message?: string } };
  if (!response.ok || !payload.download_url || payload.status === "failed") {
    throw new Error(`ModelArk upload failed for ${name} (${response.status}): ${payload.error?.message || "file unavailable"}`);
  }
  return payload.download_url;
}

function cleanArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

async function modelArk(path: string, init: RequestInit = {}) {
  return fetch(`${process.env.MODELARK_BASE_URL || MODELARK_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getKey()}`, ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(120_000),
  });
}

router.post("/grwm", async (req, res): Promise<void> => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const performanceVideo = filename(body.performance_video, "GRWM performance video");
    const outfitReference = filename(body.outfit_reference, "New outfit reference");
    const locationReference = body.location_reference ? filename(body.location_reference, "Location reference") : "";
    const referenceImages = cleanArray(body.reference_images);
    const referenceVideos = cleanArray(body.reference_videos);
    const sceneReferenceImages = cleanArray(body.scene_reference_images);
    if (referenceImages.length > MAX_REFERENCE_IMAGES) throw new Error(`You can supply up to ${MAX_REFERENCE_IMAGES} reference photos.`);
    if (referenceVideos.length > MAX_REFERENCE_VIDEOS) throw new Error(`You can supply up to ${MAX_REFERENCE_VIDEOS} reference videos.`);
    if (sceneReferenceImages.length > MAX_SCENE_REFERENCE_IMAGES) throw new Error(`You can supply up to ${MAX_SCENE_REFERENCE_IMAGES} scene reference images.`);

    const [performance, outfit, location, imageAssets, videoAssets, sceneAssets] = await Promise.all([
      readInputAsset(performanceVideo, "video"),
      readInputAsset(outfitReference, "image"),
      locationReference ? readInputAsset(locationReference, "image") : null,
      Promise.all(referenceImages.map((item) => readInputAsset(filename(item, "Reference image"), "image"))),
      Promise.all(referenceVideos.map((item) => readInputAsset(filename(item, "Reference video"), "video"))),
      Promise.all(sceneReferenceImages.map((item) => readInputAsset(filename(item, "Scene reference image"), "image"))),
    ]);

    const [performanceUrl, outfitUrl, locationUrl, imageUrls, videoUrls, sceneUrls] = await Promise.all([
      uploadAsset(performance, "grwm-performance", "video"),
      uploadAsset(outfit, "grwm-outfit", "image"),
      location ? uploadAsset(location, "grwm-location", "image") : null,
      Promise.all(imageAssets.map((asset, i) => uploadAsset(asset, `grwm-reference-${i + 1}`, "image"))),
      Promise.all(videoAssets.map((asset, i) => uploadAsset(asset, `grwm-motion-reference-${i + 1}`, "video"))),
      Promise.all(sceneAssets.map((asset, i) => uploadAsset(asset, `grwm-scene-reference-${i + 1}`, "image"))),
    ]);

    const scenePrompt = String(body.scene_prompt || "").trim();
    const motionContext = String(body.motion_context || "getting ready naturally, preserving the original gestures, pacing, and performance").trim();
    const outfitInstruction = String(body.outfit_instruction || "Apply the supplied new outfit consistently from the first frame to the last.").trim();
    const prompt = [
      "Create a cinematic Get Ready With Me video from the supplied original performance video.",
      "The original performance video is the primary motion, action, gesture, timing, and camera-performance anchor.",
      "Preserve the same person's identity, facial features, body proportions, hands, natural gestures, and performance beats.",
      "Use the supplied reference photos as identity, styling, product, and visual-continuity references.",
      "Use the supplied reference videos as secondary motion, framing, transition, and treatment references; do not replace the user's original performance.",
      locationUrl ? "The supplied location reference is the target environment. Replace the original location with this environment while preserving the performer, performance, camera intent, and coherent lighting." : "If no location reference is supplied, preserve the original environment unless the scene direction requests a different setting.",
      sceneUrls.length ? "The supplied scene reference images are production-design references for the target environment, architecture, set dressing, composition, lighting, and atmosphere. Use them to build a coherent new scene rather than copying unrelated subjects." : "Scene references are optional; use the scene/look direction to guide production design when provided.",
      `The supplied outfit reference is the wardrobe source. ${outfitInstruction}`,
      scenePrompt ? `Scene/look direction: ${scenePrompt}` : "Keep the scene polished, coherent, cinematic, and recognizably based on the original GRWM.",
      `Motion direction: ${motionContext}`,
      "Do not introduce unrelated people. Do not change the performer into another identity. Keep face, hair, hands, wardrobe, lighting, and environment temporally consistent.",
    ].join(" ");

    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    for (const url of imageUrls) content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    for (const url of sceneUrls) content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    if (locationUrl) content.push({ type: "image_url", image_url: { url: locationUrl }, role: "reference_image" });
    content.push({ type: "image_url", image_url: { url: outfitUrl }, role: "reference_image" });
    content.push({ type: "video_url", video_url: { url: performanceUrl }, role: "reference_video" });
    for (const url of videoUrls) content.push({ type: "video_url", video_url: { url }, role: "reference_video" });

    const model = String(body.model || process.env.MODELARK_SEEDANCE_MODEL || MODELARK_GRWM_MODEL).trim();
    const ratio = String(body.ratio || body.aspect_ratio || "9:16");
    const resolution = String(body.resolution || "720p");
    const duration = Math.min(Math.max(Number(body.duration ?? 8), 2), 15);
    const generateAudio = body.generate_audio === true || body.generate_audio === "true";
    if (!/^(16:9|9:16|1:1)$/.test(ratio)) throw new Error("GRWM ratio must be 16:9, 9:16, or 1:1.");
    if (!/^(480p|720p|1080p)$/.test(resolution)) throw new Error("GRWM resolution must be 480p, 720p, or 1080p.");

    const response = await modelArk("/contents/generations/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, content, generate_audio: generateAudio, ratio, resolution, duration, watermark: false, camera_fixed: false }),
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string; status?: string; content?: unknown; error?: { message?: string } };
    if (!response.ok || !payload.id) throw new Error(`ModelArk GRWM generation failed (${response.status}): ${payload.error?.message || "unknown error"}`);
    res.status(201).json({ workflowId: "get-ready-with-me", provider: "modelark", taskId: payload.id, status: payload.status || "queued", model, ratio, resolution, duration });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not start the Get Ready With Me workflow." });
  }
});

router.get("/grwm/status/:taskId", async (req, res): Promise<void> => {
  const taskId = String(req.params.taskId || "").trim();
  if (!taskId || !/^[a-zA-Z0-9._:-]{1,200}$/.test(taskId)) { res.status(400).json({ error: "Invalid ModelArk task ID." }); return; }
  try {
    const response = await modelArk(`/contents/generations/tasks/${encodeURIComponent(taskId)}`);
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) { res.status(502).json({ error: "Could not read the GRWM task status." }); return; }
    res.json({ workflowId: "get-ready-with-me", taskId, ...payload });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not read the GRWM task status." });
  }
});

export default router;
