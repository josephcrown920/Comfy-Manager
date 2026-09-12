export type VideoWorkflowId = "standard-video" | "cinematic-video" | "viral-video" | "image-to-video" | "character-video" | "lip-sync-video";

export const VIDEO_WORKFLOWS: Record<VideoWorkflowId, { id: VideoWorkflowId; label: string; provider: "modelark"; input: string[] }> = {
  "standard-video": { id: "standard-video", label: "Standard Video", provider: "modelark", input: ["prompt"] },
  "cinematic-video": { id: "cinematic-video", label: "Cinematic Video", provider: "modelark", input: ["prompt", "references?"] },
  "viral-video": { id: "viral-video", label: "Viral Video", provider: "modelark", input: ["prompt", "references?"] },
  "image-to-video": { id: "image-to-video", label: "Image to Video", provider: "modelark", input: ["image", "prompt?"] },
  "character-video": { id: "character-video", label: "Character Video", provider: "modelark", input: ["image", "prompt", "references?"] },
  "lip-sync-video": { id: "lip-sync-video", label: "Lip Sync Video", provider: "modelark", input: ["video", "audio"] },
};

const PRESET_WORKFLOW: Record<string, VideoWorkflowId> = {
  slow_push_in: "cinematic-video", anamorphic_dolly: "cinematic-video", vertigo_zoom: "cinematic-video", parallax_depth: "image-to-video",
  cash_rain: "viral-video", fire_meme: "viral-video", water_rap: "viral-video", neon_drip: "viral-video", character_sheet: "character-video", glitch_clone_echo: "character-video", album_cover_freeze: "image-to-video", bullet_time_photo: "image-to-video",
};

export function resolveWorkflowForPreset(preset?: string | null, mode: "cinematic" | "viral" | "standard" = "standard"): VideoWorkflowId {
  const mapped = preset ? PRESET_WORKFLOW[preset.toLowerCase().trim()] : undefined;
  return mapped || (mode === "cinematic" ? "cinematic-video" : mode === "viral" ? "viral-video" : "standard-video");
}

export function buildVideoExecutionContract(input: { preset?: string | null; mode?: "cinematic" | "viral" | "standard" }) {
  const mode = input.mode || "standard";
  const presetId = input.preset || null;
  const workflowId = resolveWorkflowForPreset(presetId, mode);
  return { workflow: VIDEO_WORKFLOWS[workflowId], workflowId, presetId, provider: "modelark" as const };
}
