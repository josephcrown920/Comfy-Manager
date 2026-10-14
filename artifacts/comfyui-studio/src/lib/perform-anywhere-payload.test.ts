import { describe, expect, it } from "vitest";
import {
  buildPerformAnywhereBatchInput,
  PERFORM_ANYWHERE_CAMERA_TREATMENTS,
} from "./perform-anywhere-payload";

const references = {
  identity: "identity-upload.jpg",
  outfit: "outfit-upload.heic",
  location: "location-upload.webp",
  pose: "pose-upload.png",
  prop: "prop-upload.jpg",
};

describe("Perform Anywhere batch payload", () => {
  it("sends the selected Outfit asset to all five angle children", () => {
    const payload = buildPerformAnywhereBatchInput({
      name: "Perform Anywhere",
      preset: "perform-anywhere",
      references,
      sceneDescription: "  A midnight performance. ",
      visualDirection: "  Editorial night lighting. ",
    });

    expect(payload).toMatchObject({
      batchType: "perform-anywhere-angles",
      batchSize: 5,
      masterAsset: "identity-upload.jpg",
      identityAnchor: "identity-upload.jpg",
      outfitAsset: "outfit-upload.heic",
      locationAsset: "location-upload.webp",
      poseAsset: "pose-upload.png",
      propAsset: "prop-upload.jpg",
      scenePrompt: "A midnight performance.",
      styleAnchor: "Editorial night lighting.",
    });
    expect(payload.cameraTreatments).toEqual([...PERFORM_ANYWHERE_CAMERA_TREATMENTS]);
  });

  it("preserves the luxury-interior identity and location mapping", () => {
    const payload = buildPerformAnywhereBatchInput({
      name: "Luxury interior",
      preset: "luxury-interior",
      references,
      sceneDescription: "Vehicle interior",
      visualDirection: "Automotive campaign",
    });

    expect(payload.outfitAsset).toBe(references.identity);
    expect(payload.propAsset).toBe(references.location);
    expect(payload.batchSize).toBe(5);
  });
});
