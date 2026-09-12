export const CINEMATIC_PRESETS = [
  "anamorphic_dolly", "slow_push_in", "vertigo_zoom", "parallax_depth", "cold_vision", "film_noir_key", "macro_lens_focus", "one_shot_tracking", "imax_landscape",
] as const;

export const VIRAL_PRESETS = [
  "HOOK_THUMB_STOP", "FAST_CUT_MONTAGE", "FACELESS_TEXT_OVERLAY", "TRENDING_SPEED_RAMP", "SPLIT_SCREEN_REACTION", "BOOT DOMINANCE", "FIRE MEME", "WATER RAP", "NEON DRIP", "CASH RAIN", "LEAN HAZE", "TRAP HOUSE", "COLD VISION", "BROKEN MIRROR", "FRAGMENTS", "PALETTE", "EARTH ZOOM",
] as const;

export const PRESET_TO_WORKFLOW: Record<string, string> = {
  bullet_time_photo: "image-to-video", slow_push_in: "cinematic-video", vertigo_zoom: "cinematic-video", parallax_depth: "image-to-video",
  neon_outline: "viral-video", chrome_lux: "cinematic-video", broken_mirror: "viral-video", cash_rain: "viral-video", fire_meme: "viral-video",
  water_rap: "viral-video", trap_house: "cinematic-video", cold_vision: "cinematic-video", earth_zoom: "cinematic-video", speed_ramp_runway: "viral-video",
  character_sheet: "character-video", album_cover_freeze: "image-to-video", glitch_clone_echo: "character-video", soft_beauty_turn: "character-video",
};

export function resolvePreset(input?: string | null, mode: "cinematic" | "viral" | "standard" = "standard") {
  const q = String(input || "").trim();
  if (q && (PRESET_TO_WORKFLOW[q] || CINEMATIC_PRESETS.includes(q as never) || VIRAL_PRESETS.includes(q as never))) return q;
  return mode === "cinematic" ? "slow_push_in" : mode === "viral" ? "HOOK_THUMB_STOP" : null;
}
