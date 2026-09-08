---
name: Worker routing
description: Rules for selecting and tracking jobs across user-owned ComfyUI workers.
---

Worker selection must probe reachability, queue depth, and required node capabilities immediately before prompt submission. Persist the selected worker endpoint on the job so polling and output retrieval remain stable when Settings changes later.

**Why:** User-owned GPU URLs can disappear or change health between settings updates and submission, and a later global URL lookup can send history/output requests to the wrong machine.

**How to apply:** Keep automatic routing provider-neutral and queue-aware; manual routing should fail clearly when its pinned worker is unavailable. Batch schedulers should leave work pending when a reserved slot has no additional healthy worker rather than marking that work failed.