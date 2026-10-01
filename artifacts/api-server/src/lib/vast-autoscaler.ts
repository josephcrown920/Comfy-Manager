import { and, eq, inArray } from "drizzle-orm";
import { db, jobsTable, settingsTable } from "@workspace/db";
import { logger } from "./logger";
import { fetchComfy } from "../routes/comfy";
import type { ComfyWorker } from "../routes/settings";

const VAST_API_BASE = "https://console.vast.ai/api/v0";
const CONFIG_KEY = "vastAutoscaleConfig";
const STATE_KEY = "vastAutoscaleState";
const OFFICIAL_COMFY_TEMPLATE = "b349721c098bec541f600cd96e50b00f";

export type VastAutoscaleConfig = {
  enabled: boolean;
  maxHourlyRate: number;
  minGpuRamGb: number;
  minReliability: number;
  idleMinutes: number;
  diskGb: number;
  startupTimeoutMinutes: number;
  templateHashId: string;
};

type VastAutoscaleState = {
  instanceId: number | null;
  offerId: number | null;
  status: "idle" | "searching" | "provisioning" | "running" | "stopping" | "error";
  gpuName: string | null;
  hourlyRate: number | null;
  workerUrl: string | null;
  startedAt: string | null;
  idleSince: string | null;
  lastError: string | null;
};

type VastOffer = {
  id?: unknown;
  gpu_name?: unknown;
  gpu_ram?: unknown;
  dph_total?: unknown;
  reliability2?: unknown;
};

type SelectedVastOffer = {
  id: number;
  gpu_name: string;
  dph_total: number;
};

type VastInstance = Record<string, unknown> & {
  id?: unknown;
  actual_status?: unknown;
  gpu_name?: unknown;
  public_ipaddr?: unknown;
  ports?: unknown;
};

const DEFAULT_CONFIG: VastAutoscaleConfig = {
  enabled: false,
  maxHourlyRate: 0.35,
  minGpuRamGb: 16,
  minReliability: 0.95,
  idleMinutes: 10,
  diskGb: 40,
  startupTimeoutMinutes: 12,
  templateHashId: OFFICIAL_COMFY_TEMPLATE,
};

const EMPTY_STATE: VastAutoscaleState = {
  instanceId: null,
  offerId: null,
  status: "idle",
  gpuName: null,
  hourlyRate: null,
  workerUrl: null,
  startedAt: null,
  idleSince: null,
  lastError: null,
};

let provisioning: Promise<ComfyWorker> | null = null;
let monitorStarted = false;

async function readJsonSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  if (!row?.value) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value) };
  } catch {
    return fallback;
  }
}

async function writeJsonSetting(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  await db.insert(settingsTable).values({ key, value: serialized }).onConflictDoUpdate({
    target: settingsTable.key,
    set: { value: serialized, updatedAt: new Date() },
  });
}

export async function getVastAutoscaleConfig(): Promise<VastAutoscaleConfig> {
  return readJsonSetting(CONFIG_KEY, DEFAULT_CONFIG);
}

async function getState(): Promise<VastAutoscaleState> {
  return readJsonSetting(STATE_KEY, EMPTY_STATE);
}

async function setState(update: Partial<VastAutoscaleState>): Promise<VastAutoscaleState> {
  const next = { ...(await getState()), ...update };
  await writeJsonSetting(STATE_KEY, next);
  return next;
}

