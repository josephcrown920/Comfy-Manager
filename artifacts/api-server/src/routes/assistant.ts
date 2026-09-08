import { Router, type IRouter, type Response } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AssistantChatBody, AssistantVideoPlanBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  MAX_ASSISTANT_REQUESTS_PER_DAY,
  reserveAssistantRequest,
} from "../lib/resource-quotas";

const router: IRouter = Router();

const MODEL = "gpt-5.6-terra";

// --- Abuse guards: input bounds + a simple per-user rate limiter -------------
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 8000;
const MAX_IDEA_CHARS = 4000;
const MAX_WORKFLOW_CHARS = 100_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 5;
const MAX_CONCURRENT = 2;

const rateBuckets = new Map<string, number[]>();
let inFlight = 0;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(userId) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (bucket.length >= RATE_MAX_REQUESTS) return false;
  bucket.push(now);
  rateBuckets.set(userId, bucket);
  if (rateBuckets.size > 1000) {
    for (const [k, v] of rateBuckets) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) rateBuckets.delete(k);
    }
  }
  return true;
}

function guard(userId: string, res: Response): boolean {
  if (!checkRateLimit(userId)) {
    res
      .status(429)
      .json({
        error: "Too many AI requests — please wait a minute and try again.",
      });
    return false;
  }
  if (inFlight >= MAX_CONCURRENT) {
    res
      .status(429)
      .json({ error: "The assistant is busy — please try again in a moment." });
    return false;
  }
  inFlight++;
  return true;
}

async function reserveAssistant(
  userId: string,
  res: Response,
): Promise<boolean> {
  try {
    const reserved = await reserveAssistantRequest(userId);
    if (!reserved) {
      res.status(429).json({
        error: `Daily assistant limit reached (${MAX_ASSISTANT_REQUESTS_PER_DAY} requests). Please try again tomorrow.`,
      });
      return false;
    }
    return true;
  } catch (err) {
    // Quota storage is part of the cost-control boundary. Never fail open if
    // PostgreSQL is unavailable.
    console.error("assistant quota check failed:", err);
    res
      .status(503)
      .json({
        error: "The assistant is temporarily unavailable. Please try again.",
      });
    return false;
  }
}

router.use(requireAuth);

// The server may run from src (tsx), from dist (bundled), or with cwd at the
// repo root (deployment) — try each candidate and use the first that exists.
const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR_CANDIDATES = [
  path.resolve(here, "../../../comfyui-studio/src/assets/templates"),
  path.resolve(
    here,
    "../../../../artifacts/comfyui-studio/src/assets/templates",
  ),
  path.resolve(process.cwd(), "../comfyui-studio/src/assets/templates"),
  path.resolve(process.cwd(), "artifacts/comfyui-studio/src/assets/templates"),
];

let templatesDir: string | null = null;
async function getTemplatesDir(): Promise<string> {
  if (templatesDir) return templatesDir;
  for (const dir of TEMPLATE_DIR_CANDIDATES) {
    try {
      await readFile(path.join(dir, "sdxl-image.workflow.json"), "utf8");
      templatesDir = dir;
      return dir;
    } catch {
      // try next candidate
    }
  }
  throw new Error("Workflow templates directory not found");
}

const TEMPLATE_FILES: Record<string, { file: string; summary: string }> = {
  "sdxl-image": {
    file: "sdxl-image.workflow.json",
    summary:
      "Text-to-image with SDXL. Needs ~12 GB VRAM. Edit the two CLIPTextEncode prompts.",
  },
  animatediff: {
    file: "animatediff-text-to-video.workflow.json",
    summary:
      "Text-to-video, SD1.5 + AnimateDiff. Runs on a free 16 GB T4. Edit the two CLIPTextEncode prompts (positive and negative).",
  },
  svd: {
    file: "svd-image-to-video.workflow.json",
    summary:
      "Animate a still image with Stable Video Diffusion XT. Needs ~20+ GB VRAM. User must supply an image URL or uploaded filename in the LoadImageFromUrl node.",
  },
  latentsync: {
    file: "latentsync-lipsync.workflow.json",
    summary:
      "Lip-sync a talking-head video to an audio track (LatentSync). Runs on 16 GB. User must upload a video and an audio file and put the filenames in VHS_LoadVideo and LoadAudio.",
  },
  mimicmotion: {
    file: "mimicmotion-motion.workflow.json",
    summary:
      "Drive a still image with a pose/motion video (MimicMotion). Needs ~20+ GB VRAM. User must upload a reference image and a pose video.",
  },
};

async function loadTemplate(id: string): Promise<string> {
  const entry = TEMPLATE_FILES[id];
  if (!entry) throw new Error(`Unknown template id: ${id}`);
  return readFile(path.join(await getTemplatesDir(), entry.file), "utf8");
}

