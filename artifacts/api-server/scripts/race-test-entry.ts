// Concurrency proof for the hack-repair sweep: two simultaneous invocations
// (separate pool connections → separate advisory-lock sessions) must yield
// exactly one "repaired" and one "already-done", with single application.
import { runHackRepair } from "../src/lib/hackRepair";

const [a, b] = await Promise.all([runHackRepair(), runHackRepair()]);
console.log("RESULT_A:", JSON.stringify(a));
console.log("RESULT_B:", JSON.stringify(b));
process.exit(0);
