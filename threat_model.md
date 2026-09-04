# Threat Model

## Project Overview

ComfyUI Studio is a publicly deployed React and Express application backed by PostgreSQL. It stores a ComfyUI GPU server URL, forwards workflows and uploaded media to that server, tracks generation jobs and outputs, and invokes a server-side OpenAI integration.

## Assets

- **ComfyUI endpoint credentials and GPU control** — stored URLs may contain tunnel basic-auth credentials; access permits queueing expensive GPU work and reading generated media.
- **Uploaded and generated media** — images, video, and audio may be private user content.
- **Job, workflow, and configuration data** — prompts, parameters, saved workflows, model assignments, and GPU endpoints are sensitive and integrity-critical.
- **Server-side AI quota** — unauthenticated use can consume the application's paid/provider quota.
- **Backend network access** — the API can make requests to the configured ComfyUI URL and therefore crosses a sensitive server/network boundary.

## Trust Boundaries

- **Internet browser to Express API** — all request data is attacker-controlled. Public deployment means server-side authentication and authorization are required for private data and state changes.
- **API to PostgreSQL** — the server uses a shared global data store; callers must not gain access merely by knowing IDs.
- **API to ComfyUI** — the backend forwards requests and credentials to a configurable target. Target validation and authorization around configuration are essential.
- **API to OpenAI** — requests consume a server-held integration credential and quota; access must be authenticated and abuse-limited.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/app.ts` and `artifacts/api-server/src/routes/`.
- Highest risk: `settings.ts`, `comfy.ts`, `index.ts`, `files.ts`, `jobs.ts`, `batches.ts`, and `assistant.ts`.
- Current route registration has no authentication middleware; frontend guards are not security controls.
- `artifacts/mockup-sandbox` is development-only unless separately proven reachable.

## Threat Categories

### Spoofing and Elevation of Privilege

Every endpoint exposing private state, changing configuration, submitting GPU work, deleting data, or consuming AI quota must establish an authenticated subject and authorize the action. Resource identifiers must be scoped to that subject or tenant.

### Tampering

Only authorized owners may alter the global ComfyUI endpoint, saved GPUs, model assignments, workflows, jobs, and batches. Workflow and upload inputs must be bounded and validated before crossing to ComfyUI.

### Information Disclosure

ComfyUI URLs containing credentials, prompts, job parameters, generated outputs, and uploaded files must not be returned to unauthenticated callers. Proxy responses and errors must avoid exposing credentials or internal service details.

### Server-Side Request Forgery

Configured outbound targets must be restricted to intended ComfyUI endpoints and must reject loopback, private, link-local, metadata, and unsafe protocols as applicable. Redirects must not bypass target checks.

### Denial of Service

Public upload, generation, proxy, and AI endpoints require authentication, rate limits, concurrency controls, and strict body/response bounds to prevent memory exhaustion and cost/GPU abuse.
