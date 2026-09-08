import { Router, type IRouter } from "express";
import { db, jobsTable, outputsTable } from "@workspace/db";
import {
  ListOutputsQueryParams,
  ListOutputsResponse,
  GetRecentOutputsResponse,
} from "@workspace/api-zod";
import { eq, desc, and } from "drizzle-orm";
import { MODELARK_OUTPUT_SUBFOLDER, modelArkOutputUrl } from "../lib/modelark";
import { getAuthenticatedUserId } from "../lib/access-control";

const router: IRouter = Router();

function formatOutput(o: typeof outputsTable.$inferSelect) {
  return {
    id: o.id,
    jobId: o.jobId,
    filename: o.filename,
    subfolder: o.subfolder,
    outputType: o.outputType,
    comfyUrl: o.subfolder === MODELARK_OUTPUT_SUBFOLDER
      ? modelArkOutputUrl(o.filename)
      : `/api/comfy/view?filename=${encodeURIComponent(o.filename)}&subfolder=${encodeURIComponent(o.subfolder)}&type=output&jobId=${o.jobId}`,
    thumbnailUrl: null,
    createdAt: o.createdAt,
  };
}

router.get("/outputs", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const params = ListOutputsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { type, limit } = params.data;
  const conditions = [];
  conditions.push(eq(jobsTable.ownerId, userId), eq(outputsTable.ownerId, userId));
  if (type) conditions.push(eq(outputsTable.outputType, type));

  const outputs = await db
    .select({ output: outputsTable })
    .from(outputsTable)
    .innerJoin(jobsTable, eq(outputsTable.jobId, jobsTable.id))
    .where(and(...conditions))
    .orderBy(desc(outputsTable.createdAt))
    .limit(limit ?? 50);

  res.json(ListOutputsResponse.parse(outputs.map(({ output }) => formatOutput(output))));
});

router.get("/outputs/recent", async (_req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const outputs = await db
    .select({ output: outputsTable })
    .from(outputsTable)
    .innerJoin(jobsTable, eq(outputsTable.jobId, jobsTable.id))
    .where(and(eq(jobsTable.ownerId, userId), eq(outputsTable.ownerId, userId)))
    .orderBy(desc(outputsTable.createdAt))
    .limit(12);

  res.json(GetRecentOutputsResponse.parse(outputs.map(({ output }) => formatOutput(output))));
});

export default router;
