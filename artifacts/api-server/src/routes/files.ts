import { Router, type IRouter, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { recordInputOwner } from "../lib/perform-media";
import { db, outputsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getComfyUrl } from "./settings";
import { fetchComfy } from "./comfy";
import { ImportOutputBody, ImportOutputResponse } from "@workspace/api-zod";
import { getAuthenticatedUserId } from "../lib/access-control";
import { getJobWorkerUrl } from "../lib/worker-routing";
import {
  MAX_UPLOAD_BYTES_PER_DAY,
  MAX_UPLOAD_REQUESTS_PER_DAY,
  reserveUpload,
} from "../lib/resource-quotas";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

const MB = 1024 * 1024;
const FILE_SIZE_LIMITS = {
  image: 20 * MB,
  audio: 100 * MB,
  video: 100 * MB,
  other: 20 * MB,
} as const;
const MAX_UPLOAD_REQUEST_BYTES = FILE_SIZE_LIMITS.video + MB;
const MAX_CONCURRENT_UPLOADS = 2;
const MAX_CONCURRENT_UPLOADS_PER_USER = 1;
const MAX_NORMALIZED_IMAGE_BYTES = FILE_SIZE_LIMITS.image;
const NORMALIZATION_TIMEOUT_MS = 30_000;
const activeUploadsByUser = new Map<string, number>();
let activeUploads = 0;

const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heif",
  "heis",
  "hevm",
  "hevs",
]);
const AVIF_BRANDS = new Set(["avif", "avis"]);
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|heic|heif)$/i;
const HEIF_EXTENSIONS = /\.(heic|heif)$/i;
const AVIF_EXTENSIONS = /\.avif$/i;

type DetectedMedia = "image" | "heif" | "avif" | "audio" | "video";
type NormalizedImage =
  | { ok: true; buffer: Buffer }
  | { ok: false; reason: "unavailable" | "invalid" | "too-large" };

class UploadSizeError extends Error {
  constructor(
    readonly limitBytes: number,
    message: string,
  ) {
    super(message);
    this.name = "UploadSizeError";
  }
}

/**
 * Buffer only up to the MIME-specific limit. Multer's memoryStorage cannot
 * enforce dynamic limits and would retain the whole request up to the global
 * ceiling before route validation runs.
 */
