import { Router, type IRouter, type Response } from "express";

const router: IRouter = Router();

function getConfig() {
  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  const endpointId = process.env.RUNPOD_ENDPOINT_ID?.trim();
  const baseUrl = (process.env.RUNPOD_BASE_URL?.trim() || "https://api.runpod.ai/v2").replace(/\/$/, "");
  return { apiKey, endpointId, baseUrl };
}

function requireConfig(res: Response) {
  const { apiKey, endpointId, baseUrl } = getConfig();
  if (!apiKey || !endpointId) {
    res.status(503).json({ configured: false, error: "RunPod Serverless is not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID." });
    return null;
  }
  return { apiKey, endpointId, baseUrl };
}

async function runpodFetch(path: string, init: RequestInit = {}) {
  const config = getConfig();
  if (!config.apiKey || !config.endpointId) throw new Error("RunPod is not configured");
  return fetch(`${config.baseUrl}/${config.endpointId}${path}`, {
    ...init,
    headers: { accept: "application/json", authorization: config.apiKey, "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

router.get("/gpu/runpod/config", (_req, res): void => {
  const { apiKey, endpointId, baseUrl } = getConfig();
  res.json({ configured: Boolean(apiKey && endpointId), endpointId: endpointId ? `${endpointId.slice(0, 4)}…${endpointId.slice(-4)}` : null, baseUrl, scaleToZeroReady: Boolean(apiKey && endpointId) });
});

router.get("/gpu/runpod/health", async (_req, res): Promise<void> => {
  const config = requireConfig(res);
  if (!config) return;
  try {
    const response = await runpodFetch("/health", { method: "GET" });
    res.status(response.status).json(await response.json().catch(() => ({})));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "RunPod health request failed" });
  }
});

router.post("/gpu/runpod/jobs", async (req, res): Promise<void> => {
  const config = requireConfig(res);
  if (!config) return;
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "Request body must be an object containing an input object." });
    return;
  }
  const input = req.body.input ?? req.body;
  try {
    const response = await runpodFetch("/run", { method: "POST", body: JSON.stringify({ input }) });
    res.status(response.status).json(await response.json().catch(() => ({})));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "RunPod submission failed" });
  }
});

router.get("/gpu/runpod/jobs/:jobId", async (req, res): Promise<void> => {
  const config = requireConfig(res);
  if (!config) return;
  try {
    const response = await runpodFetch(`/status/${encodeURIComponent(req.params.jobId)}`, { method: "GET" });
    res.status(response.status).json(await response.json().catch(() => ({})));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "RunPod status request failed" });
  }
});

router.post("/gpu/runpod/jobs/:jobId/cancel", async (req, res): Promise<void> => {
  const config = requireConfig(res);
  if (!config) return;
  try {
    const response = await runpodFetch(`/cancel/${encodeURIComponent(req.params.jobId)}`, { method: "POST", body: "{}" });
    res.status(response.status).json(await response.json().catch(() => ({})));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "RunPod cancellation failed" });
  }
});

export default router;
