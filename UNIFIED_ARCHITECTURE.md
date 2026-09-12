# Unified Comfy Manager Architecture

`Comfy-Manager` is the canonical repository for the ComfyUI Studio frontend, ComfyUI orchestration backend, hosted ModelArk generation, and BytePlus Video Agent.

## One product, one deployment boundary

```text
ComfyUI Studio UI
      |
      v
/api
      |
      +--> ComfyUI workers / RunPod / Vast
      |
      +--> ModelArk / Seedream / Seedance
      |
      +--> BytePlus Video Agent
             |
             +--> Cinematic planning
             +--> Viral planning
             +--> Standard planning
             +--> Preset -> executable workflow resolution
             +--> Perform Anywhere / reference-aware Seedance
```

## Backend ownership

- `artifacts/api-server/src/routes/jobs.ts` owns durable generation jobs, quotas, worker routing and reconciliation.
- `artifacts/api-server/src/lib/modelark.ts` owns server-side ModelArk authentication, file preparation, Seedream and Seedance calls.
- `artifacts/api-server/src/lib/byteplus-agent/` owns the BytePlus agent's production modes, presets, workflow contracts and skill routing.
- `artifacts/api-server/src/routes/video-agent.ts` exposes planning and direct Seedance execution/status endpoints.
- Existing ComfyUI workflows continue to run through the same job system; ModelArk jobs use the same durable job model rather than creating a second queue.

## Why this is the canonical merge

The older `Comfy-AI` repository had a separate Express backend/provider chain. `Comfy-Manager` already contains the more complete authenticated ComfyUI worker system, database-backed jobs, ModelArk file handling, Perform Anywhere workflow and RunPod routing. The unified architecture therefore folds the useful provider/agent concepts into this backend instead of running two competing servers.

## BytePlus Video Agent

The integrated agent supports:

- Cinematic mode: 16:9, multi-beat planning, lens/camera/lighting continuity.
- Viral mode: 9:16, hook-first pacing, rapid cuts and caption-aware planning.
- Standard mode: balanced 16:9 planning.
- Preset-to-workflow resolution so presets configure an executable workflow instead of becoming fake labels.
- ModelArk Seedance as the hosted execution provider.
- Existing Perform Anywhere workflow for an image + performance video (+ optional end frame/audio).

## Required server secrets

```text
MODELARK_API_KEY=<server secret>
MODELARK_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3
MODELARK_SEEDANCE_MODEL=<activated Seedance endpoint>
MODELARK_IMAGE_MODEL=<activated Seedream endpoint>
```

Never place ModelArk credentials in browser code.

## Safety rule

This branch is intentionally separate from `main`. Run the repository's normal typecheck/build and one real authenticated generation test before merging into `main`.
