---
name: Vast autoscaling safeguards
description: Cost and lifecycle rules for automatic Vast.ai GPU provisioning.
---

Automatic Vast.ai provisioning must remain admin-controlled, disabled until explicitly enabled, limited to one in-flight instance, and constrained by a configurable hourly ceiling and minimum reliability/VRAM requirements.

**Why:** GPU provisioning spends from the owner's external balance, and duplicate provisioning or failed idle cleanup can create unbounded cost. Free and hosted-model routes should remain preferred when they satisfy the workflow.

**How to apply:** Reuse the active autoscaled worker when healthy, serialize provisioning attempts, route only after ComfyUI passes health and capability checks, and destroy the instance after the configured idle period even if autoscaling is subsequently disabled.