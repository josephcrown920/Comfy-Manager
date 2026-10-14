import express from "express";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserveUpload: vi.fn(),
  fetchComfy: vi.fn(),
  getComfyUrl: vi.fn(),
  recordInputOwner: vi.fn(),
}));

// Keep the actual router, storage engine and multipart parser. Only external
// services and identity are replaced: these tests never use a DB or rent a GPU.
vi.mock("@workspace/db", () => ({ db: {}, outputsTable: {} }));
vi.mock("@workspace/api-zod", () => ({ ImportOutputBody: {}, ImportOutputResponse: {} }));
vi.mock("./settings", () => ({ getComfyUrl: mocks.getComfyUrl }));
vi.mock("./comfy", () => ({ fetchComfy: mocks.fetchComfy }));
vi.mock("../lib/access-control", () => ({ getAuthenticatedUserId: () => "upload-test-user" }));
vi.mock("../lib/worker-routing", () => ({ getJobWorkerUrl: vi.fn() }));
vi.mock("../lib/perform-media", () => ({ recordInputOwner: mocks.recordInputOwner }));
vi.mock("../lib/resource-quotas", () => ({
  MAX_UPLOAD_BYTES_PER_DAY: 1024 * 1024 * 1024,
  MAX_UPLOAD_REQUESTS_PER_DAY: 100,
  reserveUpload: mocks.reserveUpload,
}));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import router from "./files";

const MB = 1024 * 1024;
// Intentional literal contract values, not imported from implementation.
const media = [
  { type: "image/png", name: "reference.png", limit: 20 * MB, label: "Images", signature: Buffer.from("89504e470d0a1a0a", "hex") },
  { type: "audio/mpeg", name: "voice.mp3", limit: 100 * MB, label: "Audio files", signature: Buffer.from("ID3") },
  { type: "video/mp4", name: "motion.mp4", limit: 100 * MB, label: "Videos", signature: Buffer.from("\0\0\0\x18ftypisom") },
] as const;

let server: Server;
let port: number;

/**
 * Stream fixed-size chunks, including a valid media signature, through real
 * HTTP multipart parsing. No huge fixtures on disk or mocked multer sizes.
 */
async function postFile(
  file: (typeof media)[number],
  size: number,
  withContentLength: boolean,
): Promise<{ status: number; body: { error?: string; name?: string } }> {
  const boundary = "aurora-upload-boundary";
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const req = request({
    hostname: "127.0.0.1",
    port,
    path: "/api/files/upload",
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      ...(withContentLength ? { "content-length": prefix.length + size + suffix.length } : {}),
    },
  });
  const response = new Promise<{ status: number; body: { error?: string; name?: string } }>((resolve, reject) => {
    req.on("error", reject);
    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => resolve({
        status: res.statusCode!,
        body: JSON.parse(Buffer.concat(chunks).toString()),
      }));
    });
  });
  req.write(prefix);
  req.write(file.signature);
  const chunk = Buffer.alloc(256 * 1024);
  let remaining = size - file.signature.length;
  while (remaining > 0) {
    const length = Math.min(remaining, chunk.length);
    if (!req.write(chunk.subarray(0, length))) await once(req, "drain");
    remaining -= length;
  }
  req.end(suffix);
  return response;
}

async function postBufferFile(
  file: { type: string; name: string; buffer: Buffer },
  accept?: string,
): Promise<{ status: number; body: { error?: string; name?: string } }> {
  const boundary = "aurora-buffer-upload-boundary";
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const req = request({
    hostname: "127.0.0.1",
    port,
    path: `/api/files/upload${accept ? `?accept=${encodeURIComponent(accept)}` : ""}`,
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": prefix.length + file.buffer.length + suffix.length,
    },
  });
  const response = new Promise<{ status: number; body: { error?: string; name?: string } }>((resolve, reject) => {
    req.on("error", reject);
    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => resolve({
        status: res.statusCode!,
        body: JSON.parse(Buffer.concat(chunks).toString()),
      }));
    });
  });
  req.write(prefix);
  req.write(file.buffer);
  req.end(suffix);
  return response;
}

function createHeicFixture(): Buffer {
  const result = spawnSync("magick", ["-size", "2x2", "xc:skyblue", "heic:-"], {
    maxBuffer: 2 * MB,
  });
  if (result.status !== 0 || result.stdout.length === 0) {
    throw new Error("The mandatory HEIC upload fixture requires ImageMagick with HEIF support.");
  }
  return result.stdout;
}

