import type { BatchInput } from "@workspace/api-client-react";

export type PerformAnywherePreset = "perform-anywhere" | "luxury-interior";

export type PerformAnywhereReferences = {
  identity: string;
  outfit: string;
  location: string;
  pose: string;
  prop: string;
};

export const PERFORM_ANYWHERE_CAMERA_TREATMENTS = [
  "wide-shot",
  "low-angle",
  "close-up-face",
  "over-shoulder",
  "dutch-angle",
] as const;

export function buildPerformAnywhereBatchInput({
  name,
  preset,
  references,
  sceneDescription,
  visualDirection,
  depthAsset,
  depthStrength,
}: {
  name: string;
  preset: PerformAnywherePreset;
  references: PerformAnywhereReferences;
  sceneDescription: string;
  visualDirection: string;
  depthAsset?: string;
  depthStrength?: number;
}): BatchInput {
  return {
    name,
    batchType: "perform-anywhere-angles",
    batchSize: 5,
    masterAsset: references.identity,
    identityAnchor: references.identity,
    outfitAsset: preset === "luxury-interior" ? references.identity : references.outfit,
    locationAsset: references.location,
    poseAsset: references.pose,
    propAsset: preset === "luxury-interior" ? references.location : references.prop,
    scenePrompt: sceneDescription.trim(),
    styleAnchor: visualDirection.trim(),
    ...(depthAsset ? { depthAsset, depthStrength } : {}),
    cameraTreatments: [...PERFORM_ANYWHERE_CAMERA_TREATMENTS],
    aspectRatios: ["16:9"],
    colorGrades: ["cinematic-neutral"],
    seedStrategy: "incremental",
    baseSeed: 24681357,
  };
}
