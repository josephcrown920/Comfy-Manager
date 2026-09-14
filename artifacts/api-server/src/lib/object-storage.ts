import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { File, Storage } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export class ObjectStorageService {
  private getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (!dir) throw new Error("Private object storage is not configured.");
    return dir.replace(/\/+$/, "");
  }

  async getObjectEntityUploadURL(): Promise<{ uploadURL: string; objectPath: string }> {
    const objectId = randomUUID();
    const fullPath = `${this.getPrivateObjectDir()}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
    return { uploadURL, objectPath: `/objects/uploads/${objectId}` };
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!/^\/objects\/uploads\/[0-9a-f-]{36}$/i.test(objectPath)) {
      throw new ObjectNotFoundError();
    }
    const entityId = objectPath.slice("/objects/".length);
    const { bucketName, objectName } = parseObjectPath(`${this.getPrivateObjectDir()}/${entityId}`);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async downloadObject(file: File): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const stream = file.createReadStream();
    const headers: Record<string, string> = {
      "Content-Type": String(metadata.contentType ?? "application/octet-stream"),
      "Cache-Control": "public, max-age=3600",
    };
    if (metadata.size) headers["Content-Length"] = String(metadata.size);
    return new Response(Readable.toWeb(stream) as ReadableStream, { headers });
  }
}

function parseObjectPath(value: string): { bucketName: string; objectName: string } {
  const path = value.startsWith("/") ? value.slice(1) : value;
  const separator = path.indexOf("/");
  if (separator < 1 || separator === path.length - 1) throw new Error("Invalid object storage path.");
  return { bucketName: path.slice(0, separator), objectName: path.slice(separator + 1) };
}

async function signObjectURL(input: {
  bucketName: string;
  objectName: string;
  method: "PUT" | "GET";
  ttlSec: number;
}): Promise<string> {
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: input.bucketName,
      object_name: input.objectName,
      method: input.method,
      expires_at: new Date(Date.now() + input.ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Could not prepare media upload (${response.status}).`);
  const body = await response.json() as { signed_url?: unknown };
  if (typeof body.signed_url !== "string") throw new Error("Storage did not return an upload URL.");
  return body.signed_url;
}