import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const outputsTable = pgTable("outputs", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  jobId: integer("job_id").notNull(),
  filename: text("filename").notNull(),
  outputType: text("output_type").notNull().default("image"), // image | video | audio
  subfolder: text("subfolder").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertOutputSchema = createInsertSchema(outputsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOutput = z.infer<typeof insertOutputSchema>;
export type Output = typeof outputsTable.$inferSelect;