export async function updateVastAutoscaleConfig(input: Partial<VastAutoscaleConfig>): Promise<VastAutoscaleConfig> {
  const current = await getVastAutoscaleConfig();
  const next: VastAutoscaleConfig = {
    enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    maxHourlyRate: boundedNumber(input.maxHourlyRate, current.maxHourlyRate, 0.05, 5),
    minGpuRamGb: boundedNumber(input.minGpuRamGb, current.minGpuRamGb, 8, 96),
    minReliability: boundedNumber(input.minReliability, current.minReliability, 0.8, 0.9999),
    idleMinutes: boundedNumber(input.idleMinutes, current.idleMinutes, 2, 60),
    diskGb: boundedNumber(input.diskGb, current.diskGb, 20, 200),
    startupTimeoutMinutes: boundedNumber(input.startupTimeoutMinutes, current.startupTimeoutMinutes, 2, 20),
    templateHashId: typeof input.templateHashId === "string" && /^[a-f0-9]{32}$/i.test(input.templateHashId)
      ? input.templateHashId
      : current.templateHashId,
  };
  await writeJsonSetting(CONFIG_KEY, next);
  return next;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function getApiKey(): string {
  const apiKey = process.env.VAST_API_KEY?.trim();
  if (!apiKey) throw new Error("Vast.ai is not configured.");
  return apiKey;
}

async function vastFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${VAST_API_BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${getApiKey()}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || body.success === false) {
    const message = typeof body.msg === "string" ? body.msg : `Vast.ai returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function searchCheapestOffer(config: VastAutoscaleConfig): Promise<SelectedVastOffer> {
  const body = await vastFetch("/bundles/", {
    method: "POST",
    body: JSON.stringify({
      limit: 20,
      type: "ondemand",
      verified: { eq: true },
      rentable: { eq: true },
      rented: { eq: false },
      num_gpus: { eq: 1 },
      gpu_ram: { gte: Math.round(config.minGpuRamGb * 1024) },
      reliability2: { gte: config.minReliability },
      direct_port_count: { gte: 1 },
      dph_total: { lte: config.maxHourlyRate },
      allocated_storage: config.diskGb,
      order: [["dph_total", "asc"]],
    }),
  }) as { offers?: VastOffer[] };
  const offers = Array.isArray(body.offers) ? body.offers : [];
  const valid = offers
    .map((offer) => ({
      id: Number(offer.id),
      gpu_name: String(offer.gpu_name ?? "Vast GPU"),
      dph_total: Number(offer.dph_total),
    }))
    .filter((offer) => Number.isFinite(offer.id) && Number.isFinite(offer.dph_total) && offer.dph_total <= config.maxHourlyRate)
    .sort((a, b) => a.dph_total - b.dph_total);
  if (!valid.length) throw new Error(`No compatible Vast.ai GPU was available below $${config.maxHourlyRate.toFixed(2)}/hour.`);
  return valid[0]!;
}

async function createInstance(offer: SelectedVastOffer, config: VastAutoscaleConfig): Promise<number> {
  const body = await vastFetch(`/asks/${offer.id}/`, {
    method: "PUT",
    body: JSON.stringify({
      template_hash_id: config.templateHashId,
      disk: config.diskGb,
      label: `aurora-autoscale-${Date.now()}`,
      target_state: "running",
      cancel_unavail: true,
    }),
  }) as { new_contract?: unknown };
  const instanceId = Number(body.new_contract);
  if (!Number.isFinite(instanceId)) throw new Error("Vast.ai did not return an instance ID.");
  return instanceId;
}

async function getInstance(instanceId: number): Promise<VastInstance> {
  const body = await vastFetch(`/instances/${instanceId}/`, { method: "GET" }) as { instances?: VastInstance | VastInstance[] };
  if (Array.isArray(body.instances)) return body.instances[0] ?? {};
  return body.instances ?? {};
}

function workerUrlFromInstance(instance: VastInstance): string | null {
  const host = typeof instance.public_ipaddr === "string"
    ? instance.public_ipaddr
    : typeof instance.ssh_host === "string"
      ? instance.ssh_host
      : null;
  if (!host) return null;
  let ports = instance.ports;
  if (typeof ports === "string") {
    try { ports = JSON.parse(ports); } catch { ports = null; }
  }
  if (ports && typeof ports === "object") {
    const entries = Object.entries(ports as Record<string, unknown>);
    const match = entries.find(([key]) => key === "8188/tcp" || key.startsWith("8188/"));
    const mappings = match?.[1];
    if (Array.isArray(mappings)) {
      const first = mappings[0] as Record<string, unknown> | undefined;
      const port = Number(first?.HostPort ?? first?.host_port);
      if (Number.isFinite(port)) return `http://${host}:${port}`;
    }
  }
  const directPort = Number(instance.direct_port_start);
  return Number.isFinite(directPort) ? `http://${host}:${directPort}` : null;
}

async function waitForWorker(instanceId: number, config: VastAutoscaleConfig): Promise<ComfyWorker> {
  const deadline = Date.now() + config.startupTimeoutMinutes * 60_000;
  while (Date.now() < deadline) {
    const instance = await getInstance(instanceId);
    const status = String(instance.actual_status ?? "unknown");
    if (["exited", "offline", "unknown"].includes(status)) {
      throw new Error(`Vast.ai instance entered terminal state: ${status}`);
    }
    const workerUrl = workerUrlFromInstance(instance);
    if (status === "running" && workerUrl) {
      try {
        const health = await fetchComfy(workerUrl, "/system_stats", { signal: AbortSignal.timeout(8_000) });
        if (health.ok) {
          await setState({
            status: "running",
            workerUrl,
            gpuName: String(instance.gpu_name ?? (await getState()).gpuName ?? "Vast GPU"),
            idleSince: null,
            lastError: null,
          });
          return { id: -instanceId, label: `Vast Autoscale · ${String(instance.gpu_name ?? "GPU")}`, url: workerUrl };
        }
      } catch {
        // The instance can be running before ComfyUI finishes loading.
      }
    }
    await sleep(5_000);
  }
  throw new Error(`Vast.ai instance did not become ready within ${config.startupTimeoutMinutes} minutes.`);
}

