import { z } from "zod";
import { WORKFLOWS } from "../routes/workflows";

export const COMPLETE_APP = "perform-anywhere-complete";
export const appSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000),
  workflowId: z.string().max(100),
  presetParams: z.record(z.string().max(80), z.union([z.string().max(4000), z.number().finite(), z.boolean()])),
  exposedKeys: z.array(z.string().max(80)).max(50),
  isPublished: z.boolean(),
  allowEmbed: z.boolean(),
}).strict();

export type AppInput = z.infer<typeof appSchema>;
export type StoredApp = AppInput & { slug: string; ownerId: string };

export function validateApp(input: AppInput): AppInput {
  const workflow = WORKFLOWS.find((w) => w.id === input.workflowId);
  if (input.workflowId !== COMPLETE_APP && (!workflow || ["custom-workflow", "perform-anywhere-angles"].includes(input.workflowId))) {
    throw new Error("Choose a supported single workflow or Complete Perform Anywhere.");
  }
  const allowed = input.workflowId === COMPLETE_APP
    ? ["scene_description", "visual_direction", "motion_context", "preset", "motion_provider"]
    : workflow!.params.map((p) => p.key);
  if (Object.keys(input.presetParams).some((k) => !allowed.includes(k)) || input.exposedKeys.some((k) => !allowed.includes(k))) {
    throw new Error("The app contains fields not supported by its workflow.");
  }
  if (input.workflowId === COMPLETE_APP) {
    if (input.exposedKeys.some((k) => ["preset", "motion_provider"].includes(k))) throw new Error("Preset and motion provider are fixed app settings.");
    if (input.presetParams.preset && !["perform-anywhere", "luxury-interior"].includes(String(input.presetParams.preset))) throw new Error("Invalid reference preset.");
    if (input.presetParams.motion_provider && !["seedance", "mimicmotion"].includes(String(input.presetParams.motion_provider))) throw new Error("Invalid motion provider.");
    for (const key of ["scene_description", "visual_direction", "motion_context"]) {
      if (!input.exposedKeys.includes(key) && !String(input.presetParams[key] ?? "").trim()) throw new Error(`Set a fixed value or expose ${key}.`);
    }
  } else {
    for (const p of workflow!.params) {
      const value = input.presetParams[p.key];
      if (p.type === "file") {
        if (value !== undefined) throw new Error("Uploaded files cannot be shared as fixed presets. Each runner must upload their own assets.");
        if (!input.exposedKeys.includes(p.key)) throw new Error("File inputs must remain editable.");
      } else if (value !== undefined) {
        if (p.type === "select" && !p.options?.includes(String(value))) throw new Error(`Invalid value for ${p.label}.`);
        if (["slider", "number"].includes(p.type)) {
          const n = Number(value);
          if (!Number.isFinite(n) || (p.min !== null && n < p.min) || (p.max !== null && n > p.max)) throw new Error(`Invalid value for ${p.label}.`);
        }
      }
      if (p.required && !input.exposedKeys.includes(p.key) && (value === undefined || value === "")) throw new Error(`Set a fixed value or expose ${p.label}.`);
    }
  }
  return input;
}

export function singleAppParams(app: StoredApp, values: Record<string, unknown>) {
  const workflow = WORKFLOWS.find((w) => w.id === app.workflowId)!;
  const defaults = Object.fromEntries(workflow.params.filter((p) => p.defaultValue !== null).map((p) => [p.key, p.defaultValue]));
  return { ...defaults, ...app.presetParams, ...Object.fromEntries(Object.entries(values).filter(([key]) => app.exposedKeys.includes(key))) };
}