const sizeLimitedMemoryStorage: multer.StorageEngine = {
  _handleFile(_req, file, callback) {
    const limit = fileSizeLimit(file.mimetype);
    let chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      chunks = [];
      callback(error);
    };

    file.stream.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit.bytes) {
        fail(
          new UploadSizeError(
            limit.bytes,
            `${limit.label} must be ${formatMegabytes(limit.bytes)} or smaller. "${file.originalname}" is too large.`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    file.stream.once("error", fail);
    file.stream.once("end", () => {
      if (settled) return;
      settled = true;
      callback(null, {
        buffer: Buffer.concat(chunks, size),
        size,
      });
    });
  },
  _removeFile(_req, file, callback) {
    file.buffer = Buffer.alloc(0);
    callback(null);
  },
};

const upload = multer({
  storage: sizeLimitedMemoryStorage,
  // Preserve an absolute ceiling in addition to the streaming per-type cap.
  // The extra multipart fields/headers are bounded separately below.
  limits: {
    // Busboy rejects at >= fileSize. Leave headroom so the streaming storage
    // enforces the inclusive per-type limit and returns its friendly error.
    fileSize: MAX_UPLOAD_REQUEST_BYTES,
    files: 1,
    fields: 8,
    parts: 9,
    fieldSize: 16 * 1024,
  },
});

/** Wrap multer.single() as a Promise so we can catch MulterError with typed responses. */
function runMulter(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single("file")(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Determine the ComfyUI upload parameters for a given file.
 *
 * ComfyUI's /upload/image endpoint stores any file in its `input/` directory.
 * Audio files are placed in the `audio` subfolder so ComfyUI nodes that load
 * audio (VHS_LoadAudio, etc.) can find them at `audio/<filename>`.
 */
function comfyUploadParams(mimetype: string): { subfolder: string } {
  if (mimetype.startsWith("audio/")) {
    return { subfolder: "audio" };
  }
  return { subfolder: "" };
}

function fileSizeLimit(mimetype: string): { bytes: number; label: string } {
  if (mimetype.startsWith("image/")) {
    return { bytes: FILE_SIZE_LIMITS.image, label: "Images" };
  }
  if (mimetype.startsWith("audio/")) {
    return { bytes: FILE_SIZE_LIMITS.audio, label: "Audio files" };
  }
  if (mimetype.startsWith("video/")) {
    return { bytes: FILE_SIZE_LIMITS.video, label: "Videos" };
  }
  return { bytes: FILE_SIZE_LIMITS.other, label: "Files" };
}

function formatMegabytes(bytes: number): string {
  return `${bytes / MB} MB`;
}

function hasFtypBrand(bytes: Buffer, brands: ReadonlySet<string>): boolean {
  if (!hasFtypBox(bytes) || bytes.length < 16) return false;

  const declaredSize = bytes.readUInt32BE(0);
  const boxEnd = Math.min(
    bytes.length,
    declaredSize >= 16 ? declaredSize : bytes.length,
  );
  for (let offset = 8; offset + 4 <= boxEnd; offset += 4) {
    if (brands.has(bytes.subarray(offset, offset + 4).toString("ascii"))) {
      return true;
    }
  }
  return false;
}

function detectMedia(file: {
  mimetype: string;
  originalname: string;
  buffer: Buffer;
}): DetectedMedia | null {
  const bytes = file.buffer;
  const name = file.originalname.toLowerCase();
  const mime = file.mimetype.toLowerCase();
  const isImage =
    bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
    bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) ||
    bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
    bytes.subarray(0, 6).toString("ascii") === "GIF89a" ||
    (bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP");
  const isHeif = hasFtypBrand(bytes, HEIF_BRANDS);
  const isAvif = hasFtypBrand(bytes, AVIF_BRANDS);
  const isAudio =
    bytes.subarray(0, 3).toString("ascii") === "ID3" ||
    (bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WAVE") ||
    bytes.subarray(0, 4).toString("ascii") === "OggS" ||
    bytes.subarray(0, 4).toString("ascii") === "fLaC" ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  const isVideo =
    bytes.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex")) ||
    (bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "AVI ") ||
    hasFtypBox(bytes);

  if (isImage)
    return (
      mime.startsWith("image/") ||
      IMAGE_EXTENSIONS.test(name)
    )
      ? "image"
      : null;
  if (isHeif) {
    return mime.startsWith("image/") || HEIF_EXTENSIONS.test(name) ? "heif" : null;
  }
  if (isAvif) {
    return mime.startsWith("image/") || AVIF_EXTENSIONS.test(name) ? "avif" : null;
  }
  if (isAudio)
    return (
      mime.startsWith("audio/") ||
      /\.(mp3|wav|flac|aac|m4a|ogg|opus)$/i.test(name)
    )
      ? "audio"
      : null;
  if (isVideo)
    return (
      mime.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(name)
    )
      ? "video"
      : null;
  return null;
}

function hasFtypBox(bytes: Buffer): boolean {
  return bytes.subarray(4, 8).toString("ascii") === "ftyp";
}

function looksLikeHeif(file: { mimetype: string; originalname: string }): boolean {
  return (
    file.mimetype.toLowerCase().includes("heic") ||
    file.mimetype.toLowerCase().includes("heif") ||
    HEIF_EXTENSIONS.test(file.originalname)
  );
}

function looksLikeAvif(file: { mimetype: string; originalname: string }): boolean {
  return file.mimetype.toLowerCase() === "image/avif" || AVIF_EXTENSIONS.test(file.originalname);
}

function inferredMimeFromName(name: string): string | null {
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!extension) return null;
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";
  return null;
}

function safeExtension(
  file: { mimetype: string; originalname: string },
  media: DetectedMedia,
): string {
  if (media === "heif" || media === "avif") return "jpg";
  if (media === "image") {
    if (file.mimetype.toLowerCase() === "image/png" || /\.png$/i.test(file.originalname)) return "png";
    if (file.mimetype.toLowerCase() === "image/webp" || /\.webp$/i.test(file.originalname)) return "webp";
    if (file.mimetype.toLowerCase() === "image/gif" || /\.gif$/i.test(file.originalname)) return "gif";
    return "jpg";
  }
  const extension = file.originalname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const allowed = media === "audio"
    ? new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus"])
    : new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v"]);
  return extension && allowed.has(extension)
    ? extension
    : media === "audio"
      ? "audio"
      : "video";
}

function safeUploadFilename(
  file: { mimetype: string; originalname: string },
  media: DetectedMedia,
): string {
  return `${randomUUID()}.${safeExtension(file, media)}`;
}

function normalizeImageWithMagick(
  buffer: Buffer,
  inputFormat: "heic" | "heif" | "avif",
): Promise<NormalizedImage> {
  return new Promise((resolve) => {
    let settled = false;
    let outputSize = 0;
    const output: Buffer[] = [];
    const child = spawn(
      "magick",
      [
        "-limit",
        "memory",
        "256MiB",
        "-limit",
        "map",
        "256MiB",
        "-limit",
        "disk",
        "0",
        `${inputFormat}:-`,
        "-auto-orient",
        "-strip",
        "-colorspace",
        "sRGB",
        "-quality",
        "92",
        "jpeg:-",
      ],
      { stdio: ["pipe", "pipe", "ignore"] },
    );

    const finish = (result: NormalizedImage) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, reason: "unavailable" });
    }, NORMALIZATION_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      outputSize += chunk.length;
      if (outputSize > MAX_NORMALIZED_IMAGE_BYTES) {
        child.kill("SIGKILL");
        finish({ ok: false, reason: "too-large" });
        return;
      }
      output.push(chunk);
    });
    child.on("error", () => finish({ ok: false, reason: "unavailable" }));
    child.on("close", (code) => {
      if (code !== 0 || outputSize === 0) {
        finish({ ok: false, reason: "invalid" });
        return;
      }
      const normalized = Buffer.concat(output, outputSize);
      const isJpeg = normalized.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
      finish(isJpeg ? { ok: true, buffer: normalized } : { ok: false, reason: "invalid" });
    });
    child.stdin.on("error", () => finish({ ok: false, reason: "unavailable" }));
    child.stdin.end(buffer);
  });
}

