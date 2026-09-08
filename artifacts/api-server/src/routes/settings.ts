import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
  AddSavedGpuBody,
  AddSavedGpuResponse,
  DeleteSavedGpuResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { redactComfyUrl, validateComfyTarget } from "../lib/comfy-target";

const router: IRouter = Router();

async function getComfyUrl(): Promise<string> {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "comfyUrl"))
    .limit(1);
  const configured = row[0]?.value ?? "http://localhost:8188";
  const validation = await validateComfyTarget(configured);
  if (!validation.ok) {
    throw new Error(`Configured ComfyUI target is unavailable: ${validation.error}`);
  }
  return validation.url;
}

type SavedGpu = { id: number; label: string; url: string };
export type ComfyWorker = SavedGpu;
export type RoutingMode = "auto" | "manual";

export type RoutingSettings = {
  comfyUrl: string;
  routingMode: RoutingMode;
  selectedGpuId: number | null;
};

async function getSavedGpus(): Promise<SavedGpu[]> {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "savedGpus"))
    .limit(1);
  if (!row[0]?.value) return [];
  try {
    const parsed = JSON.parse(row[0].value);
    return Array.isArray(parsed) ? (parsed as SavedGpu[]) : [];
  } catch {
    return [];
  }
}

async function getPublicSavedGpus(): Promise<SavedGpu[]> {
  return (await getSavedGpus()).map((gpu) => ({ ...gpu, url: redactComfyUrl(gpu.url) }));
}

async function getConfiguredSavedGpus(): Promise<SavedGpu[]> {
  try {
    const parsed = await getSavedGpus();
    const trusted: SavedGpu[] = [];
    for (const gpu of parsed) {
      const validation = await validateComfyTarget(gpu.url);
      if (validation.ok) trusted.push({ ...gpu, url: validation.url });
    }
    return trusted;
  } catch {
    return [];
  }
}

async function getSettingValue(key: string): Promise<string | null> {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, key))
    .limit(1);
  return row[0]?.value ?? null;
}

export async function getRoutingSettings(): Promise<RoutingSettings> {
  const comfyUrl = (await getSettingValue("comfyUrl")) ?? "http://localhost:8188";
  const routingMode = (await getSettingValue("routingMode")) === "manual" ? "manual" : "auto";
  const rawSelectedGpuId = await getSettingValue("selectedGpuId");
  const selectedGpuId = rawSelectedGpuId && Number.isFinite(Number(rawSelectedGpuId))
    ? Number(rawSelectedGpuId)
    : null;
  return { comfyUrl, routingMode, selectedGpuId };
}

export async function getConfiguredWorkers(): Promise<ComfyWorker[]> {
  const savedGpus = await getConfiguredSavedGpus();
  let comfyUrl: string | null = null;
  try {
    comfyUrl = await getComfyUrl();
  } catch {
    // Keep saved workers available for readiness checks when the current URL is offline.
  }
  if (comfyUrl && !savedGpus.some((gpu) => gpu.url === comfyUrl)) {
    return [{ id: 0, label: "Current ComfyUI", url: comfyUrl }, ...savedGpus];
  }
  return savedGpus;
}

async function setSavedGpus(gpus: SavedGpu[]): Promise<void> {
  const value = JSON.stringify(gpus);
  await db
    .insert(settingsTable)
    .values({ key: "savedGpus", value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

router.get("/settings", async (req, res): Promise<void> => {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "comfyUrl"))
    .limit(1);

  const comfyUrl = redactComfyUrl(row[0]?.value ?? "http://localhost:8188");
  const updatedAt = row[0]?.updatedAt ?? new Date();

  const routing = await getRoutingSettings();
  res.json(
    GetSettingsResponse.parse({
      comfyUrl,
      updatedAt,
      savedGpus: await getPublicSavedGpus(),
      routingMode: routing.routingMode,
      selectedGpuId: routing.selectedGpuId,
    })
  );
});

router.post("/settings/gpus", async (req, res): Promise<void> => {
  const parsed = AddSavedGpuBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const target = await validateComfyTarget(parsed.data.url);
  if (!target.ok) {
    res.status(400).json({ error: target.error });
    return;
  }

  const gpus = await getSavedGpus();
  const gpu: SavedGpu = {
    id: Date.now(),
    label: parsed.data.label.trim(),
    url: target.url,
  };
  await setSavedGpus([...gpus, gpu]);
  res.status(201).json(AddSavedGpuResponse.parse({ ...gpu, url: redactComfyUrl(gpu.url) }));
});

router.delete("/settings/gpus/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const gpus = await getSavedGpus();
  const remaining = gpus.filter((g) => g.id !== id);
  if (remaining.length === gpus.length) {
    res.status(404).json({ error: "Saved GPU not found" });
    return;
  }
  await setSavedGpus(remaining);
  res.json(DeleteSavedGpuResponse.parse({ success: true }));
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const currentRouting = await getRoutingSettings();
  const selectedGpuId = parsed.data.selectedGpuId === undefined
    ? currentRouting.selectedGpuId
    : parsed.data.selectedGpuId;
  const savedGpus = await getSavedGpus();
  const selectedGpu = selectedGpuId == null
    ? undefined
    : savedGpus.find((gpu) => gpu.id === selectedGpuId);
  if (selectedGpuId != null && !selectedGpu) {
    res.status(400).json({ error: "Selected GPU is not saved." });
    return;
  }

  const currentStoredUrl = (await getSettingValue("comfyUrl")) ?? currentRouting.comfyUrl;
  const requestedUrl = selectedGpu?.url ??
    (redactComfyUrl(currentStoredUrl) === redactComfyUrl(parsed.data.comfyUrl)
      ? currentStoredUrl
      : parsed.data.comfyUrl);
  const target = await validateComfyTarget(requestedUrl);
  if (!target.ok) {
    res.status(400).json({ error: target.error });
    return;
  }

  const routingMode = parsed.data.routingMode ?? currentRouting.routingMode;

  await db
    .insert(settingsTable)
    .values({ key: "comfyUrl", value: target.url })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: target.url, updatedAt: new Date() },
    });
  await db
    .insert(settingsTable)
    .values({ key: "routingMode", value: routingMode })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: routingMode, updatedAt: new Date() },
    });
  await db
    .insert(settingsTable)
    .values({ key: "selectedGpuId", value: selectedGpuId == null ? "" : String(selectedGpuId) })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: selectedGpuId == null ? "" : String(selectedGpuId), updatedAt: new Date() },
    });

  res.json(
    UpdateSettingsResponse.parse({
      comfyUrl: redactComfyUrl(target.url),
      updatedAt: new Date(),
      savedGpus: await getPublicSavedGpus(),
      routingMode,
      selectedGpuId,
    })
  );
});

export default router;
export { getComfyUrl };
