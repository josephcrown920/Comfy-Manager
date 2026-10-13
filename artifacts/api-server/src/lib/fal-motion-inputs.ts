export const FAL_MOTION_MODELS: Record<string, string> = {
  "perform-anywhere-kling": "fal-ai/kling-video/v2.6/pro/motion-control",
  "perform-anywhere-omnihuman": "fal-ai/bytedance/omnihuman/v1.5",
};
export function hostedMotionInput(workflowId: string, image: string, performance: string, context = "") {
  if (!Object.hasOwn(FAL_MOTION_MODELS, workflowId)) throw new Error("Unsupported hosted motion provider.");
  if (workflowId === "perform-anywhere-omnihuman") {
    return { image_url: image, audio_url: performance, prompt: context, resolution: "720p" };
  }
  return { image_url: image, video_url: performance, prompt: context, character_orientation: "video", keep_original_sound: true };
}
export function falTrackingPath(workflowId: string, promptId: string) {
  const model = FAL_MOTION_MODELS[workflowId];
  const id = promptId.slice(4);
  if (!model || !promptId.startsWith("fal:") || !/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new Error("Invalid hosted motion task.");
  return `/${model.split("/").slice(0, 2).join("/")}/requests/${id}`;
}
