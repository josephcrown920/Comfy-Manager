import { Buffer } from "node:buffer";
import { fetchComfy } from "../routes/comfy";
import { getComfyUrl } from "../routes/settings";

const MODELARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
export const MODELARK_WORKFLOW_ID = "perform-anywhere-seedance";
export const MODELARK_REFERENCE_WORKFLOW_ID = "modelark-seedance-reference-video";
export const MODELARK_IMAGE_WORKFLOW_ID = "modelark-seedream-image";
export const MODELARK_OUTPUT_SUBFOLDER = "modelark";
export const MODELARK_IMAGE_OUTPUT_SUBFOLDER = "modelark-image";
export const MODELARK_DEFAULT_MODEL = "dreamina-seedance-2-5-260628";
export const MODELARK_DEFAULT_TEXT_MODEL = "dola-seed-2-1-turbo-260628";
export const MODELARK_DEFAULT_IMAGE_MODEL = "dola-seedream-5-0-pro-260628";

export type ModelArkCapability = "text" | "image" | "video";

export type ModelArkModel = {
  id: string;
  name: string;
  capability: ModelArkCapability;
  description: string;
  hosted: true;
};

/**
 * The visual and agent models currently documented by ModelArk.
 *
 * This is deliberately server-owned instead of being accepted from the
 * browser. ModelArk model IDs can change by region or activation state, so
 * the API still allows an administrator to override the defaults through
 * environment variables without exposing credentials to the client.
 */
export const MODELARK_MODELS: ModelArkModel[] = [
  {
    id: MODELARK_DEFAULT_TEXT_MODEL,
    name: "Dola Seed 2.1 Turbo",
    capability: "text",
    description: "Reasoning, text generation, multimodal understanding, and tool use.",
    hosted: true,
  },
  {
    id: "seed-2-0-pro-260328",
    name: "Seed 2.0 Pro",
    capability: "text",
    description: "General-purpose reasoning, text generation, and visual grounding.",
    hosted: true,
  },
  {
    id: "seed-2-0-lite-260428",
    name: "Seed 2.0 Lite",
    capability: "text",
    description: "Fast reasoning, text generation, structured output, and tool use.",
    hosted: true,
  },
  {
    id: "seed-2-0-mini-260428",
    name: "Seed 2.0 Mini",
    capability: "text",
    description: "Lightweight reasoning, text generation, and multimodal understanding.",
    hosted: true,
  },
  {
    id: MODELARK_DEFAULT_IMAGE_MODEL,
    name: "Dola Seedream 5.0 Pro",
    capability: "image",
    description: "High-fidelity image generation with reference consistency and editing.",
    hosted: true,
  },
  {
    id: "seedream-5-0-lite-260128",
    name: "Seedream 5.0 Lite",
    capability: "image",
    description: "Fast image generation, editing, and sequential image generation.",
    hosted: true,
  },
  {
    id: "seedream-5-0-260128",
    name: "Seedream 5.0",
    capability: "image",
    description: "Image generation with reference-image and sequential-generation support.",
    hosted: true,
  },
  {
    id: "seedream-4-5-251128",
    name: "Seedream 4.5",
    capability: "image",
    description: "Image generation and editing with reference-image support.",
    hosted: true,
  },
  {
    id: "seedream-4-0-250828",
    name: "Seedream 4.0",
    capability: "image",
    description: "Image generation and editing with reference-image support.",
    hosted: true,
  },
  {
    id: MODELARK_DEFAULT_MODEL,
    name: "Dreamina Seedance 2.5",
    capability: "video",
    description: "Hosted video generation with multimodal references and extended storytelling.",
    hosted: true,
  },
];

const MODELARK_WORKFLOW_IDS = new Set([
  MODELARK_WORKFLOW_ID,
  MODELARK_REFERENCE_WORKFLOW_ID,
  MODELARK_IMAGE_WORKFLOW_ID,
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
    textModel: process.env.MODELARK_TEXT_MODEL?.trim() || MODELARK_DEFAULT_TEXT_MODEL,
    imageModel: process.env.MODELARK_IMAGE_MODEL?.trim() || MODELARK_DEFAULT_IMAGE_MODEL,
    models: MODELARK_MODELS,
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

function validateModelId(value: unknown, fallback: string): string {
  const model = String(value || fallback).trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(model)) {
    throw new Error("The configured ModelArk model ID is invalid.");
  }
  return model;
}

export type ModelArkImage = {
  url?: string;
  b64_json?: string;
};

export async function createSeedreamImage(params: Record<string, unknown>): Promise<{
  model: string;
  data: ModelArkImage[];
}> {
  const model = validateModelId(
    params.model || process.env.MODELARK_IMAGE_MODEL,
    MODELARK_DEFAULT_IMAGE_MODEL,
  );
  const prompt = String(params.prompt || "").trim();
  if (!prompt || prompt.length > 6000) {
    throw new Error("Seedream prompt must be between 1 and 6,000 characters.");
  }

  const size = String(params.size || "2K").trim();
  const allowedSizes = new Set(["1K", "1.5K", "2K", "auto"]);
  if (!allowedSizes.has(size)) {
    throw new Error("Seedream size must be 1K, 1.5K, 2K, or auto.");
  }

  const count = Math.min(Math.max(Number(params.n ?? 1), 1), 4);
  const response = await modelArkRequest("/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      size,
      n: count,
      response_format: "url",
      watermark: false,
      sequential_image_generation: "disabled",
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    model?: string;
    data?: ModelArkImage[];
    error?: { message?: string };
  };
  if (!response.ok || !Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error(
      `ModelArk Seedream request failed (${response.status}): ${payload.error?.message || "no image returned"}`,
    );
  }
  return { model: payload.model || model, data: payload.data };
}

export type ModelArkChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function createModelArkTextCompletion(params: {
  model?: string;
  messages: ModelArkChatMessage[];
  maxTokens?: number;
  json?: boolean;
}): Promise<string> {
  const model = validateModelId(
    params.model || process.env.MODELARK_TEXT_MODEL,
    MODELARK_DEFAULT_TEXT_MODEL,
  );
  if (!MODELARK_MODELS.some((entry) => entry.capability === "text" && entry.id === model)) {
    throw new Error("The selected ModelArk model is not a supported text model.");
  }
  const response = await modelArkRequest("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: params.messages,
      max_tokens: Math.min(Math.max(params.maxTokens ?? 2048, 1), 8192),
      ...(params.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(`ModelArk text request failed (${response.status}): ${payload.error?.message || "request rejected"}`);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("ModelArk returned an empty text response.");
  }
  return content;
}

function validateRemoteOutputUrl(value: unknown): URL {
  const url = new URL(String(value || ""));
  const hostname = url.hostname.toLowerCase();
  const isModelArkHost =
    hostname === "byteplus.com" ||
    hostname.endsWith(".byteplus.com") ||
    hostname === "bytepluses.com" ||
    hostname.endsWith(".bytepluses.com") ||
    hostname === "volces.com" ||
    hostname.endsWith(".volces.com");
  if (
    url.protocol !== "https:" ||
    !isModelArkHost
  ) {
    throw new Error("ModelArk returned an unsafe media URL.");
  }
  return url;
}

export async function streamSeedreamImage(imageUrl: string): Promise<Response> {
  const url = validateRemoteOutputUrl(imageUrl);
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Could not download the ModelArk image (${response.status}).`);
  }
  return response;
}

export function modelArkImageOutputUrl(imageUrl: string): string {
  return `/api/modelark/image?url=${encodeURIComponent(imageUrl)}`;
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