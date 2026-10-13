import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchComfy } from "../routes/comfy";
import { getComfyUrl } from "../routes/settings";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
async function validatePerformanceDuration(bytes: Buffer, kind: "video" | "audio") {
  const directory = await mkdtemp(join(tmpdir(), "aurora-motion-"));
  try {
    const file = join(directory, "performance");
    await writeFile(file, bytes, { mode: 0o600 });
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file], { timeout: 15000, maxBuffer: 32768 });
    const metadata = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string }[] };
    const duration = Number(metadata.format?.duration);
    const maximum = kind === "audio" ? 60 : 30;
    if (!metadata.streams?.some((s) => s.codec_type === kind) || !Number.isFinite(duration) || duration <= 0 || duration > maximum) {
      throw new Error(`Use a valid ${kind} performance of ${maximum} seconds or less.`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Use a valid")) throw e;
    throw new Error(`Could not verify the ${kind} duration. Use a standard MP4 video or MP3/WAV audio file.`);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

const PREFIX = "studio-input-owner:";
export async function recordInputOwner(name: string, ownerId: string, subfolder: string, contentType: string, workerUrl?: string) {
  await db.insert(settingsTable).values({
    key: PREFIX + name, value: JSON.stringify({ ownerId, subfolder, contentType, workerUrl }),
  }).onConflictDoUpdate({ target: settingsTable.key, set: {
    value: JSON.stringify({ ownerId, subfolder, contentType, workerUrl }), updatedAt: new Date(),
  } });
}

export async function requireOwnedInput(name: unknown, ownerId: string, kind: "image" | "video" | "audio") {
  if (typeof name !== "string" || !name || name.length > 255 || /[\\/\0]/.test(name) || name === "." || name === "..") throw new Error(`Upload a valid ${kind} file.`);
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, PREFIX + name));
  if (!row) throw new Error(`Please re-upload ${name}; this older upload has no ownership record.`);
  const meta = JSON.parse(row.value) as { ownerId: string; subfolder: string; contentType: string; workerUrl?: string };
  if (meta.ownerId !== ownerId || !meta.contentType.startsWith(`${kind}/`)) throw new Error(`This ${kind} input is not one of your uploads.`);
  return { name, ...meta };
}

/** Bounded media transfer; filenames and ownership are resolved before any network call. */
export async function ownedInputDataUri(name: unknown, ownerId: string, kind: "image" | "video" | "audio") {
  const meta = await requireOwnedInput(name, ownerId, kind);
  const query = new URLSearchParams({ filename: meta.name, subfolder: meta.subfolder, type: "input" });
  const response = await fetchComfy(meta.workerUrl || await getComfyUrl(), `/view?${query}`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.body) throw new Error(`Cannot read your ${kind} input.`);
  const limit = (kind === "video" ? 40 : kind === "image" ? 10 : 15) * 1024 * 1024;
  if (Number(response.headers.get("content-length") ?? 0) > limit) { await response.body.cancel(); throw new Error(`Hosted ${kind} inputs must be at most ${limit / 1024 / 1024}MB.`); }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new Error(`Hosted ${kind} inputs must be at most ${limit / 1024 / 1024}MB.`); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (kind !== "image") await validatePerformanceDuration(bytes, kind);
  return `data:${meta.contentType};base64,${bytes.toString("base64")}`;
}
