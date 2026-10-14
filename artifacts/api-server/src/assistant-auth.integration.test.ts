import express, { type NextFunction, type Request, type Response } from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: new WeakMap<object, { userId: string | null }>(),
  completion: vi.fn(),
  reserve: vi.fn(),
}));

// Simulate only the SDK identity boundary, not requireAuth. Missing middleware
// throws just as getAuth does, so app middleware ordering remains under test.
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (req: Request, _res: Response, next: NextFunction) => {
    const identities: Record<string, string> = {
      "Bearer fixture-a": "user-a",
      "Bearer fixture-b": "user-b",
    };
    mocks.auth.set(req, { userId: identities[req.headers.authorization ?? ""] ?? null });
    next();
  },
  getAuth: (req: Request) => {
    if (!mocks.auth.has(req)) throw new Error("Clerk middleware did not run");
    return mocks.auth.get(req);
  },
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: mocks.completion } } },
}));
vi.mock("./lib/resource-quotas", () => ({
  MAX_ASSISTANT_REQUESTS_PER_DAY: 50,
  reserveAssistantRequest: mocks.reserve,
}));
vi.mock("./lib/modelark", () => ({
  MODELARK_MODELS: [],
  createModelArkTextCompletion: vi.fn(),
}));
vi.mock("./lib/logger", async () => {
  const { default: pino } = await import("pino");
  return { logger: pino({ level: "silent" }) };
});
vi.mock("@workspace/db", () => ({ db: {}, jobsTable: {} }));
vi.mock("./lib/access-control", () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuthenticatedUserId: (res: Response) => res.locals.userId,
}));

// Keep app.ts, the real root router, assistant router, schemas, and both auth
// guards. Unrelated domains are inert to avoid initializing DB/GPU/storage
// services; changing assistant mounting or middleware in the root still fails.
vi.mock("./routes/health", () => ({ default: express.Router() }));
vi.mock("./routes/free-gpu", () => ({ default: express.Router() }));
vi.mock("./routes/settings", () => ({ default: express.Router(), getComfyUrl: vi.fn() }));
vi.mock("./routes/comfy", () => ({ default: express.Router(), fetchComfy: vi.fn() }));
vi.mock("./routes/workflows", () => ({ default: express.Router() }));
vi.mock("./routes/jobs", () => ({ default: express.Router() }));
vi.mock("./routes/outputs", () => ({ default: express.Router() }));
vi.mock("./routes/files", () => ({ default: express.Router() }));
vi.mock("./routes/model-assignments", () => ({ default: express.Router() }));
vi.mock("./routes/saved-workflows", () => ({ default: express.Router() }));
vi.mock("./routes/batches", () => ({ default: express.Router() }));
vi.mock("./routes/modelark", () => ({ default: express.Router() }));
vi.mock("./routes/video-agent", () => ({ default: express.Router() }));
vi.mock("./routes/grwm", () => ({ default: express.Router() }));
vi.mock("./routes/runpod", () => ({ default: express.Router() }));
vi.mock("./routes/vast", () => ({ default: express.Router() }));
vi.mock("./routes/admin-content", () => ({ default: express.Router() }));
vi.mock("./routes/workflow-apps", () => ({ default: express.Router() }));
vi.mock("./routes/motion", () => ({ default: express.Router() }));
vi.mock("./routes/environments", () => ({ default: express.Router() }));

let server: Server;
let baseUrl: string;
const chat = { messages: [{ role: "user", content: "Help me make a video" }] };
const video = { idea: "A sunrise over a mountain" };

beforeEach(async () => {
  vi.resetModules(); // Fresh rate buckets and in-flight counters for every test.
  vi.stubEnv("NODE_ENV", "test");
  mocks.completion.mockReset().mockResolvedValue({
    choices: [{ message: { content: "Assistant reply" } }],
  });
  mocks.reserve.mockReset().mockResolvedValue(true);
  const { default: app } = await import("./app");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
    server.closeAllConnections();
  });
  vi.unstubAllEnvs();
});

