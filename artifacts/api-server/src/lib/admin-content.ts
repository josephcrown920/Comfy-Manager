import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, settingsTable } from "@workspace/db";

const CONTENT_KEY = "adminContent";

export const mediaAssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["image", "video"]),
  objectPath: z.string().regex(/^\/objects\/uploads\/[0-9a-f-]{36}$/i),
  contentType: z.string().trim().max(100),
  size: z.number().int().positive().max(100 * 1024 * 1024),
  altText: z.string().trim().max(160),
  createdAt: z.string().datetime(),
});

export const slotSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,50}$/),
  label: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400),
  mediaId: z.string().uuid().nullable(),
  ctaLabel: z.string().trim().max(60),
  ctaHref: z.string().trim().max(200),
  visible: z.boolean(),
  order: z.number().int().min(0).max(100),
});

export const catalogEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,80}$/),
  kind: z.enum(["workflow", "template"]),
  sourceWorkflowId: z.string().regex(/^[a-z0-9-]{2,100}$/),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400),
  category: z.string().trim().min(1).max(60),
  mediaId: z.string().uuid().nullable(),
  visible: z.boolean(),
  featured: z.boolean(),
  order: z.number().int().min(0).max(1000),
});

export const contentStateSchema = z.object({
  media: z.array(mediaAssetSchema).max(200),
  slots: z.array(slotSchema).max(30),
  catalog: z.array(catalogEntrySchema).max(200),
});

export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type ContentSlot = z.infer<typeof slotSchema>;
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type ContentState = z.infer<typeof contentStateSchema>;

const defaultState: ContentState = {
  media: [],
  slots: [
    {
      id: "hero",
      label: "Landing hero",
      title: "Build the next visual",
      description: "A creative production workspace for turning references into finished images, motion, and video.",
      mediaId: null,
      ctaLabel: "Run a workflow",
      ctaHref: "/generate",
      visible: true,
      order: 0,
    },
    {
      id: "workflows",
      label: "Workflow showcase",
      title: "See the workflow before you run it",
      description: "Give every capability a real visual demonstration instead of a text-only promise.",
      mediaId: null,
      ctaLabel: "Browse workflows",
      ctaHref: "/generate",
      visible: true,
      order: 1,
    },
    {
      id: "app",
      label: "App spotlight",
      title: "One studio for the whole pipeline",
      description: "Keep your references, jobs, outputs, and connected workers in one place.",
      mediaId: null,
      ctaLabel: "Open Aurora",
      ctaHref: "/",
      visible: true,
      order: 2,
    },
  ],
  catalog: [],
};

export async function getAdminContent(): Promise<ContentState> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, CONTENT_KEY))
    .limit(1);
  if (!row?.value) return defaultState;
  try {
    const parsed = contentStateSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : defaultState;
  } catch {
    return defaultState;
  }
}

export async function saveAdminContent(value: unknown): Promise<ContentState> {
  const content = contentStateSchema.parse(value);
  await db.insert(settingsTable).values({
    key: CONTENT_KEY,
    value: JSON.stringify(content),
  }).onConflictDoUpdate({
    target: settingsTable.key,
    set: { value: JSON.stringify(content), updatedAt: new Date() },
  });
  return content;
}

export function makeMediaAsset(input: {
  name: string;
  kind: "image" | "video";
  objectPath: string;
  contentType: string;
  size: number;
  altText?: string;
}): MediaAsset {
  return {
    id: randomUUID(),
    name: input.name,
    kind: input.kind,
    objectPath: input.objectPath,
    contentType: input.contentType,
    size: input.size,
    altText: input.altText?.trim() || input.name,
    createdAt: new Date().toISOString(),
  };
}