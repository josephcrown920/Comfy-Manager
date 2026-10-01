import { and, eq } from "drizzle-orm";
import { db, jobsTable } from "@workspace/db";
import { fetchComfy } from "../routes/comfy";
import { getComfyUrl, getConfiguredWorkers, getRoutingSettings, type ComfyWorker } from "../routes/settings";
import { getOrCreateVastWorker } from "./vast-autoscaler";

export type WorkerProbe = {
  worker: ComfyWorker;
  reachable: boolean;
  queueRunning: number;
  queuePending: number;
  missingNodes: string[];
  gpuName: string | null;
  error: string | null;
};

export type SelectedWorker = WorkerProbe;

function requiredNodeTypes(prompt: Record<string, unknown>): string[] {
  return [...new Set(
    Object.values(prompt)
      .filter((node): node is Record<string, unknown> => Boolean(node) && typeof node === "object" && !Array.isArray(node))
      .map((node) => node.class_type)
      .filter((classType): classType is string => typeof classType === "string" && classType.length > 0),
  )].sort();
}

async function readQueue(worker: ComfyWorker): Promise<{ running: number; pending: number }> {
  const response = await fetchComfy(worker.url, "/queue", { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`queue returned HTTP ${response.status}`);
  const body = await response.json() as { queue_running?: unknown[]; queue_pending?: unknown[] };
  return {
    running: Array.isArray(body.queue_running) ? body.queue_running.length : 0,
    pending: Array.isArray(body.queue_pending) ? body.queue_pending.length : 0,
  };
}

export async function probeWorker(worker: ComfyWorker, requiredNodes: string[] = []): Promise<WorkerProbe> {
  try {
    const [systemResponse, queueResponse, objectInfoResponse] = await Promise.all([
      fetchComfy(worker.url, "/system_stats", { signal: AbortSignal.timeout(8_000) }),
      fetchComfy(worker.url, "/queue", { signal: AbortSignal.timeout(8_000) }),
      requiredNodes.length
        ? fetchComfy(worker.url, "/object_info", { signal: AbortSignal.timeout(12_000) })
        : Promise.resolve(null),
    ]);

    if (!systemResponse.ok) throw new Error(`system stats returned HTTP ${systemResponse.status}`);
    if (!queueResponse.ok) throw new Error(`queue returned HTTP ${queueResponse.status}`);

    const system = await systemResponse.json() as { devices?: Array<{ name?: string }> };
    const queue = await queueResponse.json() as { queue_running?: unknown[]; queue_pending?: unknown[] };
    let missingNodes: string[] = [];

    if (requiredNodes.length) {
      if (!objectInfoResponse?.ok) {
        throw new Error(`capability metadata returned HTTP ${objectInfoResponse?.status ?? "unknown"}`);
      }
      const objectInfo = await objectInfoResponse.json() as Record<string, unknown>;
      missingNodes = requiredNodes.filter((node) => !Object.prototype.hasOwnProperty.call(objectInfo, node));
    }

    return {
      worker,
      reachable: true,
      queueRunning: Array.isArray(queue.queue_running) ? queue.queue_running.length : 0,
      queuePending: Array.isArray(queue.queue_pending) ? queue.queue_pending.length : 0,
      missingNodes,
      gpuName: system.devices?.[0]?.name ?? null,
      error: null,
    };
  } catch (error) {
    return {
      worker,
      reachable: false,
      queueRunning: 0,
      queuePending: 0,
      missingNodes: [],
      gpuName: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function selectWorker(
  prompt: Record<string, unknown>,
  requestedWorkerId?: number | null,
  excludedWorkerIds: ReadonlySet<number> = new Set(),
): Promise<SelectedWorker> {
  const requiredNodes = requiredNodeTypes(prompt);
  const routing = await getRoutingSettings();
  const effectiveWorkerId = requestedWorkerId ?? (
    routing.routingMode === "manual" ? routing.selectedGpuId : null
  );
  let workers = await getConfiguredWorkers();
  const candidates = effectiveWorkerId == null
    ? workers
    : workers.filter((worker) => worker.id === effectiveWorkerId);
  const availableCandidates = candidates.filter((worker) => !excludedWorkerIds.has(worker.id));

  if (!availableCandidates.length && effectiveWorkerId == null) {
    const vastWorker = await getOrCreateVastWorker();
    if (vastWorker) workers = [vastWorker];
  }
  const resolvedCandidates = effectiveWorkerId == null
    ? workers
    : workers.filter((worker) => worker.id === effectiveWorkerId);
  const resolvedAvailableCandidates = resolvedCandidates.filter((worker) => !excludedWorkerIds.has(worker.id));

  if (!resolvedAvailableCandidates.length) {
    throw new WorkerRoutingError("The selected GPU is no longer saved. Choose another GPU in Settings.", 409);
  }

  let probes = await Promise.all(resolvedAvailableCandidates.map((worker) => probeWorker(worker, requiredNodes)));
  const healthy = probes.filter((probe) => probe.reachable && probe.missingNodes.length === 0);

  if (!healthy.length) {
    if (effectiveWorkerId == null && !workers.some((worker) => worker.id < 0)) {
      const vastWorker = await getOrCreateVastWorker();
      if (vastWorker) {
        const vastProbe = await probeWorker(vastWorker, requiredNodes);
        probes = [...probes, vastProbe];
        if (vastProbe.reachable && vastProbe.missingNodes.length === 0) {
          return vastProbe;
        }
      }
    }
    const incompatible = probes.find((probe) => probe.reachable && probe.missingNodes.length > 0);
    if (incompatible) {
      throw new WorkerRoutingError(
        `${incompatible.worker.label} is missing required ComfyUI nodes: ${incompatible.missingNodes.join(", ")}.`,
        409,
      );
    }
    throw new WorkerRoutingError(
      requestedWorkerId == null
        ? "No saved GPU is healthy and reachable right now. Start ComfyUI on at least one worker and retry."
        : "The selected GPU is not healthy or reachable. Choose another GPU in Settings and retry.",
      503,
    );
  }

  healthy.sort((a, b) => {
    const loadA = a.queueRunning + a.queuePending;
    const loadB = b.queueRunning + b.queuePending;
    return loadA - loadB || a.worker.id - b.worker.id;
  });
  return healthy[0]!;
}

export async function getJobWorkerUrl(jobId: number): Promise<string> {
  const [job] = await db
    .select({ workerUrl: jobsTable.workerUrl })
    .from(jobsTable)
    .where(eq(jobsTable.id, jobId))
    .limit(1);
  return job?.workerUrl || await getComfyUrl();
}

export async function getWorkerStatuses() {
  const settings = await getRoutingSettings();
  const workers = await getConfiguredWorkers();
  const probes = await Promise.all(workers.map((worker) => probeWorker(worker)));
  return probes.map((probe) => ({
    id: probe.worker.id,
    label: probe.worker.label,
    connected: probe.reachable,
    queueRemaining: probe.queueRunning + probe.queuePending,
    gpuName: probe.gpuName,
    error: probe.error,
    selected: settings.routingMode === "manual"
      ? settings.selectedGpuId === probe.worker.id
      : settings.routingMode === "auto",
  }));
}

export class WorkerRoutingError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "WorkerRoutingError";
  }
}

// Keep this helper available for callers that need to inspect queue depth without
// coupling themselves to the probe response shape.
export { readQueue };