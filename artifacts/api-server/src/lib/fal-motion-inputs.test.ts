import { test } from "node:test";
import assert from "node:assert/strict";
import { hostedMotionInput, falTrackingPath } from "./fal-motion-inputs";

test("Kling receives the selected still and video motion reference", () => {
  assert.deepEqual(hostedMotionInput("perform-anywhere-kling", "image", "video", "dance"), {
    image_url: "image", video_url: "video", prompt: "dance", character_orientation: "video", keep_original_sound: true,
  });
});
test("OmniHuman receives audio, never video or a mislabeled depth mask", () => {
  const input = hostedMotionInput("perform-anywhere-omnihuman", "image", "audio", "sing");
  assert.equal(input.audio_url, "audio");
  assert.equal(input.resolution, "720p");
  assert.equal(Object.hasOwn(input, "video_url"), false);
  assert.equal(Object.hasOwn(input, "mask_url"), false);
  assert.equal(Object.hasOwn(input, "depth_map"), false);
});
test("queue tracking uses base application paths, not nested model paths", () => {
  assert.equal(falTrackingPath("perform-anywhere-kling", "fal:request_123"), "/fal-ai/kling-video/requests/request_123");
  assert.equal(falTrackingPath("perform-anywhere-omnihuman", "fal:request_456"), "/fal-ai/bytedance/requests/request_456");
});
test("untrusted model and request paths cannot escape the allowlisted queue", () => {
  assert.throws(() => hostedMotionInput("https://example.com", "image", "media"));
  for (const id of ["fal:../../secret", "other:request", "fal:?q=secret", "fal:"]) {
    assert.throws(() => falTrackingPath("perform-anywhere-kling", id));
  }
});
