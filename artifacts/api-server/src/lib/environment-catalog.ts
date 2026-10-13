import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_ENVIRONMENT_MEDIA } from "./environment-media";

export const ENVIRONMENT_MEDIA_KEY = "perform-environment-media";
const colors = [
  ["pink", "Pink stage", "hot pink"], ["blue", "Cobalt stage", "deep cobalt blue"],
  ["green", "Green stage", "rich green"], ["orange", "Amber stage", "warm orange"],
  ["purple", "Violet stage", "violet"], ["yellow", "Sunshine stage", "bright yellow"],
  ["crimson", "Crimson stage", "deep crimson"], ["white", "Silver studio", "soft neutral grey"],
  ["spotlight", "Spotlight studio", "dark black with one warm spotlight"],
  ["cyan", "Cyan stage", "turquoise"], ["peach", "Peach studio", "warm peach"],
  ["lime", "Electric lime", "electric lime green"],
] as const;
const studioPresets = colors.map(([id, name, color]) => ({
  id: `studio-${id}`, name, category: "studio" as const, source: "extracted" as const,
  description: `${color.charAt(0).toUpperCase() + color.slice(1)} cyclorama and real studio lighting, cropped from your reference sheet.`,
  scenePrompt: `Music-video performance on a ${color} seamless cyclorama studio stage. Match the reference background, lighting and visible stage equipment; keep the performer identity and outfit unchanged.`,
}));
export const ENVIRONMENT_PRESETS = [
  ...studioPresets,
  { id: "split-light", name: "Orange × lime", category: "studio", source: "extracted", description: "Two-tone colored lighting, cleaned from your performance reference.", scenePrompt: "Performance in an empty seamless studio with orange light from the left and lime-green light from the right; split-colored cinematic lighting on the performer." },
  { id: "red-studio", name: "Red cyclorama", category: "studio", source: "extracted", description: "Deep red seamless backdrop with the performer and captions removed.", scenePrompt: "Full-body music-video performance in a deep red seamless cyclorama studio with dramatic directional shadows and cinematic lighting." },
  { id: "neon-studio", name: "Blue LED studio", category: "studio", source: "extracted", description: "Blue zigzag LEDs and a glossy floor, cleaned from your studio reference.", scenePrompt: "Music-video performance in a dark futuristic studio with blue zigzag LED walls, spotlights, atmospheric haze and glossy reflective floor." },
  { id: "rainy-city", name: "Rainy neon street", category: "outdoor", source: "extracted", description: "A wet city street with blue and red night reflections, cleaned from your photo.", scenePrompt: "Night music-video performance on a wet neon city street with blue and red light reflections, realistic wet pavement, traffic and urban depth." },
  { id: "brick-courtyard", name: "Brick courtyard", category: "outdoor", source: "extracted", description: "Warm brick architecture and outdoor pavement, with the subject removed.", scenePrompt: "Outdoor music-video performance in a warm brick urban courtyard with natural daylight, textured brick architecture and realistic concrete pavement." },
  { id: "luxury-interior", name: "Luxury lounge", category: "interior", source: "extracted", description: "Geometric warm ceiling lights and a cinematic luxury interior from your photo.", scenePrompt: "Performance in a luxury vehicle lounge interior with geometric warm LED ceiling lighting, leather upholstery and cinematic night ambience." },
  { id: "pool", name: "Blue-hour pool", category: "outdoor", source: "generated", description: "A new poolside setting with turquoise water, palms and a modern villa.", scenePrompt: "Music-video performance on a luxury outdoor infinity-pool deck at blue hour with turquoise water, white contemporary villa and palm trees; keep the performer on the dry pool deck." },
  { id: "basketball-court", name: "Sunset basketball court", category: "sport", source: "generated", description: "A new outdoor court with hoops, painted lines and a city skyline.", scenePrompt: "Full-body music-video performance at center court on an outdoor basketball court at golden sunset, realistic court lines, hoops, chain-link fencing and city skyline." },
  { id: "stadium", name: "Floodlit stadium", category: "sport", source: "generated", description: "A new stadium setting with night floodlights and a clear playing field.", scenePrompt: "Music-video performance on the sideline of an empty football stadium at night with dramatic floodlights, realistic grandstands and green playing field." },
] as const;
const mediaSchema = z.record(z.string(), z.object({
  objectPath: z.string().regex(/^\/objects\/uploads\/[0-9a-f-]{36}$/i),
  contentType: z.literal("image/webp"),
}));
export async function getEnvironmentMedia() {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, ENVIRONMENT_MEDIA_KEY));
  return row ? mediaSchema.parse(JSON.parse(row.value)) : DEFAULT_ENVIRONMENT_MEDIA;
}
export async function listAvailableEnvironments() {
  const media = await getEnvironmentMedia();
  return ENVIRONMENT_PRESETS.filter((p) => media[p.id]).map((p) => ({ ...p, imageUrl: `/api/environments/${p.id}/image` }));
}
