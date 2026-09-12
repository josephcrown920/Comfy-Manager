# Get Ready With Me

## Purpose
Turn a user's real getting-ready video into a cinematic GRWM while preserving the user's identity, actions, gestures, timing, and performance beats.

## Inputs
- `performance_video`: the user's original 3–30 second getting-ready video; motion/timing anchor.
- `reference_images[]`: identity, styling, product, and continuity references.
- `reference_videos[]`: motion, framing, transition, and treatment references.
- `outfit_reference`: the new outfit to apply consistently.
- `location_reference`: optional target environment image. Use this when the user wants to replace the original room, street, hotel, studio, car interior, or other setting.
- `scene_reference_images[]`: optional production-design references for architecture, set dressing, composition, lighting, and atmosphere.
- `scene_prompt`: optional scene/look direction; can describe a new location even when no location image is supplied.
- `motion_context`: optional performance direction.
- `aspect_ratio`: `9:16` default; also `16:9` and `1:1`.
- `resolution`: `720p` default.
- `duration`: 4–15 seconds.

## Location behavior
Location is **optional**. If no location reference or explicit scene change is supplied, preserve the original environment from the performance video. If a location reference is supplied, treat it as the target environment and rebuild the scene around it while preserving the user's identity, original performance, and intended camera behavior.

## Scene behavior
Scene references are separate from the outfit. They allow the user to provide a visual target for the new environment, production design, lighting, architecture, atmosphere, or composition. Multiple scene references should be harmonized into one coherent environment rather than copied literally or mixed with unrelated subjects.

## Generation contract
1. Preserve the original person's identity.
2. Preserve the original performance, gestures, actions, pacing, and camera timing whenever possible.
3. Use reference images as visual identity, styling, product, and continuity constraints.
4. Use reference videos as motion/framing/transition/treatment guidance without replacing the user's performance.
5. Apply the supplied outfit reference consistently across the generated sequence.
6. If `location_reference` exists, replace the original environment with the supplied target location while preserving the performer and performance.
7. If `scene_reference_images[]` exists, use them to guide production design, lighting, architecture, set dressing, atmosphere, and composition.
8. If no location reference exists, preserve the original environment unless `scene_prompt` explicitly requests a new setting.
9. Keep wardrobe, face, hands, hair, lighting, and scene coherent across frames.
10. Do not introduce unrelated people or alter the performance beats.

## Provider strategy
The workflow is designed for multimodal video generation and should prefer Seedance 2.5 when ModelArk is configured. Seedance 2.x supports combined text + image + video references; the production adapter should pass the performance video plus the supplied outfit, location, scene, and other reference media as separate reference inputs.

## Stable workflow ID
`get-ready-with-me`

## UI label
`Get Ready With Me`
