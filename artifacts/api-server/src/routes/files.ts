import { Router, type IRouter } from "express";
import {
  ProxyUploadBody,
  ProxyUploadResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// This endpoint is a passthrough — the frontend uploads directly to ComfyUI
// and then calls this to register the file reference if needed.
router.post("/files/proxy-upload", async (req, res): Promise<void> => {
  const parsed = ProxyUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  res.json(
    ProxyUploadResponse.parse({
      name: parsed.data.name,
      subfolder: parsed.data.subfolder,
      type: parsed.data.type,
    })
  );
});

export default router;
