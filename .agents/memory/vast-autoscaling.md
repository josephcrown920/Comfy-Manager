---
name: Vast autoscaling safeguards
description: Cost and lifecycle rules for automatic Vast.ai GPU provisioning.
---

Automatic Vast.ai provisioning must remain admin-controlled, disabled until explicitly enabled, limited to one in-flight instance, and constrained by a configurable hourly ceiling and minimum reliability/VRAM requirements.

**Why:** GPU provisioning spends from the owner's external balance, and duplicate provisioning or failed idle cleanup can create unbounded cost. Free and hosted-model routes should remain preferred when they satisfy the workflow.

**How to apply:** Reuse the active autoscaled worker when healthy, serialize provisioning attempts, route only after ComfyUI passes health and capability checks, and destroy the instance after the configured idle period even if autoscaling is subsequently disabled.

The Vast credential may be able to search marketplace offers while still being unable to manage instances; the management API can reject `/instances/` with a 2FA privilege error. Treat that as an authentication gate, not as permission to attempt a rental.

**Why:** Offer discovery is non-billable, but instance lifecycle calls can spend balance and must be proven with a credential that has the required account privileges first.

**How to apply:** Probe a read-only instance-management endpoint before enabling or starting autoscaling. If it returns a 2FA/privilege error, stop and request a properly privileged key or completed account setup.