function normalizedImageError(
  media: "heif" | "avif",
  result: Extract<NormalizedImage, { ok: false }>,
): string {
  const format = media === "heif" ? "HEIC/HEIF" : "AVIF";
  if (result.reason === "too-large") {
    return `${format} conversion produced an image larger than ${formatMegabytes(MAX_NORMALIZED_IMAGE_BYTES)}. Choose a smaller photo and retry.`;
  }
  if (result.reason === "unavailable") {
    return `${format} photos are recognized, but this server cannot convert them right now. Export the photo as JPEG or PNG and retry.`;
  }
  return `This ${format} photo could not be decoded. Export it as JPEG or PNG and retry with the new file.`;
}

async function prepareUpload(
  file: {
    mimetype: string;
    originalname: string;
    buffer: Buffer;
  },
  media: DetectedMedia,
): Promise<
  | { ok: true; buffer: Buffer; mimetype: string; filename: string }
  | { ok: false; error: string }
> {
  if (media === "heif" || media === "avif") {
    const normalized = await normalizeImageWithMagick(file.buffer, media);
    if (!normalized.ok) {
      return { ok: false, error: normalizedImageError(media, normalized) };
    }
    return {
      ok: true,
      buffer: normalized.buffer,
      mimetype: "image/jpeg",
      filename: safeUploadFilename(file, media),
    };
  }
  return {
    ok: true,
    buffer: file.buffer,
    mimetype: file.mimetype || (media === "image" ? "image/jpeg" : "application/octet-stream"),
    filename: safeUploadFilename(file, media),
  };
}

function tryStartUpload(userId: string): boolean {
  const userCount = activeUploadsByUser.get(userId) ?? 0;
  if (
    activeUploads >= MAX_CONCURRENT_UPLOADS ||
    userCount >= MAX_CONCURRENT_UPLOADS_PER_USER
  ) {
    return false;
  }
  activeUploads++;
  activeUploadsByUser.set(userId, userCount + 1);
  return true;
}

