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

const router: IRouter = Router();

async function getComfyUrl(): Promise<string> {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "comfyUrl"))
    .limit(1);
  return row[0]?.value ?? "http://localhost:8188";
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
  const { comfyUrl } = await getRoutingSettings();
  const savedGpus = await getSavedGpus();
  if (!savedGpus.some((gpu) => gpu.url === comfyUrl)) {
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

  const comfyUrl = row[0]?.value ?? "http://localhost:8188";
  const updatedAt = row[0]?.updatedAt ?? new Date();

  const routing = await getRoutingSettings();
  res.json(
    GetSettingsResponse.parse({
      comfyUrl,
      updatedAt,
      savedGpus: await getSavedGpus(),
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
  try {
    new URL(parsed.data.url);
  } catch {
    res.status(400).json({ error: "Not a valid URL" });
    return;
  }

  const gpus = await getSavedGpus();
  const gpu: SavedGpu = {
    id: Date.now(),
    label: parsed.data.label.trim(),
    url: parsed.data.url.trim(),
  };
  await setSavedGpus([...gpus, gpu]);
  res.status(201).json(AddSavedGpuResponse.parse(gpu));
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
  const routingMode = parsed.data.routingMode ?? currentRouting.routingMode;
  const selectedGpuId = parsed.data.selectedGpuId === undefined
    ? currentRouting.selectedGpuId
    : parsed.data.selectedGpuId;

  await db
    .insert(settingsTable)
    .values({ key: "comfyUrl", value: parsed.data.comfyUrl })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: parsed.data.comfyUrl, updatedAt: new Date() },
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
      comfyUrl: parsed.data.comfyUrl,
      updatedAt: new Date(),
      savedGpus: await getSavedGpus(),
      routingMode,
      selectedGpuId,
    })
  );
});

export default router;
export { getComfyUrl };
