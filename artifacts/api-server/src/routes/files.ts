import { Router, type IRouter, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { getComfyUrl } from "./settings";

const router: IRouter = Router();

// Store uploads in memory — files are forwarded immediately to ComfyUI
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
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

/**
 * POST /api/files/upload
 *
 * Accepts a multipart file in the `file` field, forwards it to ComfyUI's
 * /upload/image endpoint, and returns ComfyUI's response { name, subfolder, type }.
 *
 * Both image and audio files are accepted. Audio files are stored under the
 * `audio/` subfolder so ComfyUI audio-loader nodes can resolve them.
 */
router.post("/files/upload", async (req: Request, res: Response): Promise<void> => {
  // Parse the multipart body via multer
  try {
    await runMulter(req, res);
  } catch (err) {
    if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File too large. Maximum size is 100 MB." });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : "Upload parse error" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No file provided. Use field name: file" });
    return;
  }

  // getComfyUrl always returns a URL (defaults to localhost:8188 when unconfigured)
  const comfyUrl = await getComfyUrl();
  const uploadUrl = `${comfyUrl.replace(/\/$/, "")}/upload/image`;

  const { subfolder } = comfyUploadParams(req.file.mimetype);

  try {
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype }),
      req.file.originalname,
    );
    // Tell ComfyUI which subfolder to store the file in
    if (subfolder) {
      formData.append("subfolder", subfolder);
    }
    // type=input marks this as a workflow input rather than an output
    formData.append("type", "input");

    const comfyRes = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });

    if (!comfyRes.ok) {
      const text = await comfyRes.text().catch(() => "");
      res.status(502).json({ error: `ComfyUI upload failed (${comfyRes.status}): ${text}` });
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
    res.status(502).json({ error: `Could not reach ComfyUI: ${err.message}` });
  }
});

export default router;
