import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

/**
 * Durable parent record for independently queued ComfyUI child jobs.
 * Shared creative settings live here so results and retries retain context.
 */
export const batchesTable = pgTable("batches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  batchType: text("batch_type").notNull(), // scene-variation | finished-video-variation
  status: text("status").notNull().default("pending"), // pending | running | completed | failed | cancelled
  totalJobs: integer("total_jobs").notNull(),
  completedJobs: integer("completed_jobs").notNull().default(0),
  failedJobs: integer("failed_jobs").notNull().default(0),
  cancelledJobs: integer("cancelled_jobs").notNull().default(0),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Batch = typeof batchesTable.$inferSelect;