const STUDIO_CONTEXT = `You are the built-in assistant of ComfyUI Studio, a beginner-friendly web app that drives the user's own ComfyUI server (usually a free Colab/Kaggle GPU connected through a tunnel URL).

App layout the user sees: Dashboard, Generate (templates + custom workflow JSON), Jobs, Gallery, Models, Launch GPU (copy-paste notebook script that installs ComfyUI on Colab/Kaggle and prints a tunnel URL), Settings (paste the tunnel URL, saved GPUs).

Built-in one-click templates:
${Object.entries(TEMPLATE_FILES)
  .map(([id, t]) => `- ${id}: ${t.summary}`)
  .join("\n")}

Guidelines:
- Speak plainly for beginners; avoid jargon or explain it in one clause.
- ComfyUI workflows are JSON graphs: each node has a class_type and inputs; ["3", 0] means "output 0 of node 3".
- If the user has no GPU connected, point them to the Launch GPU page.
- Free T4 (16 GB) cannot run SVD or MimicMotion; suggest AnimateDiff or lip sync instead.
- Keep answers short and actionable. Use markdown lists where helpful.`;

router.post("/assistant/chat", async (req, res): Promise<void> => {
  const parsed = AssistantChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { messages, workflowJson } = parsed.data;
  if (
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    messages.some((m) => m.content.length > MAX_MESSAGE_CHARS) ||
    (workflowJson && workflowJson.length > MAX_WORKFLOW_CHARS)
  ) {
    res.status(400).json({ error: "Message too long or too many messages." });
    return;
  }
  const userId = res.locals.userId as string;
  if (!guard(userId, res)) return;
  if (!(await reserveAssistant(userId, res))) {
    inFlight--;
    return;
  }
  try {
    const system =
      STUDIO_CONTEXT +
      (workflowJson
        ? `\n\nThe user is currently editing this workflow JSON:\n\`\`\`json\n${workflowJson.slice(0, 8000)}\n\`\`\``
        : "");
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    const reply = completion.choices[0]?.message?.content ?? "";
    res.json({ reply });
  } catch (err) {
    console.error("assistant chat failed:", err);
    res.status(502).json({ error: "AI request failed. Please try again." });
  } finally {
    inFlight--;
  }
});

router.post("/assistant/video-plan", async (req, res): Promise<void> => {
  const parsed = AssistantVideoPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { idea } = parsed.data;
  if (idea.length === 0 || idea.length > MAX_IDEA_CHARS) {
    res
      .status(400)
      .json({ error: "Idea must be between 1 and 4000 characters." });
    return;
  }
  const userId = res.locals.userId as string;
  if (!guard(userId, res)) return;
  if (!(await reserveAssistant(userId, res))) {
    inFlight--;
    return;
  }
  try {
    const videoTemplates = [
      "animatediff",
      "svd",
      "latentsync",
      "mimicmotion",
      "sdxl-image",
    ];
    const templateDump = (
      await Promise.all(
        videoTemplates.map(
          async (id) => `### ${id}\n${await loadTemplate(id)}`,
        ),
      )
    ).join("\n\n");

    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${STUDIO_CONTEXT}

You are acting as the video agent. Given the user's idea, pick the best-fitting template and fill in its settings (prompts, frame counts, fps, seeds, etc.). Do NOT invent nodes or change class_type values — only edit input values in the chosen template. Keep any REPLACE_WITH_… placeholder filenames as-is and tell the user to upload those files.

Respond with ONLY a JSON object: {"templateId": "<one of: ${videoTemplates.join(", ")}>", "workflow": <the filled workflow JSON object>, "notes": "<plain-language explanation: what you picked, what settings you filled, and what the user still has to do>"}

The templates:

${templateDump}`,
        },
        { role: "user", content: idea },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const plan = JSON.parse(raw) as {
      templateId?: string;
      workflow?: unknown;
      notes?: string;
    };
    if (
      !plan.templateId ||
      !TEMPLATE_FILES[plan.templateId] ||
      typeof plan.workflow !== "object" ||
      plan.workflow === null
    ) {
      res
        .status(502)
        .json({
          error:
            "AI returned an unusable plan. Please try rephrasing your idea.",
        });
      return;
    }
    // Structural validation: the filled workflow must have exactly the same
    // node ids and class_types as the canonical template — the model may only
    // change input values, never add/remove/replace nodes.
    const canonical = JSON.parse(await loadTemplate(plan.templateId)) as Record<
      string,
      { class_type?: string }
    >;
    const filled = plan.workflow as Record<string, { class_type?: string }>;
    const canonicalIds = Object.keys(canonical).sort();
    const filledIds = Object.keys(filled).sort();
    const structureOk =
      canonicalIds.length === filledIds.length &&
      canonicalIds.every(
        (id, i) =>
          filledIds[i] === id &&
          filled[id]?.class_type === canonical[id]?.class_type,
      );
    if (!structureOk) {
      res
        .status(502)
        .json({
          error:
            "AI produced an invalid workflow. Please try rephrasing your idea.",
        });
      return;
    }
    res.json({
      templateId: plan.templateId,
      workflowJson: JSON.stringify(plan.workflow, null, 2),
      notes: plan.notes ?? "",
    });
  } catch (err) {
    console.error("video plan failed:", err);
    res.status(502).json({ error: "AI request failed. Please try again." });
  } finally {
    inFlight--;
  }
});

export default router;
