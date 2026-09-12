export type VideoMode = "cinematic" | "viral" | "standard";
export type Provider = "modelark" | "fal" | "replicate" | "vast_comfyui";

export interface ShotBeat {
  order: number;
  beatType: string;
  prompt: string;
  durationSec: number;
  camera?: string;
  motion?: string;
  transition?: string;
  captionText?: string;
}

export interface ShotPlan {
  mode: VideoMode;
  title: string;
  summary: string;
  totalDurationSec: number;
  aspectRatio: string;
  shots: ShotBeat[];
  recommendedPreset?: string;
}

export const DEFAULT_CHAIN: Provider[] = ["modelark", "fal", "replicate", "vast_comfyui"];

export function routeProvider(mode: VideoMode, available: Set<Provider>, taskType = "video"): Provider {
  const candidates = DEFAULT_CHAIN.filter((p) => available.has(p));
  if (!candidates.length) return "modelark";
  if (available.has("modelark") && (mode === "cinematic" || /seedance|modelark/i.test(taskType))) return "modelark";
  if (available.has("fal") && mode === "viral") return "fal";
  return candidates[0];
}

export function generateModePlan(mode: VideoMode, instruction: string): ShotPlan {
  if (mode === "cinematic") return {
    mode, title: "Cinematic Sequence Plan", summary: `Structured cinematic sequence: ${instruction}`,
    totalDurationSec: 15, aspectRatio: "16:9", recommendedPreset: "slow_push_in",
    shots: [
      { order: 1, beatType: "Establishing Atmosphere", prompt: `Cinematic wide establishing shot for: ${instruction}`, durationSec: 5, camera: "Slow Push In", motion: "Subtle atmospheric movement, 24fps", transition: "Dissolve" },
      { order: 2, beatType: "Character / Focus Beat", prompt: `Medium close-up with rich key lighting and anamorphic depth for: ${instruction}`, durationSec: 5, camera: "Parallax Tracking", motion: "Controlled performance movement", transition: "Match Cut" },
      { order: 3, beatType: "Climax / Key Reveal", prompt: `Dramatic low-angle tracking shot with volumetric depth for: ${instruction}`, durationSec: 5, camera: "Vertigo Zoom / Crane Rise", motion: "Peak action or emotional resonance", transition: "Fade to Black" },
    ],
  };
  if (mode === "viral") return {
    mode, title: "Viral Short-Form Plan", summary: `Hook-first short-form sequence: ${instruction}`,
    totalDurationSec: 9, aspectRatio: "9:16", recommendedPreset: "HOOK_THUMB_STOP",
    shots: [
      { order: 1, beatType: "Thumb-Stop Hook", prompt: `High-energy visual hook for: ${instruction}`, durationSec: 2, camera: "Dynamic Whip Zoom", motion: "Fast speed ramp", transition: "Glitch Cut", captionText: "STOP SCROLLING!" },
      { order: 2, beatType: "Core Beat", prompt: `Fast-paced faceless/trending B-roll for: ${instruction}`, durationSec: 4, camera: "Rapid Pan", motion: "Punchy movement", transition: "Zoom Flash" },
      { order: 3, beatType: "Call To Action", prompt: `High-contrast CTA visual for: ${instruction}`, durationSec: 3, camera: "Center Punch Zoom", motion: "Text pop animation", transition: "Snap", captionText: "FOLLOW FOR MORE" },
    ],
  };
  return {
    mode: "standard", title: "Standard Storyboard Plan", summary: instruction,
    totalDurationSec: 10, aspectRatio: "16:9",
    shots: [
      { order: 1, beatType: "Opening Scene", prompt: `Opening shot: ${instruction}`, durationSec: 5, camera: "Pan Right", transition: "Dissolve" },
      { order: 2, beatType: "Main Scene", prompt: `Continuation shot: ${instruction}`, durationSec: 5, camera: "Static", transition: "Cut" },
    ],
  };
}

export function acceptanceGate(x: { providerReady: boolean; jobObserved: boolean; qaPassed: boolean; renderVerified: boolean }): boolean {
  return Object.values(x).every(Boolean);
}
