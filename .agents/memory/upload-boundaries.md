---
name: Upload boundary semantics
description: Why upload limits need real-parser boundary tests rather than mocked file sizes alone.
---

Keep advertised upload limits inclusive: a file exactly at the limit must pass, while one byte over must fail.

**Why:** Busboy's absolute `fileSize` ceiling rejects at equality, unlike the browser and streaming per-type checks. Giving it the same numeric ceiling silently rejects valid maximum-size audio and video files.

**How to apply:** Retain a slightly larger parser safety ceiling than the streaming per-type caps. Test actual multipart bytes both with Content-Length and with chunked transfer; mocked parser results cannot catch this behavior.
