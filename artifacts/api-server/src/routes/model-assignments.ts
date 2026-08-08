import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

export interface WorkflowModelAssignment {
  checkpoint: string;
  checkpointFallback: string;
}

export interface ModelAssignmentsData {
  global: WorkflowModelAssignment;
  workflows: Record<string, WorkflowModelAssignment>;
}

const DEFAULT_ASSIGNMENTS: ModelAssignmentsData = {
  global: { checkpoint: "", checkpointFallback: "" },
  workflows: {},
};

export async function getModelAssignments(): Promise<ModelAssignmentsData> {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "modelAssignments"))
    .limit(1);

  if (!row[0]?.value) return DEFAULT_ASSIGNMENTS;
  try {
    const parsed = JSON.parse(row[0].value) as ModelAssignmentsData;
    return {
      global: parsed.global ?? DEFAULT_ASSIGNMENTS.global,
      workflows: parsed.workflows ?? {},
    };
  } catch {
    return DEFAULT_ASSIGNMENTS;
  }
}

async function saveModelAssignments(data: ModelAssignmentsData): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key: "modelAssignments", value: JSON.stringify(data) })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: JSON.stringify(data), updatedAt: new Date() },
    });
}

router.get("/model-assignments", async (_req, res): Promise<void> => {
  const assignments = await getModelAssignments();
  res.json(assignments);
});

router.put("/model-assignments", async (req, res): Promise<void> => {
  const body = req.body as Partial<ModelAssignmentsData>;

  if (
    typeof body !== "object" ||
    body === null ||
    typeof body.global !== "object" ||
    typeof body.workflows !== "object"
  ) {
    res.status(400).json({ error: "Invalid model assignments body" });
    return;
  }

  const data: ModelAssignmentsData = {
    global: {
      checkpoint: String(body.global?.checkpoint ?? ""),
      checkpointFallback: String(body.global?.checkpointFallback ?? ""),
    },
    workflows: Object.fromEntries(
      Object.entries(body.workflows ?? {}).map(([wfId, wf]) => [
        wfId,
        {
          checkpoint: String((wf as WorkflowModelAssignment)?.checkpoint ?? ""),
          checkpointFallback: String(
            (wf as WorkflowModelAssignment)?.checkpointFallback ?? ""
          ),
        },
      ])
    ),
  };

  await saveModelAssignments(data);
  res.json(data);
});

export default router;
