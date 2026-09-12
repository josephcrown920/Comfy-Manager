export type FreeGpuPlatform = "colab" | "kaggle";

export type FreeGpuOption = {
  id: FreeGpuPlatform;
  name: string;
  gpu: string;
  protocol: "comfyui" | "custom";
  capabilities: string[];
  launcherPath: string;
  notebookPath?: string;
  notes: string[];
};

/**
 * Free GPU workers are ordinary Manager workers once launched. The catalog is
 * intentionally provider-neutral: no secrets or paid-provider credentials are
 * embedded in the API. A launched worker registers as a normal ComfyUI worker
 * and therefore participates in the existing queue/health/routing system.
 */
export const FREE_GPU_OPTIONS: FreeGpuOption[] = [
  {
    id: "colab",
    name: "Google Colab Free GPU",
    gpu: "T4/P100 (availability varies)",
    protocol: "comfyui",
    capabilities: ["image", "video", "lipsync", "motion"],
    launcherPath: "/downloads/gpu/aurora_worker_colab.py",
    notebookPath: "/downloads/gpu/aurora_worker_colab.ipynb",
    notes: [
      "Requires GPU runtime and Internet enabled.",
      "The worker can auto-register into Manager when registration secrets are configured.",
      "Free-tier GPU availability and session duration are controlled by Colab.",
    ],
  },
  {
    id: "kaggle",
    name: "Kaggle Free GPU",
    gpu: "T4/P100 (availability varies)",
    protocol: "comfyui",
    capabilities: ["image", "video", "lipsync", "motion"],
    launcherPath: "/downloads/gpu/aurora_worker_kaggle.py",
    notebookPath: "/downloads/gpu/aurora_worker_kaggle.ipynb",
    notes: [
      "Requires GPU accelerator and Internet enabled.",
      "The worker can auto-register into Manager when registration secrets are configured.",
      "Kaggle session limits and GPU availability are controlled by Kaggle.",
    ],
  },
];

export function isFreeGpuLabel(label: string): boolean {
  return /\b(colab|kaggle)\b/i.test(label) && /free\s*gpu/i.test(label);
}