const heicFixture = createHeicFixture();

beforeAll(async () => {
  const app = express();
  app.use("/api", router);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reserveUpload.mockResolvedValue(true);
  mocks.recordInputOwner.mockResolvedValue(undefined);
  mocks.getComfyUrl.mockResolvedValue("http://worker.invalid");
  mocks.fetchComfy.mockResolvedValue({
    ok: true,
    json: async () => ({ name: "stored-file", type: "input" }),
  });
});

describe.each(media)("$type upload boundary", (file) => {
  it.each([true, false])("accepts exactly the limit (Content-Length: %s)", async (withContentLength) => {
    const result = await postFile(file, file.limit, withContentLength);
    expect(result).toEqual({ status: 200, body: {
      name: "stored-file", type: "input",
      subfolder: file.type.startsWith("audio/") ? "audio" : "",
    } });
    expect(mocks.reserveUpload).toHaveBeenCalledExactlyOnceWith("upload-test-user", file.limit);
    expect(mocks.fetchComfy).toHaveBeenCalledOnce();
    expect(mocks.recordInputOwner).toHaveBeenCalledExactlyOnceWith(
      "stored-file", "upload-test-user",
      file.type.startsWith("audio/") ? "audio" : "",
      file.type, "http://worker.invalid",
    );
  });

  it.each([true, false])("rejects one byte over with friendly 413 (Content-Length: %s)", async (withContentLength) => {
    const result = await postFile(file, file.limit + 1, withContentLength);
    expect(result).toEqual({ status: 413, body: {
      error: `${file.label} must be ${file.limit / MB} MB or smaller. "${file.name}" is too large.`,
    } });
    expect(mocks.reserveUpload).not.toHaveBeenCalled();
    expect(mocks.getComfyUrl).not.toHaveBeenCalled();
    expect(mocks.fetchComfy).not.toHaveBeenCalled();
    expect(mocks.recordInputOwner).not.toHaveBeenCalled();
  });
});

describe("phone image formats", () => {
  it("normalizes a valid HEIC photo to a safe JPEG upload", async () => {
    const result = await postBufferFile({
      type: "image/heic",
      name: "outfit-photo.heic",
      buffer: heicFixture!,
    }, "image/*");

    expect(result).toEqual({
      status: 200,
      body: { name: "stored-file", type: "input", subfolder: "" },
    });
    expect(mocks.reserveUpload).toHaveBeenCalledExactlyOnceWith("upload-test-user", heicFixture!.length);
    expect(mocks.fetchComfy).toHaveBeenCalledOnce();
    expect(mocks.recordInputOwner).toHaveBeenCalledExactlyOnceWith(
      "stored-file",
      "upload-test-user",
      "",
      "image/jpeg",
      "http://worker.invalid",
    );

    const requestOptions = mocks.fetchComfy.mock.calls[0]?.[2] as { body: FormData };
    const uploaded = requestOptions.body.get("image") as File;
    expect(uploaded.type).toBe("image/jpeg");
    expect(uploaded.name).toMatch(/^[0-9a-f-]+\.jpg$/);
  });

  it("rejects a corrupt HEIC photo with a format-specific retry message", async () => {
    const corruptHeic = Buffer.from("00000018667479706865696300000000", "hex");
    const result = await postBufferFile({
      type: "image/heic",
      name: "outfit-photo.heic",
      buffer: corruptHeic,
    }, "image/*");

    expect(result.status).toBe(415);
    expect(result.body.error).toMatch(/HEIC\/HEIF.*(decoded|corrupt|JPEG)/i);
    expect(mocks.reserveUpload).not.toHaveBeenCalled();
    expect(mocks.fetchComfy).not.toHaveBeenCalled();
    expect(mocks.recordInputOwner).not.toHaveBeenCalled();
  });

  it("rejects unsupported image bytes before quota reservation or worker access", async () => {
    const result = await postBufferFile({
      type: "image/bmp",
      name: "unsupported.bmp",
      buffer: Buffer.from("not an image"),
    }, "image/*");

    expect(result).toEqual({
      status: 415,
      body: {
        error: "This image format is not supported or the file is corrupt. Use a valid JPEG, PNG, WebP, GIF, HEIC, HEIF, or AVIF image.",
      },
    });
    expect(mocks.reserveUpload).not.toHaveBeenCalled();
    expect(mocks.fetchComfy).not.toHaveBeenCalled();
  });
});
