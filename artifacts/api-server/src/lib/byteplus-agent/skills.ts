export const VIDEO_SKILLS = {
  "cinematic-director": ["beat breakdown", "camera framing & movement", "lens optics", "volumetric lighting", "continuity-aware color"],
  "viral-growth-engine": ["thumb-stop hooks", "fast pacing", "faceless visual automation", "kinetic captions", "trend-aware pairing"],
  "comfyui-workflow-engineer": ["workflow selection", "node routing", "worker selection", "model assignment", "job reconciliation"],
  "modelark-seedance": ["reference-aware video", "Seedance task creation", "task polling", "ModelArk file preparation"],
} as const;

export function selectVideoSkills(instruction: string, mode: "cinematic" | "viral" | "standard" = "standard") {
  const q = instruction.toLowerCase();
  const selected = new Set<string>();
  if (mode === "cinematic" || /cinematic|film|anamorphic|lens|lighting|movie|trailer/.test(q)) selected.add("cinematic-director");
  if (mode === "viral" || /viral|hook|tiktok|reel|short|faceless|caption|trending/.test(q)) selected.add("viral-growth-engine");
  selected.add("modelark-seedance");
  selected.add("comfyui-workflow-engineer");
  return Array.from(selected);
}
