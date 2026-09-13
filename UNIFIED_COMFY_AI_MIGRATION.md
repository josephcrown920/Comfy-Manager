# Unified Comfy-AI → Comfy-Manager migration

This branch makes `Comfy-Manager` the canonical application. The old Comfy-AI server is **not** mounted as a second backend; its useful capabilities are being adapted to Manager's existing auth, database, job, worker, workflow and ModelArk layers.

## Migrated / wired

- ModelArk provider architecture from Comfy-AI.
- BytePlus Video Agent planning layer.
- Complete BytePlus video workflow registry.
- Complete BytePlus cinematic/viral preset index and aliases.
- GPU Hub UI derived from the Comfy-AI GPU Hub concept.
- Free GPU catalog for Colab and Kaggle.
- Free-GPU ComfyUI launchers under `artifacts/comfyui-studio/public/downloads/gpu/`.
- GPU Hub → Settings → saved-worker selection, using Manager's existing worker routing.
- Existing Manager workflows, batches, Perform Anywhere, ModelArk and worker routing remain canonical.

## Comfy-AI frontend audit

Comfy-AI's main pages were `Home`, `Landing`, `Pricing`, `Legal`, `Faceless`, `Admin`, `AdminSetup`, `GpuHub`, and `Studio`. Manager already has a production-oriented authenticated Studio shell with Dashboard, Workflows, Batch Studio, Perform Anywhere, Assistant, Jobs, Gallery, Models, Launch and Settings. Therefore the migration strategy is feature-level rather than copying the old Wouter application wholesale.

`GpuHub` is migrated into the Manager shell as `/gpu-hub`. The remaining marketing/admin concepts should be mapped to Manager's existing authenticated pages or explicitly ported when they contain unique product behavior; duplicating the old application router would create two sources of truth.

## Free GPU behavior

A free GPU is a **worker**, not a fake provider. Once a Colab/Kaggle ComfyUI worker is exposed at a reachable URL, it is saved through Manager's existing GPU roster and can be selected manually or included in automatic worker routing. This means queue state, health checks and job ownership remain in one system.

Free GPU sessions are ephemeral and provider-controlled. Manager must never claim a free GPU is available until its worker health probe succeeds.

## Workflows and presets

Canonical video workflows:

- standard-video
- cinematic-video
- viral-video
- image-to-video
- character-video
- lip-sync-video

Imported preset families include cinematic presets (`anamorphic_dolly`, `slow_push_in`, `vertigo_zoom`, `parallax_depth`, `cold_vision`, `film_noir_key`, `macro_lens_focus`, `one_shot_tracking`, `imax_landscape`) and the complete viral/general preset index and aliases.

## Pending branches audit

- Comfy-AI `New` diverged from `main` and only adds landing/pricing changes plus image assets; it is not safe to merge wholesale into Manager.
- BytePlus Video Agent `feat/seedance-25-production-parity` is behind current `main`; it should not be cherry-picked blindly.
- BytePlus Video Agent `copilot/update-video-agent-features` is behind current `main`; treat it as historical work unless a feature is proven missing from the current agent.
- BytePlus Video Agent `fix/workflow-preset-separation` is retained as a source for the canonical workflow/preset separation already incorporated here.

## Safety rule

Do not merge this branch into `main` until typecheck/build and real worker/ModelArk smoke tests pass. Never copy credentials, old hard-coded secrets, or obsolete provider fallbacks from Comfy-AI into Manager.