export async function getOrCreateVastWorker(): Promise<ComfyWorker | null> {
  const config = await getVastAutoscaleConfig();
  if (!config.enabled) return null;
  if (provisioning) return provisioning;
  provisioning = (async () => {
    const existing = await getState();
    if (existing.instanceId) {
      try {
        return await waitForWorker(existing.instanceId, config);
      } catch (error) {
        logger.warn({ instanceId: existing.instanceId, err: error }, "Existing Vast autoscale instance is unavailable");
        await destroyVastInstance(existing.instanceId).catch(() => undefined);
        await setState({ ...EMPTY_STATE, lastError: error instanceof Error ? error.message : String(error) });
      }
    }
    await setState({ ...EMPTY_STATE, status: "searching" });
    const offer = await searchCheapestOffer(config);
    await setState({ status: "provisioning", offerId: offer.id, gpuName: offer.gpu_name, hourlyRate: offer.dph_total, lastError: null });
    const instanceId = await createInstance(offer, config);
    await setState({ instanceId, startedAt: new Date().toISOString() });
    try {
      return await waitForWorker(instanceId, config);
    } catch (error) {
      await destroyVastInstance(instanceId).catch(() => undefined);
      await setState({ ...EMPTY_STATE, status: "error", lastError: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  })().finally(() => {
    provisioning = null;
  });
  return provisioning;
}

async function destroyVastInstance(instanceId: number): Promise<void> {
  await vastFetch(`/instances/${instanceId}/`, { method: "DELETE" });
}

export async function stopVastAutoscaler(): Promise<void> {
  const state = await getState();
  if (!state.instanceId) {
    await setState(EMPTY_STATE);
    return;
  }
  await setState({ status: "stopping" });
  await destroyVastInstance(state.instanceId);
  await setState(EMPTY_STATE);
}

export async function getVastAutoscalerStatus(): Promise<Record<string, unknown>> {
  const [config, state] = await Promise.all([getVastAutoscaleConfig(), getState()]);
  return {
    configured: Boolean(process.env.VAST_API_KEY?.trim()),
    config,
    state,
    estimatedIdleCost: state.hourlyRate == null ? null : state.hourlyRate * (config.idleMinutes / 60),
  };
}

async function monitorIdleInstance(): Promise<void> {
  const config = await getVastAutoscaleConfig();
  const state = await getState();
  // Existing instances must still be reaped after autoscaling is disabled.
  if (state.status !== "running" || !state.instanceId || !state.workerUrl) return;

  const [activeJobs, queueResponse] = await Promise.all([
    db.select({ id: jobsTable.id }).from(jobsTable).where(and(
      eq(jobsTable.workerId, -state.instanceId),
      inArray(jobsTable.status, ["pending", "running"]),
    )).limit(1),
    fetchComfy(state.workerUrl, "/queue", { signal: AbortSignal.timeout(8_000) }).catch(() => null),
  ]);
  if (!queueResponse?.ok || activeJobs.length) {
    if (state.idleSince) await setState({ idleSince: null });
    return;
  }
  const queue = await queueResponse.json() as { queue_running?: unknown[]; queue_pending?: unknown[] };
  const busy = (queue.queue_running?.length ?? 0) + (queue.queue_pending?.length ?? 0) > 0;
  if (busy) {
    if (state.idleSince) await setState({ idleSince: null });
    return;
  }
  const idleSince = state.idleSince ? new Date(state.idleSince).getTime() : Date.now();
  if (!state.idleSince) {
    await setState({ idleSince: new Date(idleSince).toISOString() });
    return;
  }
  if (Date.now() - idleSince >= config.idleMinutes * 60_000) {
    logger.info({ instanceId: state.instanceId, idleMinutes: config.idleMinutes }, "Stopping idle Vast autoscale instance");
    await stopVastAutoscaler();
  }
}

export function startVastAutoscalerMonitor(): void {
  if (monitorStarted) return;
  monitorStarted = true;
  const timer = setInterval(() => {
    monitorIdleInstance().catch((error) => logger.warn({ err: error }, "Vast autoscaler monitor failed"));
  }, 60_000);
  timer.unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}