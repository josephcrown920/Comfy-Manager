import { Router, type IRouter } from "express";
import {
  GetComfyStatusResponse,
  GetComfyModelsResponse,
  GetComfyQueueResponse,
} from "@workspace/api-zod";
import { getComfyUrl } from "./settings";

const router: IRouter = Router();

async function fetchComfy(
  comfyUrl: string,
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `${comfyUrl.replace(/\/$/, "")}${path}`;
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(8000),
  });
}

router.get("/comfy/status", async (req, res): Promise<void> => {
  const comfyUrl = await getComfyUrl();
  try {
    const r = await fetchComfy(comfyUrl, "/system_stats");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as Record<string, unknown>;
    const system = data.system as Record<string, unknown> | undefined;
    const devices = data.devices as Array<Record<string, unknown>> | undefined;
    const gpu = devices?.[0];

    res.json(
      GetComfyStatusResponse.parse({
        connected: true,
        serverUrl: comfyUrl,
        gpuName: (gpu?.name as string) ?? null,
        gpuVram:
          gpu?.vram_total != null
            ? `${Math.round((gpu.vram_total as number) / 1024 / 1024 / 1024)} GB`
            : null,
        ramUsed:
          system?.ram_used != null
            ? `${Math.round((system.ram_used as number) / 1024 / 1024 / 1024)} GB`
            : null,
        ramTotal:
          system?.ram_total != null
            ? `${Math.round((system.ram_total as number) / 1024 / 1024 / 1024)} GB`
            : null,
        queueRemaining: null,
        error: null,
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json(
      GetComfyStatusResponse.parse({
        connected: false,
        serverUrl: comfyUrl,
        gpuName: null,
        gpuVram: null,
        ramUsed: null,
        ramTotal: null,
        queueRemaining: null,
        error: `Cannot reach ComfyUI server: ${msg}`,
      })
    );
  }
});

router.get("/comfy/models", async (req, res): Promise<void> => {
  const comfyUrl = await getComfyUrl();
  try {
    const [cpR, loraR, vaeR, cnR] = await Promise.allSettled([
      fetchComfy(comfyUrl, "/api/models/checkpoints"),
      fetchComfy(comfyUrl, "/api/models/loras"),
      fetchComfy(comfyUrl, "/api/models/vae"),
      fetchComfy(comfyUrl, "/api/models/controlnet"),
    ]);

    const parseList = async (r: PromiseSettledResult<Response>): Promise<string[]> => {
      if (r.status === "rejected") return [];
      if (!r.value.ok) return [];
      const body = await r.value.json().catch(() => []);
      return Array.isArray(body) ? (body as string[]) : [];
    };

    res.json(
      GetComfyModelsResponse.parse({
        checkpoints: await parseList(cpR),
        loras: await parseList(loraR),
        vaes: await parseList(vaeR),
        controlnets: await parseList(cnR),
      })
    );
  } catch {
    res.json(
      GetComfyModelsResponse.parse({
        checkpoints: [],
        loras: [],
        vaes: [],
        controlnets: [],
      })
    );
  }
});

router.get("/comfy/queue", async (req, res): Promise<void> => {
  const comfyUrl = await getComfyUrl();
  try {
    const r = await fetchComfy(comfyUrl, "/queue");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as {
      queue_running?: unknown[];
      queue_pending?: unknown[];
    };
    res.json(
      GetComfyQueueResponse.parse({
        queueRunning: data.queue_running?.length ?? 0,
        queuePending: data.queue_pending?.length ?? 0,
        runningItems: (data.queue_running as object[]) ?? [],
      })
    );
  } catch {
    res.json(
      GetComfyQueueResponse.parse({
        queueRunning: 0,
        queuePending: 0,
        runningItems: [],
      })
    );
  }
});

export { fetchComfy };
export default router;
