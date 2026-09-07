# RunPod Serverless GPU

Comfy Manager now includes a RunPod Serverless bridge for on-demand GPU inference. The bridge keeps GPU credentials server-side and exposes a small API for Aurora/Comfy Manager to submit, monitor, and cancel jobs.

## Required environment variables

- `RUNPOD_API_KEY` — RunPod API key. Keep this secret; never expose it to the browser.
- `RUNPOD_ENDPOINT_ID` — the RunPod Serverless endpoint ID for the ComfyUI worker.
- `RUNPOD_BASE_URL` — optional; defaults to `https://api.runpod.ai/v2`.

## API endpoints

- `GET /api/gpu/runpod/config` — reports whether the bridge is configured without revealing the API key.
- `GET /api/gpu/runpod/health` — returns RunPod endpoint health and worker/job counts.
- `POST /api/gpu/runpod/jobs` — submits an asynchronous Serverless job. The request body is wrapped as `{ input: ... }` unless it already contains an `input` property.
- `GET /api/gpu/runpod/jobs/:jobId` — polls a job and returns its RunPod status/output.
- `POST /api/gpu/runpod/jobs/:jobId/cancel` — cancels a queued or running job.

## RunPod endpoint configuration

Create a queue-based Serverless endpoint whose handler accepts the input payload and runs the selected ComfyUI workflow. Set the endpoint to:

- minimum workers: `0`
- maximum workers: sized for the expected concurrency
- idle timeout: short enough to scale down when unused
- GPU types: choose one or more compatible GPUs in priority order
- model caching/network storage: use persistent model storage for large ComfyUI models

The application does not create or modify the RunPod endpoint automatically. This keeps billing and infrastructure changes explicit. Once the endpoint exists, only the endpoint ID and API key need to be configured in the deployment environment.

## Intended flow

1. User selects a workflow in Comfy Manager.
2. Aurora decides whether the job should use local ComfyUI, RunPod Serverless, or an external model API.
3. For RunPod, the server submits `/run` and receives a job ID.
4. The UI polls the job status endpoint until completion/failure.
5. Completed outputs are stored/referenced by the existing job/output system.
6. With minimum workers set to `0`, RunPod can scale the worker back down after the idle timeout.

Do not put `RUNPOD_API_KEY` in frontend code, public repository files, or client-side environment variables.
