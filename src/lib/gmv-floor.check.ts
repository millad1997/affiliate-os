// src/lib/gmv-floor.check.ts
// Positive-control fixtures for applyGmvFloor — the late, GMV-presence-conditional floor.
// Covers: precise above/at/below the bar, range scored on midpoint above/below, and the
// key rule — a creator with NO GMV is never dropped on GMV grounds.
// Run: npx tsx src/lib/gmv-floor.check.ts
import { applyGmvFloor, type GmvFloorConfig } from "./gmv-floor";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); }
  else { console.error(`FAIL  ${name}`); failures++; }
}

const cfg: GmvFloorConfig = { minGmvFloor: 5000 };

// 1 — precise GMV above the floor -> pass.
const r1 = applyGmvFloor(cfg, { gmvLast30d: 8000, gmvSource: "precise", gmvRange: null });
check("1: pass", r1.pass === true);
check("1: above_floor", r1.reason === "above_floor");
check("1: effectiveGmv 8000", r1.effectiveGmv === 8000);

// 2 — precise GMV below the floor -> drop.
const r2 = applyGmvFloor(cfg, { gmvLast30d: 3000, gmvSource: "precise", gmvRange: null });
check("2: dropped", r2.pass === false);
check("2: below_floor", r2.reason === "below_floor");
check("2: effectiveGmv 3000", r2.effectiveGmv === 3000);

// 3 — precise GMV exactly at the floor -> pass (inclusive).
const r3 = applyGmvFloor(cfg, { gmvLast30d: 5000, gmvSource: "precise", gmvRange: null });
check("3: pass at floor", r3.pass === true && r3.reason === "above_floor");

// 4 — range GMV, midpoint (8000) above floor -> pass.
const r4 = applyGmvFloor(cfg, { gmvLast30d: null, gmvSource: "range", gmvRange: { min: 4000, max: 12000 } });
check("4: pass", r4.pass === true);
check("4: above_floor", r4.reason === "above_floor");
check("4: effectiveGmv midpoint 8000", r4.effectiveGmv === 8000);

// 5 — range GMV, midpoint (4000) below floor -> drop.
const r5 = applyGmvFloor(cfg, { gmvLast30d: null, gmvSource: "range", gmvRange: { min: 2000, max: 6000 } });
check("5: dropped", r5.pass === false);
check("5: below_floor", r5.reason === "below_floor");
check("5: effectiveGmv midpoint 4000", r5.effectiveGmv === 4000);

// 6 — no GMV -> NEVER dropped on GMV grounds (the founder rule).
const r6 = applyGmvFloor(cfg, { gmvLast30d: null, gmvSource: "none", gmvRange: null });
check("6: pass", r6.pass === true);
check("6: no_gmv_no_floor", r6.reason === "no_gmv_no_floor");
check("6: effectiveGmv null", r6.effectiveGmv === null);

if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nAll gmv-floor checks passed.");
