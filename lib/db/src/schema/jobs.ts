import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  workflowId: text("workflow_id").notNull(),
  workflowName: text("workflow_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | running | completed | failed | cancelled
  params: jsonb("params").notNull().default({}),
  comfyPromptId: text("comfy_prompt_id"),
  workerId: integer("worker_id"),
  workerLabel: text("worker_label"),
  workerUrl: text("worker_url"),
  batchId: integer("batch_id"),
  batchIndex: integer("batch_index"),
  progress: integer("progress").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
