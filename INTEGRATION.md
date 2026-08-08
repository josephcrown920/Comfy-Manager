# Integrating Your App with ComfyUI Studio

Copy-paste this whole document into your main app's Agent chat, replacing
`STUDIO_URL` with the published URL of this project (e.g. `https://your-studio.replit.app`).

---

## What this is

ComfyUI Studio is a separate service that proxies and orchestrates a ComfyUI
server (image/video generation). Your app can integrate with it over plain
HTTP — no SDK needed. All endpoints are JSON under `STUDIO_URL/api`.

## Endpoints

### Health & status
- `GET /api/healthz` → `{ "status": "ok" }`
- `GET /api/comfy/status` → `{ connected, serverUrl, gpuName, gpuVram, ramUsed, ramTotal, queueRemaining, error }`

### Workflows (generation templates)
- `GET /api/workflows` → array of `{ id, name, description, category, params[] }`
  - Current template ids: `lip-sync-basic`, `motion-control-animatediff`, `video-generation-txt2vid`, `img2vid-stable-video`
  - Each `params[]` entry describes a form field: `{ key, label, type: text|number|file|select|slider, required, defaultValue, options, min, max, accept }`
- `GET /api/workflows/{id}` → single template

### Jobs (submit and track generations)
- `POST /api/jobs` — submit a generation
  - Body: `{ "workflowId": "video-generation-txt2vid", "params": { "prompt": "a sunset over mountains", "steps": 25 } }`
  - Returns `201` with `{ id, status, comfyPromptId, progress, ... }`
  - `status` is `running` if ComfyUI accepted it, `pending` if ComfyUI was unreachable
- `GET /api/jobs` — list jobs (query: `status`, `workflowId`, `limit`)
- `GET /api/jobs/{id}` — job detail including `outputs[]`
- `POST /api/jobs/{id}/refresh` — poll ComfyUI for updated status; call this periodically while `status == "running"`
- `DELETE /api/jobs/{id}` — delete a job and its output records
- `GET /api/jobs/stats` → `{ total, pending, running, completed, failed, todayCount }`

### Outputs (generated files)
- `GET /api/outputs` — all outputs (query: `type=image|video|audio`, `limit`)
- `GET /api/outputs/recent` — latest outputs
- Each output has a `comfyUrl` field, a relative path like
  `/api/comfy/view?filename=...&subfolder=...&type=output`.
  Prefix it with `STUDIO_URL` to get a fetchable file URL.

### Models
- `GET /api/comfy/models` → `{ checkpoints[], loras[], vaes[], controlnets[] }` available on the connected ComfyUI server
- `GET /api/model-assignments` / `PUT /api/model-assignments` — which checkpoint each workflow uses, with fallbacks. Normally managed in the Studio UI; your app usually doesn't need these.

## Typical integration flow

1. `GET /api/comfy/status` — show whether generation is available
2. `GET /api/workflows` — render a picker or hardcode the workflow you need
3. `POST /api/jobs` with the user's inputs
4. Poll `POST /api/jobs/{id}/refresh` every ~5s until `status` is `completed` or `failed`
5. Display `outputs[].comfyUrl` (prefixed with `STUDIO_URL`)

## Notes

- No authentication is currently required. If the Studio deployment is set to
  **private**, external calls will be rejected — either keep it **public** or
  create an external access token in the Studio's publishing settings and send
  it as `Authorization: Bearer <token>`.
- The Studio itself needs a running ComfyUI server configured in its Settings
  page; otherwise jobs stay `pending`.
