import { Router, type IRouter } from "express";
import { FREE_GPU_OPTIONS } from "../lib/free-gpu";

const router: IRouter = Router();

// Public metadata only. Launchers themselves contain no private credentials.
router.get("/free-gpus", (_req, res) => {
  res.json({
    providers: FREE_GPU_OPTIONS.map((provider) => ({
      ...provider,
      launcherUrl: provider.launcherPath,
      notebookUrl: provider.notebookPath,
    })),
  });
});

export default router;
