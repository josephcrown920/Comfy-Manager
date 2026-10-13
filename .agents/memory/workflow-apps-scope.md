---
name: Workflow Apps scope
description: User-approved sharing boundary, multi-provider motion and visual environment requirements for Aurora.
---

## Perform Anywhere options

Perform Anywhere must offer multiple motion providers in the same app, including Kling and OmniHuman, with separate results for each selected provider. Do not split the product into provider-locked apps.

**Why:** The user corrected the single-provider app behavior and explicitly requested Kling, OmniHuman and depth maps.

**How to apply:** Keep provider selection together, with explicit submission and cost consent. Depth guides the common still-generation stage; do not claim these hosted motion APIs accept a separate depth map. OmniHuman needs audio, whereas Kling motion control needs video.

Users should be able to choose visually demonstrated environments, including colored studio backdrops, outdoor scenes, a pool, basketball court, stadium and studio spaces, using cleaned uploaded backgrounds and additional creative scenes.

**Why:** The user supplied reference photos and requested selectable environments rather than requiring a location upload every time.

**How to apply:** A selected environment must supply its actual reference image to execution, not just change a preview or prompt. Disclose AI-reconstructed backgrounds and distinguish newly generated scenes from cleaned references.
Shared Workflow Apps are for signed-in users only. Bring selected features from remix-of-comfy-setup-buddy into Aurora; do not replace Aurora with that repository's separate app.

**Why:** The user chose “Bring selected features into Aurora,” clarified “Merge with aurora,” and selected “Signed-in users only” for shared app execution.

**How to apply:** Preserve existing authentication, storage, and provider execution. Sharing an app shares workflow settings, not the creator's private uploads or generated results. Each runner supplies their own assets. Complete Perform Anywhere apps retain the selection step between five-angle generation and motion rendering rather than pretending the entire pipeline is one unattended render.
