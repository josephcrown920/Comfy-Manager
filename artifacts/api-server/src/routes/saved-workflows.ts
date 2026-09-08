import { Router, type IRouter } from "express";
import { db, savedWorkflowsTable } from "@workspace/db";
import {
  ListSavedWorkflowsResponse,
  CreateSavedWorkflowBody,
  CreateSavedWorkflowResponse,
  DeleteSavedWorkflowParams,
  DeleteSavedWorkflowResponse,
} from "@workspace/api-zod";
import { eq, desc, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "../lib/access-control";

const router: IRouter = Router();

function toOutput(row: typeof savedWorkflowsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    json: row.json,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/saved-workflows", async (_req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const rows = await db
    .select()
    .from(savedWorkflowsTable)
    .where(eq(savedWorkflowsTable.ownerId, userId))
    .orderBy(desc(savedWorkflowsTable.createdAt));
  res.json(ListSavedWorkflowsResponse.parse(rows.map(toOutput)));
});

router.post("/saved-workflows", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const body = CreateSavedWorkflowBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // The stored JSON must be a valid ComfyUI API-format graph (a JSON object).
  try {
    const parsed = JSON.parse(body.data.json);
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
      res.status(400).json({ error: "Workflow JSON must be a JSON object (ComfyUI API format)." });
      return;
    }
  } catch (err) {
    res.status(400).json({
      error: `Workflow JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  const [row] = await db
    .insert(savedWorkflowsTable)
    .values({ ownerId: userId, name: body.data.name.trim(), json: body.data.json })
    .returning();

  res.status(201).json(CreateSavedWorkflowResponse.parse(toOutput(row!)));
});

router.delete("/saved-workflows/:id", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const params = DeleteSavedWorkflowParams.safeParse({ id: Number(req.params.id) });
  if (!params.success || !Number.isInteger(params.data.id)) {
    res.status(400).json({ error: "Invalid saved workflow id" });
    return;
  }

  const deleted = await db
    .delete(savedWorkflowsTable)
    .where(and(eq(savedWorkflowsTable.id, params.data.id), eq(savedWorkflowsTable.ownerId, userId)))
    .returning();

  if (deleted.length === 0) {
    res.status(404).json({ error: "Saved workflow not found" });
    return;
  }

  res.json(DeleteSavedWorkflowResponse.parse({ success: true }));
});

export default router;
