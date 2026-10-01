import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { authenticateRequest, clerkClient } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import type { Request as ExpressRequest } from "express";
import app from "./app";
import { logger } from "./lib/logger";
import { getComfyUrl } from "./routes/settings";
import { parseComfyTarget } from "./routes/comfy";
import { startProgressTracker } from "./lib/progress-tracker";
import { startVastAutoscalerMonitor } from "./lib/vast-autoscaler";
import { db, jobsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// WebSocket server to handle upgrade events
const wss = new WebSocketServer({ noServer: true });

async function getSocketUserId(req: http.IncomingMessage): Promise<string | null> {
  try {
    const host = String(req.headers.host ?? "").replace(/:\d+$/, "");
    const requestState = await authenticateRequest({
      clerkClient,
      request: req as unknown as ExpressRequest,
      options: {
        publishableKey: publishableKeyFromHost(host, process.env.CLERK_PUBLISHABLE_KEY),
      },
    });
    return requestState.isAuthenticated ? requestState.toAuth().userId : null;
  } catch {
    return null;
  }
}

async function userOwnsPrompt(userId: string, promptId: string): Promise<boolean> {
  const [job] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(and(eq(jobsTable.ownerId, userId), eq(jobsTable.comfyPromptId, promptId)))
    .limit(1);
  return Boolean(job);
}

server.on("upgrade", async (req, socket, head) => {
  // Only proxy /ws requests
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }

  try {
    const userId = await getSocketUserId(req);
    if (!userId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    const comfyUrl = await getComfyUrl();
    // Strip embedded basic-auth credentials into a header (password-protected tunnels)
    const { baseUrl, headers } = parseComfyTarget(comfyUrl);
    // Convert http(s) → ws(s)
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws";

    const upstream = new WebSocket(wsUrl, { headers });

    upstream.on("open", () => {
      wss.handleUpgrade(req, socket, head, (client) => {
        // Browser → ComfyUI
        client.on("message", (data) => {
          if (upstream.readyState === WebSocket.OPEN) {
            upstream.send(data);
          }
        });
        client.on("close", () => upstream.close());
        client.on("error", () => upstream.close());

        // ComfyUI → Browser
        upstream.on("message", async (data) => {
          if (client.readyState === WebSocket.OPEN) {
            try {
              const message = JSON.parse(data.toString()) as {
                data?: { prompt_id?: unknown };
              };
              const promptId = message.data?.prompt_id;
              if (typeof promptId !== "string" || !(await userOwnsPrompt(userId, promptId))) {
                return;
              }
            } catch {
              return;
            }
            client.send(data);
          }
        });
        upstream.on("close", () => client.close());
        upstream.on("error", (err) => {
          logger.warn({ err }, "ComfyUI WS upstream error");
          client.close();
        });
      });
    });

    upstream.on("error", (err) => {
      logger.warn({ err }, "Could not connect to ComfyUI WebSocket");
      socket.destroy();
    });
  } catch (err) {
    logger.warn({ err }, "WS proxy setup failed");
    socket.destroy();
  }
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Persist incremental job progress to the DB so the UI survives reloads
  startProgressTracker();
  startVastAutoscalerMonitor();
});
