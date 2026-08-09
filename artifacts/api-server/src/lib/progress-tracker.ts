import { WebSocket } from "ws";
import { db, jobsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { getComfyUrl } from "../routes/settings";

/**
 * Server-side progress tracker.
 *
 * Maintains its own WebSocket connection to ComfyUI (independent of any
 * browser client) and writes incremental progress to the jobs table so that
 * the UI can show an accurate starting point after a page reload, before the
 * browser's own WS reconnects.
 */

const RECONNECT_DELAY_MS = 5000;
// Only write to DB when progress advanced by at least this many percent
const WRITE_THRESHOLD_PCT = 5;

// Last percent written to the DB per comfy prompt id (throttling state)
const lastWrittenPct = new Map<string, number>();

let stopped = false;
let currentWs: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

async function writeProgress(promptId: string, pct: number): Promise<void> {
  try {
    await db
      .update(jobsTable)
      .set({ progress: pct })
      .where(
        and(
          eq(jobsTable.comfyPromptId, promptId),
          eq(jobsTable.status, "running"),
        ),
      );
  } catch (err) {
    logger.warn({ err, promptId }, "Failed to persist job progress");
  }
}

function handleMessage(raw: string): void {
  let msg: { type?: string; data?: Record<string, unknown> };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    return; // binary or non-JSON frames (e.g. preview images)
  }

  if (msg.type === "progress" && msg.data) {
    const promptId = msg.data["prompt_id"] as string | undefined;
    const value = msg.data["value"] as number | undefined;
    const max = msg.data["max"] as number | undefined;
    if (!promptId || value == null || max == null || max <= 0) return;

    const pct = Math.min(99, Math.round((value / max) * 100));
    const last = lastWrittenPct.get(promptId) ?? -Infinity;
    if (pct - last >= WRITE_THRESHOLD_PCT || value === max) {
      lastWrittenPct.set(promptId, pct);
      void writeProgress(promptId, pct);
    }
  } else if (
    msg.type === "executing" &&
    msg.data &&
    msg.data["node"] == null
  ) {
    // Execution finished for this prompt — drop throttling state.
    // Final status/outputs are reconciled via the /jobs/:id/refresh endpoint.
    const promptId = msg.data["prompt_id"] as string | undefined;
    if (promptId) lastWrittenPct.delete(promptId);
  }
}

function scheduleReconnect(): void {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, RECONNECT_DELAY_MS);
}

async function connect(): Promise<void> {
  if (stopped) return;
  try {
    const comfyUrl = await getComfyUrl();
    const wsUrl = comfyUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";
    const ws = new WebSocket(wsUrl);
    currentWs = ws;

    ws.on("open", () => {
      logger.info("Progress tracker connected to ComfyUI WS");
    });
    ws.on("message", (data) => handleMessage(data.toString()));
    ws.on("close", () => {
      if (currentWs === ws) currentWs = null;
      scheduleReconnect();
    });
    ws.on("error", () => {
      // 'close' fires after 'error'; reconnect handled there
      ws.close();
    });
  } catch (err) {
    logger.warn({ err }, "Progress tracker could not connect to ComfyUI");
    scheduleReconnect();
  }
}

export function startProgressTracker(): void {
  stopped = false;
  void connect();
}

export function stopProgressTracker(): void {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  currentWs?.close();
  currentWs = null;
}
