---
name: Admin grant approvals
description: Owner-approved blook and Starter Bundle requests, plus direct admin Mod grants.
---

- Only blook and Starter Bundle rewards requested from the Admin Panel must wait for an owner decision; all other existing admin tools remain immediate.
- Approving a request must atomically claim its `pending` state before applying any reward, so double-clicks, retries, and concurrent owner actions cannot duplicate inventory or bundle benefits.
- Granting Mod is intentionally immediate and grants the visible Mod badge together with mod-panel access in one database update.

**Why:** Staff need a lightweight way to request high-value rewards without being able to issue them unattended, while the owner retains a clear audit trail and a single approval point.

**How to apply:** Preserve the pending/approved/rejected decision record whenever extending reward requests. Do not route unrelated tools through this queue unless the owner explicitly changes the policy.