# ComfyUI Studio

A beginner-friendly web frontend for ComfyUI. Connect your ComfyUI server and run pre-built workflow templates for lip sync, motion control, and video generation — without touching the node graph.

## Run & Operate

- `pnpm --filter @workspace/comfyui-studio run dev` — run the frontend (port from $PORT)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS + shadcn/ui + wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — Drizzle table definitions (settings, jobs, outputs)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/comfyui-studio/src/` — React frontend (pages, components)

## Architecture decisions

- ComfyUI server URL is stored in the `settings` DB table and configurable from the Settings page
- All ComfyUI API calls go through the backend proxy (avoids CORS issues from the browser)
- Workflow templates are code-defined (not DB) — 4 built-in templates: lip sync, motion control, text-to-video, image-to-video
- Jobs track ComfyUI `prompt_id` and poll for updates via the `/jobs/:id/refresh` endpoint
- Generated output files are served via `/api/comfy/view` which proxies to the ComfyUI `/view` endpoint

## Product

- **Dashboard** — server status, job stats, quick-start buttons, recent outputs gallery
- **Generate** — pick a workflow template, fill a simple form, submit to ComfyUI
- **Jobs** — track all generation jobs with status, progress, and delete capability
- **Gallery** — masonry grid of all output files with lightbox preview
- **Settings** — configure ComfyUI server URL and test connection

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Orval generates `zod.int()` for `type: integer` fields, but the installed zod (v3.x) doesn't support it — use `type: number` in the OpenAPI spec instead
- After adding new DB schema files, run `pnpm run typecheck:libs` before typechecking artifacts (otherwise the exports won't be visible)
- The ComfyUI workflow JSON sent by the backend is a generic KSampler pipeline — users running specialized workflows (AnimateDiff, SadTalker, etc.) will need to customize it for their setup

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
