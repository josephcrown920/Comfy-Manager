import { Router, type IRouter } from "express";
import { createSeedanceTask, getSeedanceTask, MODELARK_DEFAULT_MODEL } from "../lib/modelark";
import { buildVideoExecutionContract } from "../lib/byteplus-agent/workflow-registry";
import { generateModePlan, routeProvider, type Provider, type VideoMode } from "../lib/byteplus-agent/production";
import { resolvePreset } from "../lib/byteplus-agent/presets";

const router: IRouter = Router();

function parseMode(value: unknown): VideoMode {
  return value === "cinematic" || value === "viral" ? value : "standard";
}

router.post("/video-agent/plan", async (req, res): Promise<void> => {
  const instruction = String(req.body?.instruction || req.body?.prompt || "").trim();
  if (!instruction) {
    res.status(400).json({ error: "instruction is required" });
    return;
  }
  if (instruction.length > 6000) {
    res.status(400).json({ error: "instruction must be 6,000 characters or fewer" });
    return;
  }

  const mode = parseMode(req.body?.mode);
  const preset = resolvePreset(req.body?.preset, mode);
  const execution = buildVideoExecutionContract({ preset, mode });
  const plan = generateModePlan(mode, instruction);
  const provider = routeProvider(mode, new Set<Provider>(["modelark"]), "seedance");

  res.json({
    agent: "BytePlus Video Agent",
    provider,
    model: String(req.body?.model || process.env.MODELARK_SEEDANCE_MODEL || MODELARK_DEFAULT_MODEL),
    ...execution,
    plan,
  });
});

router.post("/video-agent/start", async (req, res): Promise<void> => {
  const instruction = String(req.body?.instruction || req.body?.prompt || "").trim();
  if (!instruction) {
    res.status(400).json({ error: "instruction is required" });
    return;
  }

  const mode = parseMode(req.body?.mode);
  const preset = resolvePreset(req.body?.preset, mode);
  const execution = buildVideoExecutionContract({ preset, mode });

  try {
    const task = await createSeedanceTask({
      ...req.body,
      prompt: instruction,
      motion_context: instruction,
      model: req.body?.model,
    }, "perform-anywhere-seedance");
    res.status(201).json({ agent: "BytePlus Video Agent", mode, ...execution, task });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not start BytePlus video generation." });
  }
});

router.get("/video-agent/status/:taskId", async (req, res): Promise<void> => {
  try {
    res.json(await getSeedanceTask(req.params.taskId));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not read BytePlus video task status." });
  }
});

export default router;
