---
name: Admin content model
description: Durable decisions for Aurora's self-serve landing, workflow, template, and media editor.
---

Aurora admin presentation content is persisted as one validated JSON document in the existing settings table, while image and video bytes live in Replit App Storage. Executable workflow JSON remains code-defined; the editor changes visibility, metadata, media, slots, and templates only.

**Why:** This keeps presentation changes self-serve without introducing a second workflow runtime or a new migration surface, and prevents private storage paths from becoming public URLs.

**How to apply:** Keep admin access behind the existing Clerk allowlist, publish media only when assigned to a visible slot or catalog entry, and block deletion while an asset is assigned.