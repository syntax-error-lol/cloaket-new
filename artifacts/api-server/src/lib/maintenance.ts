/**
 * EMERGENCY MAINTENANCE SWITCH — Aug 28, 2026 hack recovery.
 *
 * While true:
 *  - every /api route (except Stripe webhooks and static /api/content
 *    images) returns 503 with this message — no logins, pack opens, chat,
 *    or any other database writes can happen mid-restore
 *  - the Discord bot does not start, so /open and the chat bridge are
 *    paused too
 *  - the web client shows a full-screen maintenance notice (it has its own
 *    copy of this flag in artifacts/blacket-game/src/App.tsx — flip BOTH)
 *
 * Reopening the game = set both flags to false and publish.
 */
export const MAINTENANCE_MODE: boolean = false;

export const MAINTENANCE_MESSAGE =
  "Cloaket is temporarily down due to some issues. We're getting them fixed and will have the game back up as fast as possible. Your blooks and progress are safe.";
