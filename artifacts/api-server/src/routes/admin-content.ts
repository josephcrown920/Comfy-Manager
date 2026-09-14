import { Readable } from "node:stream";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  catalogEntrySchema,
  contentStateSchema,
  getAdminContent,
  makeMediaAsset,
  mediaAssetSchema,
  saveAdminContent,
} from "../lib/admin-content";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/object-storage";
import { requireAdmin } from "../lib/access-control";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const updateBodySchema = contentStateSchema;
const uploadRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  size: z.number().int().positive().max(100 * 1024 * 1024),
  contentType: z.string().trim().regex(/^(image|video)\//),
});
const createMediaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  size: z.number().int().positive().max(100 * 1024 * 1024),
  contentType: z.string().trim().regex(/^(image|video)\//),
  objectPath: z.string().regex(/^\/objects\/uploads\/[0-9a-f-]{36}$/i),
  altText: z.string().trim().max(160).optional(),
});

function publicMediaIds(content: Awaited<ReturnType<typeof getAdminContent>>): Set<string> {
  return new Set([
    ...content.slots.filter((slot) => slot.visible && slot.mediaId).map((slot) => slot.mediaId!),
    ...content.catalog.filter((entry) => entry.visible && entry.mediaId).map((entry) => entry.mediaId!),
  ]);
}

router.get("/content/landing", async (_req, res): Promise<void> => {
  const content = await getAdminContent();
  const allowed = publicMediaIds(content);
  res.json({
    slots: content.slots.filter((slot) => slot.visible).sort((a, b) => a.order - b.order),
    catalog: content.catalog.filter((entry) => entry.visible).sort((a, b) => a.order - b.order),
    media: content.media
      .filter((asset) => allowed.has(asset.id))
      .map((asset) => ({ ...asset, url: `/api/content/media/${asset.id}` })),
  });
});

router.get("/content/media/:id", async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(404).json({ error: "Media not found." });
    return;
  }
  const content = await getAdminContent();
  if (!publicMediaIds(content).has(id.data)) {
    res.status(404).json({ error: "Media not found." });
    return;
  }
  const asset = content.media.find((item) => item.id === id.data);
  if (!asset) {
    res.status(404).json({ error: "Media not found." });
    return;
  }
  try {
    const response = await objectStorage.downloadObject(await objectStorage.getObjectEntityFile(asset.objectPath));
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Media not found." });
      return;
    }
    req.log.error({ err: error }, "Could not serve admin media");
    res.status(500).json({ error: "Could not serve media." });
  }
});

router.get("/admin/content", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await getAdminContent());
});

router.put("/admin/content", requireAdmin, async (req, res): Promise<void> => {
  const parsed = updateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The content payload is invalid.", details: parsed.error.flatten() });
    return;
  }
  res.json(await saveAdminContent(parsed.data));
});

router.post("/admin/content/media/upload-url", requireAdmin, async (req, res): Promise<void> => {
  const parsed = uploadRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Only image and video files up to 100 MB are supported." });
    return;
  }
  try {
    const kind = parsed.data.contentType.startsWith("video/") ? "video" : "image";
    const upload = await objectStorage.getObjectEntityUploadURL();
    res.json({ ...upload, kind });
  } catch (error) {
    req.log.error({ err: error }, "Could not prepare admin media upload");
    res.status(500).json({ error: "Could not prepare the media upload." });
  }
});

router.post("/admin/content/media", requireAdmin, async (req, res): Promise<void> => {
  const parsed = createMediaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The uploaded media metadata is invalid." });
    return;
  }
  const content = await getAdminContent();
  const asset = makeMediaAsset({
    ...parsed.data,
    kind: parsed.data.contentType.startsWith("video/") ? "video" : "image",
  });
  const next = await saveAdminContent({ ...content, media: [asset, ...content.media] });
  res.status(201).json({ asset, content: next });
});

router.delete("/admin/content/media/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsedId = z.string().uuid().safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ error: "Invalid media id." });
    return;
  }
  const content = await getAdminContent();
  const asset = content.media.find((item) => item.id === parsedId.data);
  if (!asset) {
    res.status(404).json({ error: "Media not found." });
    return;
  }
  const used = content.slots.some((slot) => slot.mediaId === asset.id) ||
    content.catalog.some((entry) => entry.mediaId === asset.id);
  if (used) {
    res.status(409).json({ error: "Remove this media from its slots first." });
    return;
  }
  const next = await saveAdminContent({ ...content, media: content.media.filter((item) => item.id !== asset.id) });
  res.json(next);
});

export default router;