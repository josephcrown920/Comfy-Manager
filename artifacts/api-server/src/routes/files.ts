import { Router, type IRouter, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
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
const activeUploadsByUser = new Map<string, number>();
let activeUploads = 0;

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
    fileSize: FILE_SIZE_LIMITS.video,
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

function isSupportedMedia(file: {
  mimetype: string;
  originalname: string;
  buffer: Buffer;
}): boolean {
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
      /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic)$/i.test(name)
    );
  if (isAudio)
    return (
      mime.startsWith("audio/") ||
      /\.(mp3|wav|flac|aac|m4a|ogg|opus)$/i.test(name)
    );
  if (isVideo)
    return (
      mime.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(name)
    );
  return false;
}

function hasFtypBox(bytes: Buffer): boolean {
  return bytes.subarray(4, 8).toString("ascii") === "ftyp";
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

  const ok = patterns.some((pattern) => {
    if (pattern.startsWith(".")) {
      return name.endsWith(pattern);
    }
    if (pattern.endsWith("/*")) {
      return mimetype.startsWith(pattern.slice(0, -1));
    }
    return mimetype === pattern;
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

      if (!isSupportedMedia(req.file)) {
        res
          .status(415)
          .json({
            error:
              "Only recognized image, audio, or video files can be uploaded.",
          });
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
        console.error("upload quota check failed:", err);
        res
          .status(503)
          .json({
            error: "Uploads are temporarily unavailable. Please try again.",
          });
        return;
      }

      // getComfyUrl always returns a URL (defaults to localhost:8188 when unconfigured)
      const comfyUrl = await getComfyUrl();

      const { subfolder } = comfyUploadParams(req.file.mimetype);

      try {
        const formData = new FormData();
        formData.append(
          "image",
          new Blob([new Uint8Array(req.file.buffer)], {
            type: req.file.mimetype,
          }),
          req.file.originalname,
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
          subfolder: string;
          type: string;
        };

        res.json({
          name: data.name,
          subfolder: data.subfolder ?? subfolder,
          type: data.type ?? "input",
        });
      } catch (err: any) {
        res
          .status(502)
          .json({ error: `Could not reach ComfyUI: ${err.message}` });
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
        filename,
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
