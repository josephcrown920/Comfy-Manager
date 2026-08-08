import { Router, type IRouter } from "express";
import {
  ListWorkflowsResponse,
  GetWorkflowResponse,
  GetWorkflowParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Built-in workflow templates — no DB needed, these are code-defined
const WORKFLOWS = [
  {
    id: "lip-sync-basic",
    name: "Lip Sync",
    description:
      "Animate a portrait photo to speak audio — upload a face image and an audio clip to generate a talking video.",
    category: "lip-sync",
    icon: "Mic",
    estimatedTime: "2-5 min",
    params: [
      {
        key: "face_image",
        label: "Face Image",
        type: "file",
        description: "A clear portrait photo (front-facing works best)",
        required: true,
        defaultValue: null,
        options: null,
        min: null,
        max: null,
        accept: "image/*",
      },
      {
        key: "audio_file",
        label: "Audio File",
        type: "file",
        description: "The speech audio to sync (WAV or MP3)",
        required: true,
        defaultValue: null,
        options: null,
        min: null,
        max: null,
        accept: "audio/*",
      },
      {
        key: "sadtalker_model",
        label: "SadTalker Model",
        type: "select",
        description: "SadTalker checkpoint to use (must be installed in ComfyUI)",
        required: false,
        defaultValue: "SadTalker_V0.0.2_256.safetensors",
        options: ["SadTalker_V0.0.2_256.safetensors", "SadTalker_V0.0.2_512.safetensors"],
        min: null,
        max: null,
        accept: null,
      },
    ],
  },
  {
    id: "motion-control-animatediff",
    name: "Motion Control",
    description:
      "Add motion to a still image using AnimateDiff — control the movement style and intensity.",
    category: "motion-control",
    icon: "Zap",
    estimatedTime: "3-8 min",
    params: [
      {
        key: "source_image",
        label: "Source Image",
        type: "file",
        description: "The image to animate",
        required: true,
        defaultValue: null,
        options: null,
        min: null,
        max: null,
        accept: "image/*",
      },
      {
        key: "motion_preset",
        label: "Motion Style",
        type: "select",
        description: "The type of movement to apply",
        required: true,
        defaultValue: "zoom-in",
        options: ["zoom-in", "zoom-out", "pan-left", "pan-right", "tilt-up", "tilt-down", "rotate"],
        min: null,
        max: null,
        accept: null,
      },
      {
        key: "motion_strength",
        label: "Motion Strength",
        type: "slider",
        description: "How strong the motion effect is (0-100)",
        required: false,
        defaultValue: "50",
        options: null,
        min: 0,
        max: 100,
        accept: null,
      },
      {
        key: "num_frames",
        label: "Number of Frames",
        type: "slider",
        description: "How many frames to generate (16 = ~0.5s at 32fps)",
        required: false,
        defaultValue: "16",
        options: null,
        min: 8,
        max: 64,
        accept: null,
      },
      {
        key: "prompt",
        label: "Motion Prompt",
        type: "text",
        description: "Describe the motion in words (e.g. 'gentle camera pan across landscape')",
        required: false,
        defaultValue: "",
        options: null,
        min: null,
        max: null,
        accept: null,
      },
    ],
  },
  {
    id: "video-generation-txt2vid",
    name: "Text to Video",
    description:
      "Generate a short video clip from a text description using video generation models.",
    category: "video-generation",
    icon: "Video",
    estimatedTime: "5-15 min",
    params: [
      {
        key: "prompt",
        label: "Video Prompt",
        type: "text",
        description: "Describe the video you want to create",
        required: true,
        defaultValue: "",
        options: null,
        min: null,
        max: null,
        accept: null,
      },
      {
        key: "negative_prompt",
        label: "Negative Prompt",
        type: "text",
        description: "What to avoid in the video",
        required: false,
        defaultValue: "blurry, low quality, watermark",
        options: null,
        min: null,
        max: null,
        accept: null,
      },
      {
        key: "width",
        label: "Width",
        type: "select",
        description: "Output video width",
        required: false,
        defaultValue: "512",
        options: ["256", "512", "768", "1024"],
        min: null,
        max: null,
        accept: null,
      },
      {
        key: "height",
        label: "Height",
        type: "select",
        description: "Output video height",
        required: false,
        defaultValue: "512",
        options: ["256", "512", "768", "1024"],
        min: null,
        max: null,
        accept: null,
      },
      {
        key: "num_frames",
        label: "Number of Frames",
        type: "slider",
        description: "Total frames in the output video",
        required: false,
        defaultValue: "24",
        options: null,
        min: 8,
        max: 80,
        accept: null,
      },
      {
        key: "steps",
        label: "Inference Steps",
        type: "slider",
        description: "More steps = higher quality but slower",
        required: false,
        defaultValue: "25",
        options: null,
        min: 10,
        max: 50,
        accept: null,
      },
    ],
  },
  {
    id: "custom-workflow",
    name: "Custom Workflow",
    description:
      "Paste your own ComfyUI API-format workflow JSON and run it directly — supports any nodes or extensions installed on your server.",
    category: "custom",
    icon: "Code",
    estimatedTime: "varies",
    params: [
      {
        key: "workflow_json",
        label: "Workflow JSON",
        type: "text",
        description: "Paste your ComfyUI API-format workflow JSON here (export from ComfyUI with 'Save (API format)')",
        required: true,
        defaultValue: null,
        options: null,
        min: null,
        max: 999999,
        accept: null,
      },
    ],
  },
  {
    id: "img2vid-stable-video",
    name: "Image to Video",
    description:
      "Convert a still image into a short animated video clip using Stable Video Diffusion.",
    category: "video-generation",
    icon: "Film",
    estimatedTime: "3-10 min",
    params: [
      {
        key: "source_image",
        label: "Source Image",
        type: "file",
        description: "The image to animate into video",
        required: true,
        defaultValue: null,
        options: null,
        min: null,
        max: null,
        accept: "image/*",
      },
      {
        key: "motion_bucket_id",
        label: "Motion Amount",
        type: "slider",
        description: "Controls how much the scene moves (1 = subtle, 255 = heavy motion)",
        required: false,
        defaultValue: "127",
        options: null,
        min: 1,
        max: 255,
        accept: null,
      },
      {
        key: "fps",
        label: "Frames Per Second",
        type: "select",
        description: "Output video frame rate",
        required: false,
        defaultValue: "6",
        options: ["6", "8", "12", "24"],
        min: null,
        max: null,
        accept: null,
      },
      {
        key: "num_frames",
        label: "Number of Frames",
        type: "select",
        description: "Total frames in the video",
        required: false,
        defaultValue: "25",
        options: ["14", "25"],
        min: null,
        max: null,
        accept: null,
      },
    ],
  },
];

router.get("/workflows", async (_req, res): Promise<void> => {
  res.json(ListWorkflowsResponse.parse(WORKFLOWS));
});

router.get("/workflows/:id", async (req, res): Promise<void> => {
  const params = GetWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const workflow = WORKFLOWS.find((w) => w.id === params.data.id);
  if (!workflow) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }

  res.json(GetWorkflowResponse.parse(workflow));
});

export { WORKFLOWS };
export default router;
