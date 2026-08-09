---
name: OpenAPI codegen quirks
description: Durable gotchas when regenerating the API client from the OpenAPI spec
---

# OpenAPI codegen quirks

**Rule:** The codegen tool regenerates its barrel exports, which reintroduces a name collision between the `UploadFileBody` type and the zod schema of the same name. Expect the libs typecheck to fail after every codegen run until the duplicate export is excluded again.

**Why:** The exclusion is a manual patch inside a machine-generated file, so regeneration always overwrites it.

**Also:** use `type: number` (never `integer`) in the OpenAPI spec — the zod pipeline mishandles `integer`.
