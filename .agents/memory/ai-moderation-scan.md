---
name: Cloaket AI moderation scan
description: Admin panel AI scan (adminAiScan routes) — provider safety-filter handling and action semantics
---

- The Azure-backed OpenAI proxy 400s with `code: "content_filter"` when a prompt CONTAINS severe hate content — so the worst content can block its own moderation scan. Fix in place: bisect the chunk on content_filter errors; a single item that still trips the filter is auto-flagged with the filter as the reason. Any future feature that feeds user content into the LLM needs the same handling.
- Scan flag tokens: `u:` rename username, `p:` delete whole account (model sees message authors as `by p:<id>`), `c:` disband clan, `g:/cm:/tm:` delete messages. Apply is per-item fault-tolerant; account deletion is a full transaction cascade (clans owned get disbanded too).
- **Why:** content-filter failures were silently returning "0 flagged" on the most hateful content.
