// Offline contracts for the shipped API-format templates, not a replacement for
// ComfyUI /object_info validation. Review these against node-pack source when
// upgrading packs; do not infer required inputs from the templates being tested.
// A trailing ? marks an optional input; uppercase names are typed output links.
const node = (inputs, outputs) => ({ inputs, outputs });
export const nodeContracts = {
  CheckpointLoaderSimple: node({ ckpt_name: "string" }, ["MODEL", "CLIP", "VAE"]),
  ImageOnlyCheckpointLoader: node({ ckpt_name: "string" }, ["MODEL", "CLIP_VISION", "VAE"]),
  CLIPTextEncode: node({ text: "text", clip: "CLIP" }, ["CONDITIONING"]),
  EmptyLatentImage: node({ width: "positiveInteger", height: "positiveInteger", batch_size: "positiveInteger" }, ["LATENT"]),
  KSampler: node({
    model: "MODEL", positive: "CONDITIONING", negative: "CONDITIONING", latent_image: "LATENT",
    seed: "nonnegativeInteger", steps: "positiveInteger", cfg: "nonnegative",
    sampler_name: "string", scheduler: "string", denoise: "unit",
  }, ["LATENT"]),
  VAEDecode: node({ samples: "LATENT", vae: "VAE" }, ["IMAGE"]),
  VAEEncode: node({ pixels: "IMAGE", vae: "VAE" }, ["LATENT"]),
  SaveImage: node({ images: "IMAGE", filename_prefix: "string?" }, []),
  LoadImage: node({ image: "string", upload: "string?" }, ["IMAGE", "MASK"]),
  LoadImageFromUrl: node({ image: "string" }, ["IMAGE", "MASK"]),
  ImageScale: node({ image: "IMAGE", upscale_method: "string", width: "nonnegativeInteger", height: "nonnegativeInteger", crop: "string" }, ["IMAGE"]),
  InvertMask: node({ mask: "MASK" }, ["MASK"]),
  SetLatentNoiseMask: node({ samples: "LATENT", mask: "MASK" }, ["LATENT"]),
  InspyrenetRembg: node({ image: "IMAGE", torchscript_jit: "string" }, ["IMAGE", "MASK"]),
  ADE_AnimateDiffLoaderGen1: node({ model: "MODEL", model_name: "string", beta_schedule: "string" }, ["MODEL"]),
  ADE_LoadAnimateDiffModel: node({ model_name: "string" }, ["MOTION_MODEL"]),
  ADE_ApplyAnimateDiffModelSimple: node({ motion_model: "MOTION_MODEL" }, ["M_MODELS"]),
  ADE_StandardStaticContextOptions: node({ context_length: "positiveInteger", context_stride: "positiveInteger", context_overlap: "nonnegativeInteger", closed_loop: "boolean" }, ["CONTEXT_OPTIONS"]),
  ADE_UseEvolvedSampling: node({ model: "MODEL", beta_schedule: "string", m_models: "M_MODELS", context_options: "CONTEXT_OPTIONS" }, ["MODEL"]),
  VHS_LoadVideo: node({
    video: "string", force_rate: "nonnegative", custom_width: "nonnegativeInteger",
    custom_height: "nonnegativeInteger", frame_load_cap: "nonnegativeInteger",
    skip_first_frames: "nonnegativeInteger", select_every_nth: "positiveInteger",
  }, ["IMAGE", "INT", "AUDIO", "VIDEO_INFO"]),
  VHS_LoadAudio: node({ audio_file: "string", seek_seconds: "nonnegative" }, ["AUDIO"]),
  LoadAudio: node({ audio: "string" }, ["AUDIO"]),
  VHS_VideoCombine: node({
    images: "IMAGE", frame_rate: "positive", format: "string", audio: "AUDIO?",
    loop_count: "nonnegativeInteger?", filename_prefix: "string?", pingpong: "boolean?", save_output: "boolean?",
  }, ["VHS_FILENAMES"]),
  VideoLengthAdjuster: node({ images: "IMAGE", audio: "AUDIO", mode: "string", fps: "positive", silent_padding_sec: "nonnegative" }, ["IMAGE", "AUDIO"]),
  LatentSyncNode: node({ images: "IMAGE", audio: "AUDIO", seed: "nonnegativeInteger", lips_expression: "nonnegative", inference_steps: "positiveInteger" }, ["IMAGE", "AUDIO"]),
  RepeatImageBatch: node({ image: "IMAGE", amount: "positiveInteger" }, ["IMAGE"]),
  SVD_img2vid_Conditioning: node({
    clip_vision: "CLIP_VISION", init_image: "IMAGE", vae: "VAE", width: "positiveInteger",
    height: "positiveInteger", video_frames: "positiveInteger", motion_bucket_id: "nonnegativeInteger",
    fps: "positiveInteger", augmentation_level: "nonnegative",
  }, ["CONDITIONING", "CONDITIONING", "LATENT"]),
  VideoLinearCFGGuidance: node({ model: "MODEL", min_cfg: "nonnegative" }, ["MODEL"]),
  DownloadAndLoadMimicMotionModel: node({ model: "string", precision: "string" }, ["MIMIC_PIPELINE"]),
  MimicMotionGetPoses: node({ ref_image: "IMAGE", pose_images: "IMAGE", include_body: "boolean", include_hand: "boolean", include_face: "boolean" }, ["IMAGE", "IMAGE"]),
  MimicMotionSampler: node({
    mimic_pipeline: "MIMIC_PIPELINE", ref_image: "IMAGE", pose_images: "IMAGE",
    steps: "positiveInteger", cfg_min: "nonnegative", cfg_max: "nonnegative", seed: "nonnegativeInteger",
    fps: "positive", noise_aug_strength: "nonnegative", context_size: "positiveInteger",
    context_overlap: "nonnegativeInteger", keep_model_loaded: "boolean",
  }, ["LATENT"]),
  MimicMotionDecode: node({ mimic_pipeline: "MIMIC_PIPELINE", samples: "LATENT", decode_chunk_size: "positiveInteger" }, ["IMAGE"]),
  ColorCorrect: node({ image: "IMAGE", temperature: "number", hue: "number", brightness: "number", contrast: "number", saturation: "number", gamma: "positive" }, ["IMAGE"]),
  ProPostFilmGrain: node({
    image: "IMAGE", gray_scale: "boolean", grain_type: "string", grain_sat: "number",
    grain_power: "number", shadows: "number", highs: "number", scale: "positive",
    sharpen: "number", src_gamma: "positive", seed: "nonnegativeInteger",
  }, ["IMAGE"]),
  ProPostVignette: node({ image: "IMAGE", intensity: "number", center_x: "unit", center_y: "unit" }, ["IMAGE"]),
  "RIFE VFI": node({
    frames: "IMAGE", ckpt_name: "string", clear_cache_after_n_frames: "positiveInteger",
    multiplier: "positiveInteger", fast_mode: "boolean", ensemble: "boolean", scale_factor: "positive",
    dtype: "string", torch_compile: "boolean?", batch_size: "positiveInteger?",
  }, ["IMAGE"]),
  UpscaleModelLoader: node({ model_name: "string" }, ["UPSCALE_MODEL"]),
  ImageUpscaleWithModel: node({ upscale_model: "UPSCALE_MODEL", image: "IMAGE" }, ["IMAGE"]),
};

