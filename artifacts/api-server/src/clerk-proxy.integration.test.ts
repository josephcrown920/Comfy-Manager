import express from "express";
import { once } from "node:events";
import { createServer, request, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  target: "",
  clerk: vi.fn(),
  upstream: vi.fn(),
}));

// Use the real proxy implementation; redirect only its destination to a local
// fixture. Never contact Clerk or read a workspace credential in these tests.
vi.mock("http-proxy-middleware", async (importOriginal) => {
  const actual = await importOriginal<typeof import("http-proxy-middleware")>();
  return {
    ...actual,
    createProxyMiddleware: (options: Parameters<typeof actual.createProxyMiddleware>[0]) =>
      actual.createProxyMiddleware({ ...options, target: mocks.target }),
  };
});
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => mocks.clerk,
}));
vi.mock("./routes", () => ({ default: express.Router() }));
vi.mock("./lib/logger", async () => {
  const { default: pino } = await import("pino");
  return { logger: pino({ level: "silent" }) };
});

const servers: Server[] = [];
async function listen(server: Server) {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function start(environment = "production", withKey = true) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", environment);
  vi.stubEnv("CLERK_SECRET_KEY", withKey ? "sk_live_local_fixture_not_a_credential" : "");
  mocks.upstream.mockReset();
  mocks.clerk.mockReset().mockImplementation((_req, _res, next) => next());
  mocks.target = await listen(createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    mocks.upstream(req, Buffer.concat(chunks).toString());
    // Deliberately length-unknown/chunked, like Clerk's Frontend API.
    res.writeHead(200, {
      "content-type": "application/json",
      "set-cookie": ["fixture_session=local; HttpOnly; Secure"],
    });
    res.write('{"proxied":');
    res.end("true}");
  }));
  const { default: app } = await import("./app");
  return listen(createServer(app));
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
      server.closeAllConnections();
    }),
  ));
  vi.unstubAllEnvs();
});

describe("Clerk production proxy through app.ts", () => {
  it("proxies the mounted route before auth/body parsing, preserving raw JSON and query", async () => {
    const url = await start();
    // Invalid JSON must reach the upstream untouched, not express.json's 400.
    const response = await fetch(`${url}/api/__clerk/v1/client?fixture=1`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-host": "studio.example.test, internal.example.test",
        "x-forwarded-proto": "https",
        "x-forwarded-for": "192.0.2.10, 192.0.2.20",
      },
      body: '{"raw":',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ proxied: true });
    expect(response.headers.get("content-length")).toBe(String(Buffer.byteLength('{"proxied":true}')));
    expect(response.headers.get("transfer-encoding")).toBeNull();
    expect(response.headers.get("set-cookie")).toContain("fixture_session=local");
    expect(mocks.clerk).not.toHaveBeenCalled();
    expect(mocks.upstream).toHaveBeenCalledOnce();
    const [req, body] = mocks.upstream.mock.calls[0] as [IncomingMessage, string];
    expect(req.url).toBe("/v1/client?fixture=1");
    expect(body).toBe('{"raw":');
    expect(req.headers["clerk-proxy-url"]).toBe("https://studio.example.test/api/__clerk");
    expect(req.headers["clerk-secret-key"]).toBe("sk_live_local_fixture_not_a_credential");
    expect(req.headers["x-forwarded-for"]).toBe("192.0.2.10");
  });

  it("uses Host when no forwarded hostname is supplied", async () => {
    const url = await start();
    // node:http permits an explicit Host; fetch replaces it with the URL host.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${url}/api/__clerk/v1/environment`, {
        headers: { host: "custom.example.test" },
      }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(200);
    const [req] = mocks.upstream.mock.calls[0] as [IncomingMessage];
    expect(req.headers["clerk-proxy-url"]).toBe("https://custom.example.test/api/__clerk");
  });

  it.each([
    ["development", true],
    ["production", false],
  ])("does not proxy in %s with key present=%s", async (environment, withKey) => {
    const url = await start(environment, withKey);
    const response = await fetch(`${url}/api/__clerk/v1/environment`);
    expect(response.status).toBe(404);
    expect(mocks.upstream).not.toHaveBeenCalled();
    expect(mocks.clerk).toHaveBeenCalledOnce();
  });

  it("does not intercept ordinary API routes in production", async () => {
    const url = await start();
    const response = await fetch(`${url}/api/assistant/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(404); // Deliberately inert API router in this suite.
    expect(mocks.upstream).not.toHaveBeenCalled();
    expect(mocks.clerk).toHaveBeenCalledOnce();
  });
});
