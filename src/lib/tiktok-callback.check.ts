import { verifyState } from "./tiktok-callback";

let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}`);
  }
}

// ── Positive controls ────────────────────────────────────────────────────────
check("exact match -> true", verifyState("abc123def", "abc123def") === true);
check("same length, one char differs -> false", verifyState("abc123def", "abc123deg") === false);
check("different length -> false", verifyState("abc12", "abc123def") === false);
check("missing cookie (undefined) -> false", verifyState(undefined, "abc123def") === false);
check("missing query (undefined) -> false", verifyState("abc123def", undefined) === false);
check("null cookie -> false", verifyState(null, "abc") === false);
check("both empty strings -> false", verifyState("", "") === false);

// ── Realistic state value ────────────────────────────────────────────────────
const s = "OKm7vfQTcdWdVQh6fMbp3pv60jhEI1S2bLOFZYBYquY";
const sChanged = s.slice(0, -1) + (s.endsWith("Y") ? "Z" : "Y"); // flip the last char
check("realistic state self-match -> true", verifyState(s, s) === true);
check("realistic state last char changed -> false", verifyState(s, sChanged) === false);

if (failed > 0) {
  process.exit(1);
}
