import { Buffer } from "node:buffer";
import { fetchComfy } from "../routes/comfy";
import { getComfyUrl } from "../routes/settings";

const MODELARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
export const MODELARK_WORKFLOW_ID = "perform-anywhere-seedance";
export const MODELARK_REFERENCE_WORKFLOW_ID = "modelark-seedance-reference-video";
export const MODELARK_OUTPUT_SUBFOLDER = "modelark";
export const MODELARK_DEFAULT_MODEL = "dreamina-seedance-2-5-260628";

const MODELARK_WORKFLOW_IDS = new Set([
  MODELARK_WORKFLOW_ID,
  MODELARK_REFERENCE_WORKFLOW_ID,
]);
const SUPPORTED_RATIOS = new Set(["16:9", "9:16", "1:1"]);
const SUPPORTED_RESOLUTIONS = new Set(["480p", "720p", "1080p"]);

type ModelArkFile = {
  id?: string;
  download_url?: string;
  status?: string;
  error?: { message?: string };
};

export type ModelArkTask = {
  id?: string;
  status?: string;
  content?: { video_url?: string };
  error?: { message?: string };
};

type MediaKind = "image" | "video" | "audio";

export function isModelArkWorkflow(workflowId: string): boolean {
  return MODELARK_WORKFLOW_IDS.has(workflowId);
}

function getModelArkKey(): string {
  const key = process.env.MODELARK_API_KEY;
  if (!key) {
    throw new Error("ModelArk is not configured. Add MODELARK_API_KEY in Replit Secrets.");
  }
  return key;
}

export function getModelArkReadiness() {
  return {
    configured: Boolean(process.env.MODELARK_API_KEY?.trim()),
    model: process.env.MODELARK_SEEDANCE_MODEL?.trim() || MODELARK_DEFAULT_MODEL,
  };
}

function modelArkHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getModelArkKey()}`,
  };
}

async function modelArkRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${process.env.MODELARK_BASE_URL || MODELARK_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...modelArkHeaders(),
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(120_000),
  });
}

function validateUploadedFilename(value: unknown, label: string): string {
  const filename = String(value ?? "").trim();
  if (!filename || filename.length > 255 || filename.includes("\0")) {
    throw new Error(`${label} is missing or invalid.`);
  }
  if (filename.includes("/") || filename.includes("\\") || filename === "." || filename === "..") {
    throw new Error(`${label} must be an uploaded Studio asset.`);
  }
  return filename;
}

function contentTypeMatches(contentType: string, kind: MediaKind): boolean {
  return contentType.toLowerCase().startsWith(`${kind}/`);
}

async function readComfyInputAsset(
  filename: string,
  kind: MediaKind,
): Promise<{ bytes: Buffer; contentType: string }> {
  const comfyUrl = await getComfyUrl();
  const query = new URLSearchParams({
    filename,
    subfolder: kind === "audio" ? "audio" : "",
    type: "input",
  });
  const response = await fetchComfy(comfyUrl, `/view?${query.toString()}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Could not read the uploaded ComfyUI asset (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (contentType !== "application/octet-stream" && !contentTypeMatches(contentType, kind)) {
    throw new Error(`${filename} is not a valid ${kind} upload.`);
  }

  return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
}

function extensionFor(contentType: string, kind: MediaKind): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("jpeg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mpeg")) return kind === "audio" ? "mp3" : "mp4";
  if (normalized.includes("quicktime")) return "mov";
  return kind === "image" ? "png" : kind === "audio" ? "mp3" : "mp4";
}

async function uploadModelArkFile(
  bytes: Buffer,
  filename: string,
  contentType: string,
  model?: string,
): Promise<ModelArkFile> {
  const formData = new FormData();
  const copiedBytes = new Uint8Array(bytes.byteLength);
  copiedBytes.set(bytes);
  formData.append("file", new Blob([copiedBytes.buffer], { type: contentType }), filename);
  formData.append("purpose", "user_data");
  formData.append("expire_at", String(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60));
  if (model && contentType.startsWith("video/")) {
    formData.append("preprocess_configs", JSON.stringify({ video: { model, fps: 2 } }));
  }

  const response = await modelArkRequest("/files", { method: "POST", body: formData });
  const payload = (await response.json().catch(() => ({}))) as ModelArkFile;
  if (!response.ok) {
    throw new Error(`ModelArk file upload failed (${response.status}): ${payload.error?.message || "unknown error"}`);
  }
  if (payload.status === "failed" || !payload.download_url) {
    throw new Error(`ModelArk could not prepare ${filename}: ${payload.error?.message || "file is unavailable"}`);
  }
  return payload;
}

