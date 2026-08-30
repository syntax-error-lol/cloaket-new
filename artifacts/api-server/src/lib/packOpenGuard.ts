// Server-side protection against auto-opener scripts (bots that spam the
// pack-open endpoint with parallel fetch() calls from the browser console).
//
// The real game UI can only ever have ONE open in flight per player (the
// button is disabled while the request runs) and there's a reveal animation
// between opens, so a legit player realistically tops out well under
// 30 opens/minute. Auto-openers run 4-16 parallel workers and blow way past
// both limits immediately.
//
// Guard layers (all in-memory, per server instance):
// 1. Concurrency: only one pack open in flight per player. A second request
//    while one is running is an instant violation (impossible from the UI).
// 2. Rate: sliding 60s window, max OPENS_PER_MINUTE opens.
// 3. Strikes: violations add strikes; enough strikes within STRIKE_WINDOW_MS
//    puts the player in a pack-opening timeout for BLOCK_MS.

// The UI's reveal animation can be click-skipped, so a very fast legit player
// could approach ~60 opens/min. Keep the cap at that ceiling — parallel bot
// workers blow past it (and trip the concurrency guard) immediately.
const OPENS_PER_MINUTE = 60;
const WINDOW_MS = 60_000;
const STRIKES_TO_BLOCK = 5;
const STRIKE_WINDOW_MS = 10 * 60_000;
const BLOCK_MS = 15 * 60_000;
const MAX_TRACKED_PLAYERS = 5_000;

type PlayerState = {
  inFlight: boolean;
  openTimes: number[]; // timestamps of recent opens (sliding window)
  strikes: number[]; // timestamps of recent violations
  blockedUntil: number;
  lastTouched: number;
};

const players = new Map<number, PlayerState>();

function getState(playerId: number): PlayerState {
  let s = players.get(playerId);
  if (!s) {
    // Crude memory cap: drop the stalest entries if the map grows too big.
    if (players.size >= MAX_TRACKED_PLAYERS) {
      const now = Date.now();
      const cutoff = now - STRIKE_WINDOW_MS;
      for (const [id, st] of players) {
        // Never evict a player whose block is still active or who is mid-open.
        if (st.lastTouched < cutoff && !st.inFlight && st.blockedUntil <= now) {
          players.delete(id);
        }
      }
    }
    s = { inFlight: false, openTimes: [], strikes: [], blockedUntil: 0, lastTouched: 0 };
    players.set(playerId, s);
  }
  s.lastTouched = Date.now();
  return s;
}

function addStrike(s: PlayerState, now: number): void {
  s.strikes = s.strikes.filter((t) => now - t < STRIKE_WINDOW_MS);
  s.strikes.push(now);
  if (s.strikes.length >= STRIKES_TO_BLOCK) {
    s.blockedUntil = now + BLOCK_MS;
    s.strikes = [];
  }
}

export type GuardResult =
  | { ok: true }
  | { ok: false; status: number; message: string; reason: "blocked" | "concurrent" | "too_fast" };

/**
 * Call before opening a pack. If it returns ok, you MUST call
 * releasePackOpen(playerId) when the open finishes (success or failure).
 */
export function checkPackOpen(playerId: number): GuardResult {
  const now = Date.now();
  const s = getState(playerId);

  if (s.blockedUntil > now) {
    const mins = Math.ceil((s.blockedUntil - now) / 60_000);
    return {
      ok: false,
      status: 429,
      reason: "blocked",
      message: `Auto-openers aren't allowed. Pack opening is paused for ${mins} more minute${mins === 1 ? "" : "s"}.`,
    };
  }

  if (s.inFlight) {
    // Impossible from the real UI — a second request while one is running
    // means a script is firing parallel opens.
    addStrike(s, now);
    return {
      ok: false,
      status: 429,
      reason: "concurrent",
      message: "One pack at a time!",
    };
  }

  s.openTimes = s.openTimes.filter((t) => now - t < WINDOW_MS);
  if (s.openTimes.length >= OPENS_PER_MINUTE) {
    addStrike(s, now);
    return {
      ok: false,
      status: 429,
      reason: "too_fast",
      message: "Whoa, slow down! You're opening packs too fast.",
    };
  }

  s.inFlight = true;
  s.openTimes.push(now);
  return { ok: true };
}

export function releasePackOpen(playerId: number): void {
  const s = players.get(playerId);
  if (s) s.inFlight = false;
}
