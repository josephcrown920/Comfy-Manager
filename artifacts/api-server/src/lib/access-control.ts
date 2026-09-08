import type { NextFunction, Request, Response } from "express";

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
export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  const userId = res.locals.userId;
  const configuredAdmins = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (typeof userId !== "string" || !configuredAdmins.includes(userId)) {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }

  next();
}