import { Router, type IRouter } from "express";
import { db, outputsTable } from "@workspace/db";
import {
  ListOutputsQueryParams,
  ListOutputsResponse,
  GetRecentOutputsResponse,
} from "@workspace/api-zod";
import { eq, desc, and } from "drizzle-orm";
import { MODELARK_OUTPUT_SUBFOLDER, modelArkOutputUrl } from "../lib/modelark";

const router: IRouter = Router();

function formatOutput(o: typeof outputsTable.$inferSelect) {
  return {
    id: o.id,
    jobId: o.jobId,
    filename: o.filename,
    outputType: o.outputType,
    comfyUrl: o.subfolder === MODELARK_OUTPUT_SUBFOLDER
      ? modelArkOutputUrl(o.filename)
      : `/api/comfy/view?filename=${encodeURIComponent(o.filename)}&subfolder=${encodeURIComponent(o.subfolder)}&type=output`,
    thumbnailUrl: null,
    createdAt: o.createdAt,
  };
}

router.get("/outputs", async (req, res): Promise<void> => {
  const params = ListOutputsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { type, limit } = params.data;
  const conditions = [];
  if (type) conditions.push(eq(outputsTable.outputType, type));

  const outputs = await db
    .select()
    .from(outputsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(outputsTable.createdAt))
    .limit(limit ?? 50);

  res.json(ListOutputsResponse.parse(outputs.map(formatOutput)));
});

router.get("/outputs/recent", async (_req, res): Promise<void> => {
  const outputs = await db
    .select()
    .from(outputsTable)
    .orderBy(desc(outputsTable.createdAt))
    .limit(12);

  res.json(GetRecentOutputsResponse.parse(outputs.map(formatOutput)));
});

export default router;
