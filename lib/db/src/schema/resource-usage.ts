import { pgTable, text, integer } from "drizzle-orm/pg-core";

/**
 * One row per Clerk user. The row is reused for the current UTC day so quota
 * reservations are shared by every API process and survive restarts.
 */
export const resourceUsageTable = pgTable("resource_usage", {
  userId: text("user_id").primaryKey(),
  windowKey: text("window_key").notNull(),
  assistantRequests: integer("assistant_requests").notNull().default(0),
  uploadBytes: integer("upload_bytes").notNull().default(0),
  uploadRequests: integer("upload_requests").notNull().default(0),
});

export type ResourceUsage = typeof resourceUsageTable.$inferSelect;
