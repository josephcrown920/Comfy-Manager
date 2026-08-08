import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function getComfyUrl(): Promise<string> {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "comfyUrl"))
    .limit(1);
  return row[0]?.value ?? "http://localhost:8188";
}

router.get("/settings", async (req, res): Promise<void> => {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "comfyUrl"))
    .limit(1);

  const comfyUrl = row[0]?.value ?? "http://localhost:8188";
  const updatedAt = row[0]?.updatedAt ?? new Date();

  res.json(
    GetSettingsResponse.parse({
      comfyUrl,
      updatedAt,
    })
  );
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db
    .insert(settingsTable)
    .values({ key: "comfyUrl", value: parsed.data.comfyUrl })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: parsed.data.comfyUrl, updatedAt: new Date() },
    });

  res.json(
    UpdateSettingsResponse.parse({
      comfyUrl: parsed.data.comfyUrl,
      updatedAt: new Date(),
    })
  );
});

export default router;
export { getComfyUrl };