function finishUpload(userId: string): void {
  activeUploads = Math.max(0, activeUploads - 1);
  const remaining = (activeUploadsByUser.get(userId) ?? 1) - 1;
  if (remaining > 0) activeUploadsByUser.set(userId, remaining);
  else activeUploadsByUser.delete(userId);
}

/**
 * Check a file against an HTML-style `accept` string (comma-separated list of
 * MIME types like `image/png`, wildcards like `image/*`, or extensions like `.png`).
 * Returns null when accepted, otherwise a user-friendly error message.
 */
function validateAccept(
  accept: string,
  file: { mimetype: string; originalname: string },
): string | null {
  const patterns = accept
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return null;

  const mimetype = file.mimetype.toLowerCase();
  const name = file.originalname.toLowerCase();
  const inferredMime = inferredMimeFromName(name);
  const candidateMimes = [mimetype, inferredMime].filter(
    (value): value is string => Boolean(value),
  );

  const ok = patterns.some((pattern) => {
    if (pattern.startsWith(".")) {
      return name.endsWith(pattern);
    }
    if (pattern.endsWith("/*")) {
      return candidateMimes.some((candidate) => candidate.startsWith(pattern.slice(0, -1)));
    }
    return candidateMimes.includes(pattern);
  });

  if (ok) return null;

  return `This file type isn't supported here. "${file.originalname}" is ${file.mimetype}, but this input expects: ${patterns.join(", ")}.`;
}

/**
 * POST /api/files/upload
 *
 * Accepts a multipart file in the `file` field, forwards it to ComfyUI's
 * /upload/image endpoint, and returns ComfyUI's response { name, subfolder, type }.
 *
 * Images, audio, and video files are accepted. Audio files are stored under the
 * `audio/` subfolder so ComfyUI audio-loader nodes can resolve them.
 */
router.post(
  "/files/upload",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(res);
    const contentLength = Number(req.headers["content-length"]);
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_UPLOAD_REQUEST_BYTES
    ) {
      res
        .status(413)
        .json({
          error: `Upload request must be ${formatMegabytes(FILE_SIZE_LIMITS.video)} or smaller.`,
        });
      return;
    }
    if (!tryStartUpload(userId)) {
      res
        .status(429)
        .json({
          error: "Too many uploads are in progress. Please try again shortly.",
        });
      return;
    }

    try {
      // Parse the multipart body via multer.
      try {
        await runMulter(req, res);
      } catch (err) {
        if (err instanceof UploadSizeError) {
          res.status(413).json({ error: err.message });
          return;
        }
        if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
          res
            .status(413)
            .json({ error: "File too large. Maximum size is 100 MB." });
          return;
        }
        res
          .status(400)
          .json({
            error: err instanceof Error ? err.message : "Upload parse error",
          });
        return;
      }

      if (!req.file) {
        res
          .status(400)
          .json({ error: "No file provided. Use field name: file" });
        return;
      }

      // Optional workflow-param accept filter (query param or header), e.g. "image/*,.png"
      const acceptRaw = req.query.accept ?? req.headers["x-upload-accept"];
      const accept = Array.isArray(acceptRaw) ? acceptRaw[0] : acceptRaw;
      if (typeof accept === "string" && accept.trim()) {
        const error = validateAccept(accept, req.file);
        if (error) {
          res.status(422).json({ error });
          return;
        }
      }

      const media = detectMedia(req.file);
      if (!media) {
        const error = looksLikeHeif(req.file)
          ? "This HEIC/HEIF photo is invalid or corrupt. Export it as JPEG or PNG and retry."
          : looksLikeAvif(req.file)
            ? "This AVIF photo is invalid or corrupt. Export it as JPEG or PNG and retry."
            : "This image format is not supported or the file is corrupt. Use a valid JPEG, PNG, WebP, GIF, HEIC, HEIF, or AVIF image.";
        res
          .status(415)
          .json({ error });
        return;
      }

      const prepared = await prepareUpload(req.file, media);
      if (!prepared.ok) {
        res.status(415).json({ error: prepared.error });
        return;
      }

      try {
        const reserved = await reserveUpload(userId, req.file.size);
        if (!reserved) {
          res.status(429).json({
            error: `Daily upload limit reached (${formatMegabytes(MAX_UPLOAD_BYTES_PER_DAY)} or ${MAX_UPLOAD_REQUESTS_PER_DAY} files).`,
          });
          return;
        }
      } catch (err) {
        req.log.warn({ err }, "Upload quota check failed");
        res
          .status(503)
          .json({
            error: "Uploads are temporarily unavailable. Please try again.",
          });
        return;
      }

      // getComfyUrl always returns a URL (defaults to localhost:8188 when unconfigured)
      const comfyUrl = await getComfyUrl();

      const { subfolder } = comfyUploadParams(prepared.mimetype);

      try {
        const formData = new FormData();
        formData.append(
          "image",
          new Blob([new Uint8Array(prepared.buffer)], {
            type: prepared.mimetype,
          }),
          prepared.filename,
        );
        // Tell ComfyUI which subfolder to store the file in
        if (subfolder) {
          formData.append("subfolder", subfolder);
        }
        // type=input marks this as a workflow input rather than an output
        formData.append("type", "input");

        const comfyRes = await fetchComfy(comfyUrl, "/upload/image", {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(60_000),
        });

        if (!comfyRes.ok) {
          const text = await comfyRes.text().catch(() => "");
          res
            .status(502)
            .json({
              error: `ComfyUI upload failed (${comfyRes.status}): ${text}`,
            });
          return;
        }

        const data = (await comfyRes.json()) as {
          name: string;
          subfolder?: string;
          type?: string;
        };

        await recordInputOwner(data.name, userId, data.subfolder ?? subfolder, prepared.mimetype, comfyUrl);
        res.json({
          name: data.name,
          subfolder: data.subfolder ?? subfolder,
          type: data.type ?? "input",
        });
      } catch (err: any) {
        res
          .status(502)
          .json({ error: `Could not reach ComfyUI: ${err instanceof Error ? err.message : "the worker returned an unknown error"}` });
      }
    } finally {
      finishUpload(userId);
    }
  },
);

