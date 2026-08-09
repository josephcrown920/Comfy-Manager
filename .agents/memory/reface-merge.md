---
name: REFACE merge into ComfyUI Studio
description: Where the Launch GPU page, launcher script, and workflow templates came from and their trust level
---

The Launch GPU page assets were merged from the user's separate "REFACE / aurora-comfy" project (uploaded as a zip, extracted copy under /tmp only).

- `artifacts/comfyui-studio/src/assets/launcher/comfyui_launcher.py` is a **copy-paste asset** (imported with `?raw`, shown for the user to paste into Colab/Kaggle). It is never executed by this project — don't try to run or lint it as app code beyond `py_compile`.
- The 5 workflow templates in `src/assets/templates/` came from that project **unverified**: only the SDXL one is certain to run on a launcher-provisioned GPU; the others reference custom nodes that may not match the launcher's node packs.
- **Why:** review flagged this; a follow-up task exists to verify templates on a real GPU. Don't present the non-SDXL templates as guaranteed-working.
- **How to apply:** when editing templates or launcher, keep node-pack lists (CAP_NODE_PACKS) and template node class names in sync.
- The zip's "Aurora" orchestrator pieces (Supabase workers/registration) were deliberately NOT merged — they depend on a backend that doesn't exist here.
