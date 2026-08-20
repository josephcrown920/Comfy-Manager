import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// A connected ComfyUI endpoint is one user-owned GPU queue. Every submission
// path cooperates on this PostgreSQL advisory transaction lock, holding it
// through prompt acceptance and durable job recording.
const GPU_LEASE_KEY = 485_927;

export async function withGpuSubmissionLease<T>(work: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${GPU_LEASE_KEY})`);
    return work();
  });
}