const image = {
  capability: "SDXL text-to-image", output: "SaveImage",
  required: ["CheckpointLoaderSimple", "CLIPTextEncode", "EmptyLatentImage", "KSampler", "VAEDecode"],
  values: [["CheckpointLoaderSimple", "ckpt_name", "sd_xl_base_1.0.safetensors"]],
};
const lipSync = {
  capability: "audio-driven lip sync", output: "VHS_VideoCombine",
  required: ["VideoLengthAdjuster", "LatentSyncNode"],
  links: [["VHS_VideoCombine", "images", "LatentSyncNode", 0], ["VHS_VideoCombine", "audio", "LatentSyncNode", 1]],
};
export const templateContracts = {
  "sdxl-image.workflow.json": image,
  "cinematic-portrait.workflow.json": image,
  "epic-landscape.workflow.json": image,
  "blog-hero-image.workflow.json": image,
  "animatediff-text-to-video.workflow.json": {
    capability: "AnimateDiff text-to-video", output: "VHS_VideoCombine",
    required: ["ADE_AnimateDiffLoaderGen1", "CLIPTextEncode", "EmptyLatentImage", "KSampler", "VAEDecode"],
    links: [["KSampler", "model", "ADE_AnimateDiffLoaderGen1", 0]],
    values: [["CheckpointLoaderSimple", "ckpt_name", "v1-5-pruned-emaonly.safetensors"], ["ADE_AnimateDiffLoaderGen1", "model_name", "mm_sd_v15_v2.ckpt"]],
  },
  "svd-image-to-video.workflow.json": {
    capability: "SVD image-to-video", output: "VHS_VideoCombine",
    required: ["LoadImageFromUrl", "ImageOnlyCheckpointLoader", "SVD_img2vid_Conditioning", "VideoLinearCFGGuidance", "KSampler", "VAEDecode"],
    links: [["SVD_img2vid_Conditioning", "init_image", "LoadImageFromUrl", 0], ["KSampler", "latent_image", "SVD_img2vid_Conditioning", 2], ["KSampler", "model", "VideoLinearCFGGuidance", 0]],
    values: [["ImageOnlyCheckpointLoader", "ckpt_name", "svd_xt_1_1.safetensors"]],
  },
  "latentsync-lipsync.workflow.json": { ...lipSync, required: [...lipSync.required, "VHS_LoadVideo", "LoadAudio"] },
  "talking-avatar.workflow.json": {
    ...lipSync, capability: "portrait talking avatar",
    required: [...lipSync.required, "LoadImage", "VHS_LoadAudio", "RepeatImageBatch"],
    links: [...lipSync.links, ["RepeatImageBatch", "image", "LoadImage", 0], ["VideoLengthAdjuster", "images", "RepeatImageBatch", 0]],
  },
  "mimicmotion-motion.workflow.json": {
    capability: "MimicMotion pose transfer", output: "VHS_VideoCombine",
    required: ["LoadImage", "ImageScale", "VHS_LoadVideo", "DownloadAndLoadMimicMotionModel", "MimicMotionGetPoses", "MimicMotionSampler", "MimicMotionDecode"],
    links: [["MimicMotionGetPoses", "pose_images", "VHS_LoadVideo", 0], ["MimicMotionSampler", "pose_images", "MimicMotionGetPoses", 1], ["MimicMotionDecode", "samples", "MimicMotionSampler", 0], ["VHS_VideoCombine", "images", "MimicMotionDecode", 0]],
    values: [["DownloadAndLoadMimicMotionModel", "model", "MimicMotionMergedUnet_1-1-fp16.safetensors"]],
  },
  "film-grain-color-grade.workflow.json": {
    capability: "video color grade and film grain", output: "VHS_VideoCombine",
    required: ["VHS_LoadVideo", "ColorCorrect", "ProPostFilmGrain", "ProPostVignette"],
    links: [["ColorCorrect", "image", "VHS_LoadVideo", 0], ["ProPostFilmGrain", "image", "ColorCorrect", 0], ["ProPostVignette", "image", "ProPostFilmGrain", 0], ["VHS_VideoCombine", "images", "ProPostVignette", 0], ["VHS_VideoCombine", "audio", "VHS_LoadVideo", 2]],
  },
  "slow-motion-upscale.workflow.json": {
    capability: "video interpolation and upscale", output: "VHS_VideoCombine",
    required: ["VHS_LoadVideo", "RIFE VFI", "UpscaleModelLoader", "ImageUpscaleWithModel"],
    links: [["RIFE VFI", "frames", "VHS_LoadVideo", 0], ["ImageUpscaleWithModel", "image", "RIFE VFI", 0], ["VHS_VideoCombine", "images", "ImageUpscaleWithModel", 0]],
    values: [["RIFE VFI", "ckpt_name", "rife47.pth"], ["UpscaleModelLoader", "model_name", "RealESRGAN_x2.pth"]],
  },
  "instagram-reel-loop.workflow.json": {
    capability: "AnimateDiff looping reel", output: "VHS_VideoCombine",
    required: ["CheckpointLoaderSimple", "ADE_LoadAnimateDiffModel", "ADE_ApplyAnimateDiffModelSimple", "ADE_StandardStaticContextOptions", "ADE_UseEvolvedSampling", "KSampler", "VAEDecode"],
    links: [["ADE_UseEvolvedSampling", "m_models", "ADE_ApplyAnimateDiffModelSimple", 0], ["ADE_UseEvolvedSampling", "context_options", "ADE_StandardStaticContextOptions", 0], ["KSampler", "model", "ADE_UseEvolvedSampling", 0]],
    values: [["ADE_StandardStaticContextOptions", "closed_loop", true], ["ADE_LoadAnimateDiffModel", "model_name", "mm_sd_v15_v2.ckpt"], ["CheckpointLoaderSimple", "ckpt_name", "v1-5-pruned-emaonly.safetensors"]],
  },
  "product-background-swap.workflow.json": {
    ...image, capability: "masked product background replacement",
    required: ["LoadImage", "InspyrenetRembg", "InvertMask", "VAEEncode", "SetLatentNoiseMask", "KSampler", "VAEDecode"],
    links: [["InvertMask", "mask", "InspyrenetRembg", 1], ["SetLatentNoiseMask", "mask", "InvertMask", 0], ["KSampler", "latent_image", "SetLatentNoiseMask", 0]],
  },
};
