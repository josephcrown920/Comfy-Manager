# Offline workflow checks

Run `pnpm --filter @workspace/comfyui-studio validate:workflows` from the
repository root (or `pnpm validate:workflows` here). This recursively scans every
JSON asset in `src/assets/templates`, reports all failures with filenames and
node/input locations, and exits nonzero on failure.

`pnpm --filter @workspace/comfyui-studio test` runs this check before the frontend
Vitest suite. The suite also exercises intentionally broken graphs and every
shipped template. No server, credentials, GPU, network access, or weights are
needed.

When adding a template, add its advertised capability to `templateContracts` in
`workflow-contracts.mjs`. When adding/upgrading a node pack, review its input and
output definitions and update `nodeContracts` explicitly. Optional inputs end in
`?`. Do not generate these contracts from the JSON being validated: that would
make a broken template define its own passing contract.

These contracts cover API graph shape, required inputs, literal types/ranges,
typed output links, acyclic dependencies, capability nodes on the output path,
model-family references, and critical capability wiring. They intentionally allow
user-editable prompt and upload placeholders.

This is a static regression gate, not a guarantee that every external node pack
version installs or executes. Live `/object_info` compatibility and actual GPU
execution are separate checks; this command must never rent a GPU or download
model weights.
