import { db, jobsTable, outputsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { fetchComfy } from "../routes/comfy";
import { getComfyUrl } from "../routes/settings";
import {
  getSeedanceTask,
  MODELARK_OUTPUT_SUBFOLDER,
  MODELARK_WORKFLOW_ID,
} from "./modelark";

type ComfyOutputFile = {
  filename: string;
  subfolder: string;
  type: string;
};

type ComfyHistoryEntry = {
  status?: { completed?: boolean; status_str?: string };
  outputs?: Record<
    string,
    {
      images?: ComfyOutputFile[];
      gifs?: ComfyOutputFile[];
      videos?: ComfyOutputFile[];
      audio?: ComfyOutputFile[];
    }
  >;
};

function getOutputType(filename: string): "video" | "audio" | "image" {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "webm", "avi", "mov", "gif"].includes(extension)) return "video";
  if (["wav", "mp3", "ogg", "flac"].includes(extension)) return "audio";
  return "image";
}

/**
 * Reconcile a running job against ComfyUI history.
 *
 * Completion is claimed conditionally inside the same transaction that saves
 * outputs, making concurrent calls from HTTP refreshes and the progress tracker
 * idempotent.
 */
export async function reconcileJob(jobId: number): Promise<void> {
  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, jobId))
    .limit(1);

  if (!job?.comfyPromptId || job.status !== "running") return;

  if (job.workflowId === MODELARK_WORKFLOW_ID && job.comfyPromptId.startsWith("modelark:")) {
    const taskId = job.comfyPromptId.slice("modelark:".length);
    try {
      const task = await getSeedanceTask(taskId);
      const status = String(task.status ?? "").toLowerCase();
      if (["succeeded", "completed", "success"].includes(status) && task.content?.video_url) {
        await db.transaction(async (tx) => {
          const claimed = await tx
            .update(jobsTable)
            .set({ status: "completed", progress: 100, completedAt: new Date() })
            .where(and(eq(jobsTable.id, job.id), eq(jobsTable.status, "running")))
            .returning({ id: jobsTable.id });
          if (!claimed.length) return;
          await tx.insert(outputsTable).values({
            jobId: job.id,
            filename: taskId,
            subfolder: MODELARK_OUTPUT_SUBFOLDER,
            outputType: "video",
          });
        });
      } else if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        await db.update(jobsTable)
          .set({ status: "failed", errorMessage: task.error?.message || "ModelArk reported an error." })
          .where(and(eq(jobsTable.id, job.id), eq(jobsTable.status, "running")));
      } else {
        await db.update(jobsTable)
          .set({ progress: Math.min(Math.max(job.progress ?? 5, 5) + 5, 95) })
          .where(and(eq(jobsTable.id, job.id), eq(jobsTable.status, "running")));
      }
    } catch {
      // ModelArk is asynchronous; a transient status failure should not fail the job.
    }
    return;
  }

  const comfyUrl = await getComfyUrl();
  const historyResponse = await fetchComfy(
    comfyUrl,
    `/history/${job.comfyPromptId}`,
  );
  if (!historyResponse.ok) return;

  const history = (await historyResponse.json()) as Record<
    string,
    ComfyHistoryEntry
  >;
  const entry = history[job.comfyPromptId];

  if (entry?.status?.completed) {
    const outputFiles = Object.values(entry.outputs ?? {}).flatMap((output) => [
      ...(output.images ?? []),
      ...(output.gifs ?? []),
      ...(output.videos ?? []),
      ...(output.audio ?? []),
    ]);

    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(jobsTable)
        .set({ status: "completed", progress: 100, completedAt: new Date() })
        .where(
          and(eq(jobsTable.id, job.id), eq(jobsTable.status, "running")),
        )
        .returning({ id: jobsTable.id });

      if (!claimed.length) return;

      if (outputFiles.length) {
        await tx.insert(outputsTable).values(
          outputFiles.map((file) => ({
            jobId: job.id,
            filename: file.filename,
            subfolder: file.subfolder,
            outputType: getOutputType(file.filename),
          })),
        );
      }
    });
  } else if (entry?.status?.status_str === "error") {
    await db
      .update(jobsTable)
      .set({ status: "failed", errorMessage: "ComfyUI reported an error" })
      .where(and(eq(jobsTable.id, job.id), eq(jobsTable.status, "running")));
  }
}

export async function reconcileJobByPromptId(promptId: string): Promise<void> {
  const [job] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.comfyPromptId, promptId),
        eq(jobsTable.status, "running"),
      ),
    )
    .limit(1);

  if (job) await reconcileJob(job.id);
}