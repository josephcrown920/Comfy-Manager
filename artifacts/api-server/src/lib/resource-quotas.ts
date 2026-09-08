import { db, resourceUsageTable } from "@workspace/db";
import { sql } from "drizzle-orm";

// These are deliberately conservative server-funded budgets. They are
// reservations, not billing: a failed upstream request still consumes the
// reservation so retries cannot be used to bypass the limit.
export const MAX_ASSISTANT_REQUESTS_PER_DAY = 60;
export const MAX_UPLOAD_BYTES_PER_DAY = 1_000_000_000;
export const MAX_UPLOAD_REQUESTS_PER_DAY = 40;

function getUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Atomically reserve one server-funded assistant request for a user.
 * Returning false means the request was already at its daily allowance.
 */
export async function reserveAssistantRequest(
  userId: string,
): Promise<boolean> {
  const windowKey = getUtcDay();
  const sameWindow = sql`${resourceUsageTable.windowKey} = ${windowKey}`;

  const [usage] = await db
    .insert(resourceUsageTable)
    .values({
      userId,
      windowKey,
      assistantRequests: 1,
      uploadBytes: 0,
      uploadRequests: 0,
    })
    .onConflictDoUpdate({
      target: resourceUsageTable.userId,
      set: {
        windowKey,
        assistantRequests: sql<number>`
          CASE
            WHEN ${sameWindow}
              AND ${resourceUsageTable.assistantRequests} < ${MAX_ASSISTANT_REQUESTS_PER_DAY}
            THEN ${resourceUsageTable.assistantRequests} + 1
            WHEN ${sameWindow} THEN ${resourceUsageTable.assistantRequests}
            ELSE 1
          END
        `,
        uploadBytes: sql<number>`
          CASE WHEN ${sameWindow} THEN ${resourceUsageTable.uploadBytes} ELSE 0 END
        `,
        uploadRequests: sql<number>`
          CASE WHEN ${sameWindow} THEN ${resourceUsageTable.uploadRequests} ELSE 0 END
        `,
      },
    })
    .returning({ assistantRequests: resourceUsageTable.assistantRequests });

  return (
    (usage?.assistantRequests ?? MAX_ASSISTANT_REQUESTS_PER_DAY + 1) <=
    MAX_ASSISTANT_REQUESTS_PER_DAY
  );
}

/**
 * Atomically reserve upload bytes before forwarding the file to ComfyUI.
 * A rejected reservation is intentionally retained at the current limit so
 * concurrent requests cannot race through the same remaining allowance.
 */
export async function reserveUpload(
  userId: string,
  bytes: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return false;

  const windowKey = getUtcDay();
  const sameWindow = sql`${resourceUsageTable.windowKey} = ${windowKey}`;
  const withinByteBudget = sql`
    ${resourceUsageTable.uploadBytes} + ${bytes} <= ${MAX_UPLOAD_BYTES_PER_DAY}
  `;
  const withinRequestBudget = sql`
    ${resourceUsageTable.uploadRequests} < ${MAX_UPLOAD_REQUESTS_PER_DAY}
  `;

  const [usage] = await db
    .insert(resourceUsageTable)
    .values({
      userId,
      windowKey,
      assistantRequests: 0,
      uploadBytes: bytes,
      uploadRequests: 1,
    })
    .onConflictDoUpdate({
      target: resourceUsageTable.userId,
      set: {
        windowKey,
        assistantRequests: sql<number>`
          CASE WHEN ${sameWindow} THEN ${resourceUsageTable.assistantRequests} ELSE 0 END
        `,
        uploadBytes: sql<number>`
          CASE
            WHEN NOT ${sameWindow} THEN ${bytes}
            WHEN ${withinByteBudget} AND ${withinRequestBudget}
              THEN ${resourceUsageTable.uploadBytes} + ${bytes}
            ELSE ${resourceUsageTable.uploadBytes}
          END
        `,
        uploadRequests: sql<number>`
          CASE
            WHEN NOT ${sameWindow} THEN 1
            WHEN ${withinByteBudget} AND ${withinRequestBudget}
              THEN ${resourceUsageTable.uploadRequests} + 1
            ELSE ${resourceUsageTable.uploadRequests}
          END
        `,
      },
    })
    .returning({
      uploadBytes: resourceUsageTable.uploadBytes,
      uploadRequests: resourceUsageTable.uploadRequests,
    });

  return (
    (usage?.uploadBytes ?? MAX_UPLOAD_BYTES_PER_DAY + 1) <=
      MAX_UPLOAD_BYTES_PER_DAY &&
    (usage?.uploadRequests ?? MAX_UPLOAD_REQUESTS_PER_DAY + 1) <=
      MAX_UPLOAD_REQUESTS_PER_DAY
  );
}
