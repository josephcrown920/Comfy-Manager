import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedWorkflowsTable = pgTable("saved_workflows", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  name: text("name").notNull(),
  json: text("json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSavedWorkflowSchema = createInsertSchema(savedWorkflowsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSavedWorkflow = z.infer<typeof insertSavedWorkflowSchema>;
export type SavedWorkflow = typeof savedWorkflowsTable.$inferSelect;
