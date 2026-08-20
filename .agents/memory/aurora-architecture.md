---
name: Aurora architecture
description: Recommended architecture for evolving ComfyUI Studio into Aurora Canvas without splitting the product.
---

Use the existing ComfyUI Studio artifact as Aurora Canvas. Treat the API server as the Aurora Orchestrator: it owns provider-neutral capability routing, fallback decisions, job state, and ComfyUI execution. Keep the frontend focused on creative intent and results, and keep ComfyUI as the user-owned GPU execution backend.

**Why:** A second Aurora app or direct browser-to-model connections would duplicate routing, complicate authentication and job tracking, and weaken the existing ComfyUI workflow boundary.

**How to apply:** Add provider adapters behind capability interfaces (`text`, `image`, `video`, `audio`, `comfyui`) and route by capability/model metadata rather than vendor names. Start with providers available through Replit-managed integrations; add Gemini, GLM, or other providers as adapters later without changing the UI contract. Use cheap-first routing only when the request is classifiable and validate outputs before escalating.