function post(endpoint: string, body: unknown, token?: string, headers = {}) {
  return fetch(`${baseUrl}/api/assistant/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function mockVideoPlan() {
  // Real template and real handler validation, without an AI/network call.
  const workflow = JSON.parse(await readFile(
    new URL("../../comfyui-studio/src/assets/templates/sdxl-image.workflow.json", import.meta.url),
    "utf8",
  ));
  mocks.completion.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      templateId: "sdxl-image", workflow, notes: "Use this template",
    }) } }],
  });
  return workflow;
}

describe("assistant sign-in boundary through the mounted app", () => {
  it.each([
    ["chat", chat],
    ["video-plan", video],
    ["chat", {}],
    ["video-plan", {}],
  ])("rejects anonymous %s before validation, quota or AI work", async (endpoint, body) => {
    const response = await post(endpoint, body);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in to continue." });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.completion).not.toHaveBeenCalled();
  });

  it.each([["chat", chat], ["video-plan", video]])(
    "does not accept forged identity headers or body fields for %s",
    async (endpoint, body) => {
      const response = await post(endpoint, { ...body, userId: "user-a" }, "invalid", {
        "x-user-id": "user-a", "x-forwarded-for": "192.0.2.1",
      });
      expect(response.status).toBe(401);
      expect(mocks.reserve).not.toHaveBeenCalled();
      expect(mocks.completion).not.toHaveBeenCalled();
    },
  );

  it("lets authenticated chat reach the real handler", async () => {
    const response = await post("chat", chat, "fixture-a");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: "Assistant reply" });
    expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith("user-a");
    expect(mocks.completion).toHaveBeenCalledOnce();
    expect(mocks.completion.mock.calls[0][0].messages.at(-1)).toEqual(chat.messages[0]);
  });

  it("lets authenticated video planning reach and validate the real handler", async () => {
    const workflow = await mockVideoPlan();
    const response = await post("video-plan", video, "fixture-b");
    expect(response.status).toBe(200);
    const result = await response.json() as {
      templateId: string; workflowJson: string; notes: string;
    };
    expect(result.templateId).toBe("sdxl-image");
    expect(JSON.parse(result.workflowJson)).toEqual(workflow);
    expect(result.notes).toBe("Use this template");
    expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith("user-b");
    expect(mocks.completion).toHaveBeenCalledOnce();
    expect(mocks.completion.mock.calls[0][0].messages.at(-1)).toEqual({
      role: "user", content: video.idea,
    });
  });

  it.each(["chat", "video-plan"])(
    "keeps the five-request %s bucket isolated by authenticated user, not IP or supplied userId",
    async (endpoint) => {
      if (endpoint === "video-plan") await mockVideoPlan();
      const body = endpoint === "chat" ? chat : video;
      for (let i = 0; i < 5; i++) {
        expect((await post(endpoint, body, "fixture-a")).status).toBe(200);
      }
      const blocked = await post(endpoint, { ...body, userId: "user-b" }, "fixture-a", {
        "x-forwarded-for": "192.0.2.99",
      });
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({
        error: "Too many AI requests — please wait a minute and try again.",
      });
      // Same server/socket source IP, distinct authenticated identity.
      expect((await post(endpoint, body, "fixture-b")).status).toBe(200);
      expect(mocks.reserve.mock.calls.map(([id]) => id)).toEqual([
        "user-a", "user-a", "user-a", "user-a", "user-a", "user-b",
      ]);
      expect(mocks.completion).toHaveBeenCalledTimes(6);
    },
  );

  it("shares a user's limit across chat and video planning", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post("chat", chat, "fixture-a")).status).toBe(200);
    }
    expect((await post("video-plan", video, "fixture-a")).status).toBe(429);
    expect(mocks.reserve).toHaveBeenCalledTimes(5);
    expect(mocks.completion).toHaveBeenCalledTimes(5);
  });

  it("does not charge anonymous attempts to an authenticated user's bucket", async () => {
    for (let i = 0; i < 6; i++) {
      expect((await post("chat", chat)).status).toBe(401);
    }
    expect((await post("chat", chat, "fixture-a")).status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith("user-a");
  });

  it("reopens the user's bucket after the one-minute window", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      for (let i = 0; i < 5; i++) {
        expect((await post("chat", chat, "fixture-a")).status).toBe(200);
      }
      expect((await post("chat", chat, "fixture-a")).status).toBe(429);
      now.mockReturnValue(1_060_000);
      expect((await post("chat", chat, "fixture-a")).status).toBe(200);
    } finally {
      now.mockRestore();
    }
  });
});
