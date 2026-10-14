---
name: Offline workflow validation boundary
description: How to maintain useful workflow regression checks without confusing them with live GPU compatibility
---

Keep offline workflow contracts independent of the templates they validate.

**Why:** Deriving required inputs or capability wiring from the shipped JSON would let a broken template define its own passing check. Offline passing results also cannot establish compatibility with an installed external node-pack version.

**How to apply:** Review contracts against upstream node definitions when upgrading packs. Keep graph regression checks network-free and never rent a GPU or download weights as part of frontend validation. Describe live node compatibility and execution as separate verification.
