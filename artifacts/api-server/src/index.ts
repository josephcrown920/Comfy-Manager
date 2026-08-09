import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { getComfyUrl } from "./routes/settings";
import { parseComfyTarget } from "./routes/comfy";

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

server.on("upgrade", async (req, socket, head) => {
  // Only proxy /ws requests
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }

  try {
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
        upstream.on("message", (data) => {
          if (client.readyState === WebSocket.OPEN) {
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
});
