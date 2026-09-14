import type { NextFunction, Request, Response } from "express";
import { clerkClient } from "@clerk/express";

export function getAuthenticatedUserId(res: Response): string {
  const userId = res.locals.userId;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("Authenticated user context is missing.");
  }
  return userId;
}

/**
 * Infrastructure settings affect every user's jobs and the server's outbound
 * network access. Keep this administrative boundary explicit and fail closed
 * when no administrator has been configured.
 */
export async function requireAdmin(_req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = res.locals.userId;
  const configuredAdmins = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (typeof userId === "string" && configuredAdmins.includes(userId)) {
    next();
    return;
  }

  const configuredEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (typeof userId === "string" && configuredEmails.length > 0) {
    try {
      const user = await clerkClient.users.getUser(userId);
      const email = user.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
      if (email && configuredEmails.includes(email)) {
        next();
        return;
      }
    } catch {
      // Fail closed when Clerk cannot confirm the signed-in user's email.
    }
  }

  if (typeof userId !== "string" || (!configuredAdmins.length && !configuredEmails.length)) {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }

  res.status(403).json({ error: "Administrator access is required." });
}