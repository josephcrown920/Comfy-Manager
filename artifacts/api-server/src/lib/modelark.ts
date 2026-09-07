import { Buffer } from "node:buffer";
import { fetchComfy } from "../routes/comfy";
import { getComfyUrl } from "../routes/settings";

const MODELARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
export const MODELARK_WORKFLOW_ID = "perform-anywhere-seedance";
export const MODELARK_OUTPUT_SUBFOLDER = "modelark";

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

function getModelArkKey(): string {
  const key = process.env.MODELARK_API_KEY;
  if (!key) {
    throw new Error("ModelArk is not configured. Add MODELARK_API_KEY in Replit Secrets.");
  }
  return key;
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

async function readComfyInputAsset(filename: string): Promise<{ bytes: Buffer; contentType: string }> {
  const comfyUrl = await getComfyUrl();
  const query = new URLSearchParams({ filename, subfolder: "", type: "input" });
  const response = await fetchComfy(comfyUrl, `/view?${query.toString()}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Could not read the uploaded ComfyUI asset (${response.status}).`);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
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

export async function createSeedanceTask(params: Record<string, unknown>): Promise<ModelArkTask> {
  const model = String(params.model || process.env.MODELARK_SEEDANCE_MODEL || "seedance-2-0-260128");
  const sourceImage = String(params.source_image ?? "");
  const sourceVideo = String(params.source_video ?? "");
  if (!sourceImage || !sourceVideo) {
    throw new Error("Seedance requires both a selected still and a performance video.");
  }

  const [image, video] = await Promise.all([
    readComfyInputAsset(sourceImage),
    readComfyInputAsset(sourceVideo),
  ]);
  const [imageFile, videoFile] = await Promise.all([
    uploadModelArkFile(image.bytes, "selected-angle.png", image.contentType === "image/jpeg" ? image.contentType : "image/png"),
    uploadModelArkFile(video.bytes, "performance-reference.mp4", video.contentType || "video/mp4", model),
  ]);

  const prompt = String(
    params.motion_context ||
      "Transfer the performance movement naturally onto the performer in the reference image. Preserve identity, wardrobe, vehicle interior, lighting, and camera composition.",
  );
  const duration = Math.min(Math.max(Number(params.duration ?? 5), 2), 15);
  const body = {
    model,
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageFile.download_url }, role: "reference_image" },
      { type: "video_url", video_url: { url: videoFile.download_url }, role: "reference_video" },
    ],
    resolution: String(params.resolution ?? "720p"),
    ratio: String(params.ratio ?? params.aspect_ratio ?? "16:9"),
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
  const response = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Could not download the ModelArk output (${response.status}).`);
  }
  return response;
}

export function modelArkOutputUrl(taskId: string): string {
  return `/api/modelark/video?taskId=${encodeURIComponent(taskId)}`;
}