export async function createSeedanceTask(
  params: Record<string, unknown>,
  workflowId = MODELARK_WORKFLOW_ID,
): Promise<ModelArkTask> {
  const model = String(params.model || process.env.MODELARK_SEEDANCE_MODEL || MODELARK_DEFAULT_MODEL).trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(model)) {
    throw new Error("The configured ModelArk model ID is invalid.");
  }

  const sourceImage = validateUploadedFilename(params.source_image, "Opening image");
  const sourceVideo = validateUploadedFilename(params.source_video, "Reference video");
  const endImage = params.end_image
    ? validateUploadedFilename(params.end_image, "Closing image")
    : "";
  const sourceAudio = params.source_audio
    ? validateUploadedFilename(params.source_audio, "Reference audio")
    : "";
  if (workflowId === MODELARK_REFERENCE_WORKFLOW_ID && (!endImage || !sourceAudio)) {
    throw new Error("Seedance Reference Video requires opening and closing images, a reference video, and reference audio.");
  }
  if (!sourceImage || !sourceVideo) {
    throw new Error("Seedance requires both a selected still and a performance video.");
  }

  const [image, endImageAsset, video, audio] = await Promise.all([
    readComfyInputAsset(sourceImage, "image"),
    endImage ? readComfyInputAsset(endImage, "image") : null,
    readComfyInputAsset(sourceVideo, "video"),
    sourceAudio ? readComfyInputAsset(sourceAudio, "audio") : null,
  ]);
  const [imageFile, endImageFile, videoFile, audioFile] = await Promise.all([
    uploadModelArkFile(image.bytes, `opening-frame.${extensionFor(image.contentType, "image")}`, image.contentType),
    endImageAsset
      ? uploadModelArkFile(endImageAsset.bytes, `closing-frame.${extensionFor(endImageAsset.contentType, "image")}`, endImageAsset.contentType)
      : null,
    uploadModelArkFile(video.bytes, `reference-video.${extensionFor(video.contentType, "video")}`, video.contentType, model),
    audio
      ? uploadModelArkFile(audio.bytes, `reference-audio.${extensionFor(audio.contentType, "audio")}`, audio.contentType)
      : null,
  ]);

  const prompt = String(
    params.motion_context ||
      params.prompt ||
      "Transfer the performance movement naturally onto the performer in the reference image. Preserve identity, wardrobe, vehicle interior, lighting, and camera composition.",
  ).trim();
  if (!prompt || prompt.length > 4000) {
    throw new Error("Seedance direction must be between 1 and 4,000 characters.");
  }
  const duration = Math.min(Math.max(Number(params.duration ?? 5), 2), 15);
  const ratio = String(params.ratio ?? params.aspect_ratio ?? "16:9");
  if (!SUPPORTED_RATIOS.has(ratio)) {
    throw new Error("Seedance aspect ratio must be 16:9, 9:16, or 1:1.");
  }
  const resolution = String(params.resolution ?? "720p");
  if (!SUPPORTED_RESOLUTIONS.has(resolution)) {
    throw new Error("Seedance resolution must be 480p, 720p, or 1080p.");
  }
  const generateAudio = params.generate_audio === true || params.generate_audio === "true";
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: imageFile.download_url }, role: "reference_image" },
  ];
  if (endImageFile) {
    content.push({ type: "image_url", image_url: { url: endImageFile.download_url }, role: "reference_image" });
  }
  content.push({ type: "video_url", video_url: { url: videoFile.download_url }, role: "reference_video" });
  if (audioFile) {
    content.push({ type: "audio_url", audio_url: { url: audioFile.download_url }, role: "reference_audio" });
  }

  const body = {
    model,
    content,
    generate_audio: generateAudio,
    resolution,
    ratio,
    duration,
    watermark: false,
    camera_fixed: false,
  };

  const response = await modelArkRequest("/contents/generations/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ModelArkTask;
  if (!response.ok || !payload.id) {
    throw new Error(`ModelArk Seedance request failed (${response.status}): ${payload.error?.message || "unknown error"}`);
  }
  return payload;
}

export async function getSeedanceTask(taskId: string): Promise<ModelArkTask> {
  const response = await modelArkRequest(`/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const payload = (await response.json().catch(() => ({}))) as ModelArkTask;
  if (!response.ok) {
    throw new Error(`ModelArk status request failed (${response.status}).`);
  }
  return payload;
}

export async function streamSeedanceVideo(taskId: string): Promise<Response> {
  const task = await getSeedanceTask(taskId);
  const videoUrl = task.content?.video_url;
  if (!videoUrl) {
    throw new Error("ModelArk has not published a video URL for this task.");
  }
  const parsedVideoUrl = new URL(videoUrl);
  const hostname = parsedVideoUrl.hostname.toLowerCase();
  if (
    parsedVideoUrl.protocol !== "https:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  ) {
    throw new Error("ModelArk returned an unsafe video URL.");
  }
  const response = await fetch(parsedVideoUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Could not download the ModelArk output (${response.status}).`);
  }
  return response;
}

export function modelArkOutputUrl(taskId: string): string {
  return `/api/modelark/video?taskId=${encodeURIComponent(taskId)}`;
}