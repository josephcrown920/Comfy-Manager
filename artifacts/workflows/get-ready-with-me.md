# Get Ready With Me

## Purpose
Turn a user's real getting-ready video into a cinematic GRWM while preserving the user's identity, actions, gestures, timing, and performance beats.

## Inputs
- `performance_video`: the user's original 3–30 second getting-ready video; motion/timing anchor.
- `reference_images[]`: identity, styling, environment, product, and continuity references.
- `reference_videos[]`: motion, framing, transition, and treatment references.
- `outfit_reference`: the new outfit to apply consistently.
- `scene_prompt`: optional scene/look direction.
- `motion_context`: optional performance direction.
- `aspect_ratio`: `9:16` default; also `16:9` and `1:1`.
- `resolution`: `720p` default.
- `duration`: 4–15 seconds.

## Generation contract
1. Preserve the original person's identity.
2. Preserve the original performance, gestures, actions, pacing, and camera timing whenever possible.
3. Use the reference images as visual identity/style/scene constraints.
4. Use the reference videos as motion/framing/transition guidance without replacing the user's performance.
5. Apply the supplied outfit reference consistently across the generated sequence.
6. Keep wardrobe, face, hands, hair, and scene coherent across frames.
7. Do not introduce unrelated people or alter the performance beats.

## Provider strategy
The workflow is designed for multimodal video generation and should prefer Seedance 2.5 when ModelArk is configured. Seedance 2.x supports combined text + image + video references; the production adapter should pass the performance video plus the supplied reference media as separate reference inputs.

## Stable workflow ID
`get-ready-with-me`

## UI label
`Get Ready With Me`
