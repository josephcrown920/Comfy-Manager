import { Router, type IRouter } from "express";
import {
  getModelArkReadiness,
  modelArkImageOutputUrl,
  MODELARK_MODELS,
  streamSeedanceVideo,
  streamSeedreamImage,
} from "../lib/modelark";
import { GetModelArkStatusResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/modelark/status", async (_req, res): Promise<void> => {
  res.json(GetModelArkStatusResponse.parse(getModelArkReadiness()));
});

router.get("/modelark/models", async (_req, res): Promise<void> => {
  res.json({
    configured: Boolean(process.env.MODELARK_API_KEY?.trim()),
    models: MODELARK_MODELS,
    defaults: {
      text: process.env.MODELARK_TEXT_MODEL?.trim() || MODELARK_MODELS.find((model) => model.capability === "text")?.id,
      image: process.env.MODELARK_IMAGE_MODEL?.trim() || MODELARK_MODELS.find((model) => model.capability === "image")?.id,
      video: process.env.MODELARK_SEEDANCE_MODEL?.trim() || MODELARK_MODELS.find((model) => model.capability === "video")?.id,
    },
  });
});

router.get("/modelark/video", async (req, res): Promise<void> => {
  const taskId = typeof req.query.taskId === "string" ? req.query.taskId.trim() : "";
  if (!taskId) {
    res.status(400).json({ error: "A ModelArk task ID is required." });
    return;
  }

  try {
    const response = await streamSeedanceVideo(taskId);
    res.status(200);
    res.setHeader("Content-Type", response.headers.get("content-type") || "video/mp4");
    const contentLength = response.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (!response.body) {
      res.status(502).json({ error: "ModelArk returned an empty video response." });
      return;
    }
    for await (const chunk of response.body) {
      res.write(Buffer.from(chunk));
    }
    res.end();
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not fetch the ModelArk video." });
  }
});

router.get("/modelark/image", async (req, res): Promise<void> => {
  const imageUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!imageUrl) {
    res.status(400).json({ error: "A ModelArk image URL is required." });
    return;
  }

  try {
    const response = await streamSeedreamImage(imageUrl);
    res.status(200);
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
    const contentLength = response.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (!response.body) {
      res.status(502).json({ error: "ModelArk returned an empty image response." });
      return;
    }
    for await (const chunk of response.body) {
      res.write(Buffer.from(chunk));
    }
    res.end();
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not fetch the ModelArk image." });
  }
});

export default router;