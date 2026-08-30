---
name: OpenAPI URI compatibility
description: Generator compatibility rule for URL-valued API fields.
---

Do not use OpenAPI `format: uri` in this workspace’s API schema until its Zod generator supports it. Define the value as a bounded string and validate the allowed URL shape in the API route.

**Why:** the current code generator emits `zod.url()` for URI-formatted fields, but the installed Zod version does not provide that API, breaking the generated library typecheck.

**How to apply:** for settings or inputs that represent URLs, keep the OpenAPI field typed as `string` and enforce protocol, host, path, and length rules with server-side validation before persisting or using the value.