/**
 * Copy a generated image back into ComfyUI's input directory so it can become
 * the source image for a later workflow stage.
 */
router.post(
  "/files/import-output",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ImportOutputBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { filename, jobId, subfolder = "", type = "output" } = parsed.data;
    const userId = getAuthenticatedUserId(res);
    const [ownedOutput] = await db
      .select({ id: outputsTable.id })
      .from(outputsTable)
      .where(
        and(
          eq(outputsTable.ownerId, userId),
          eq(outputsTable.jobId, jobId),
          eq(outputsTable.filename, filename),
          eq(outputsTable.subfolder, subfolder),
        ),
      )
      .limit(1);
    if (!ownedOutput) {
      res.status(404).json({ error: "Output not found" });
      return;
    }

    const comfyUrl = await getJobWorkerUrl(jobId);

    try {
      const query = new URLSearchParams({
        filename,
        subfolder,
        type,
      });
      const source = await fetchComfy(comfyUrl, `/view?${query.toString()}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!source.ok) {
        res
          .status(502)
          .json({
            error: `Could not read the generated output (${source.status}).`,
          });
        return;
      }

      const bytes = new Uint8Array(await source.arrayBuffer());
      const contentType = source.headers.get("content-type") || "image/png";
      const formData = new FormData();
      formData.append(
        "image",
        new Blob([bytes], { type: contentType }),
        `${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140)}`,
      );
      formData.append("type", "input");

      const uploaded = await fetchComfy(comfyUrl, "/upload/image", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(60_000),
      });
      if (!uploaded.ok) {
        const detail = await uploaded.text().catch(() => "");
        res
          .status(502)
          .json({
            error: `Could not import the generated output (${uploaded.status}): ${detail.slice(0, 300)}`,
          });
        return;
      }

      const data = (await uploaded.json()) as {
        name: string;
        subfolder?: string;
        type?: string;
      };
      await recordInputOwner(data.name, userId, data.subfolder ?? "", contentType, comfyUrl);
      res.json(
        ImportOutputResponse.parse({
          name: data.name,
          subfolder: data.subfolder ?? "",
          type: data.type ?? "input",
        }),
      );
    } catch (err) {
      res
        .status(502)
        .json({
          error: `Could not reach ComfyUI: ${err instanceof Error ? err.message : "unknown error"}`,
        });
    }
  },
);

export default router;
