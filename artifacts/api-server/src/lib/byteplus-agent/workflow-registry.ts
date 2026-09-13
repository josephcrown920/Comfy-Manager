/** Canonical boundary: executable workflows are distinct from reusable presets. */
export type VideoWorkflowId = "standard-video" | "cinematic-video" | "viral-video" | "image-to-video" | "character-video" | "lip-sync-video" | "get-ready-with-me";
export type VideoPreset = { id: string; label: string; workflowId: VideoWorkflowId; description?: string; params?: Record<string, unknown> };
export const VIDEO_WORKFLOWS: Record<VideoWorkflowId, { id: VideoWorkflowId; label: string; provider: "modelark"; input: string[] }> = {
  "standard-video": { id: "standard-video", label: "Standard Video", provider: "modelark", input: ["prompt"] },
  "cinematic-video": { id: "cinematic-video", label: "Cinematic Video", provider: "modelark", input: ["prompt", "references?"] },
  "viral-video": { id: "viral-video", label: "Viral Video", provider: "modelark", input: ["prompt", "references?"] },
  "image-to-video": { id: "image-to-video", label: "Image to Video", provider: "modelark", input: ["image", "prompt?"] },
  "character-video": { id: "character-video", label: "Character Video", provider: "modelark", input: ["image", "prompt", "references?"] },
  "lip-sync-video": { id: "lip-sync-video", label: "Lip Sync Video", provider: "modelark", input: ["video", "audio"] },
  "get-ready-with-me": { id: "get-ready-with-me", label: "Get Ready With Me", provider: "modelark", input: ["performance_video", "reference_images[]?", "reference_videos[]?", "outfit_reference", "scene_prompt?", "motion_context?"] },
};

export const WORKFLOW_BY_PRESET: Record<string, VideoWorkflowId> = {
  bullet_time_photo: "image-to-video", slow_push_in: "cinematic-video", vertigo_zoom: "cinematic-video", parallax_depth: "image-to-video",
  flash_frame_reveal: "viral-video", neon_outline: "viral-video", chrome_lux: "cinematic-video", broken_mirror: "viral-video",
  cash_rain: "viral-video", fire_meme: "viral-video", water_rap: "viral-video", trap_house: "cinematic-video", cold_vision: "cinematic-video",
  earth_zoom: "cinematic-video", speed_ramp_runway: "viral-video", moodboard_sheet: "standard-video", character_sheet: "character-video",
  storyboard_previs: "standard-video", album_cover_freeze: "image-to-video", glitch_clone_echo: "character-video", soft_beauty_turn: "character-video",
  get_ready_with_me: "get-ready-with-me",
};

export function resolveWorkflowForPreset(preset?: string | null, mode: "cinematic" | "viral" | "standard" = "standard"): VideoWorkflowId {
  const mapped = preset ? WORKFLOW_BY_PRESET[preset.toLowerCase().trim()] : undefined;
  if (mapped) return mapped;
  if (mode === "cinematic") return "cinematic-video";
  if (mode === "viral") return "viral-video";
  return "standard-video";
}

export function buildVideoExecutionContract(input: { preset?: string | null; mode?: "cinematic" | "viral" | "standard" }) {
  const workflowId = resolveWorkflowForPreset(input.preset, input.mode);
  return { workflow: VIDEO_WORKFLOWS[workflowId], workflowId, presetId: input.preset ?? null };
}
