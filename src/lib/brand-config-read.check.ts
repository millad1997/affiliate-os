// src/lib/brand-config-read.check.ts
// Standalone assertion script for getBrandConfig's row coercion + result mapping.
// Every scenario injects a stub FetchBrandRow, so the real Supabase read is NEVER run.
// This module imports server-only, so it must run under the react-server condition:
//   npx tsx --conditions=react-server --env-file=.env.local src/lib/brand-config-read.check.ts

import { getBrandConfig, type BrandConfigRow, type FetchBrandRow } from "./brand-config-read";

let passed = 0;
let failures = 0;

function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); passed++; }
  else { console.error(`FAIL  ${name}`); failures++; throw new Error(`Assertion failed: ${name}`); }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Realistic-but-synthetic base row. Numeric columns overridden per-scenario.
const baseRow: BrandConfigRow = {
  target_category_ids: ["60001"],
  target_regions: ["US"],
  min_followers: 1000,
  gate_region: true,
  gate_followers: false,
  gate_category: false,
  max_invites: 50,
  commission_rate: "10",
  min_gmv_floor: "2000",
};

function stubRow(row: BrandConfigRow): FetchBrandRow {
  return async () => ({ ok: true, row });
}

async function runChecks(): Promise<void> {
  // 1 — Numerics as STRINGS (PostgREST default).
  const r1 = await getBrandConfig("brand-1", "user-1", stubRow({
    ...baseRow,
    commission_rate: "10",
    min_gmv_floor: "2000",
  }));
  check("1: ok === true", r1.ok === true);
  if (r1.ok) {
    check("1: commissionRate === 10 (number)",
      r1.configs.policy.commissionRate === 10 && typeof r1.configs.policy.commissionRate === "number");
    check("1: gmvFloorConfig deep-equals {minGmvFloor:2000}",
      deepEqual(r1.configs.gmvFloorConfig, { minGmvFloor: 2000 }));
    check("1: fitConfig.gates deep-equals {region:true,followers:false,category:false}",
      deepEqual(r1.configs.fitConfig.gates, { region: true, followers: false, category: false }));
  }

  // 2 — Numerics as NUMBERS (other PostgREST shape).
  const r2 = await getBrandConfig("brand-1", "user-1", stubRow({
    ...baseRow,
    commission_rate: 10,
    min_gmv_floor: 2000,
  }));
  check("2: ok === true", r2.ok === true);
  if (r2.ok) {
    check("2: commissionRate === 10 (number)",
      r2.configs.policy.commissionRate === 10 && typeof r2.configs.policy.commissionRate === "number");
    check("2: gmvFloorConfig deep-equals {minGmvFloor:2000}",
      deepEqual(r2.configs.gmvFloorConfig, { minGmvFloor: 2000 }));
    check("2: fitConfig.gates deep-equals {region:true,followers:false,category:false}",
      deepEqual(r2.configs.fitConfig.gates, { region: true, followers: false, category: false }));
  }

  // 3 — min_gmv_floor null => no floor.
  const r3 = await getBrandConfig("brand-1", "user-1", stubRow({
    ...baseRow,
    min_gmv_floor: null,
  }));
  check("3: ok === true", r3.ok === true);
  if (r3.ok) {
    check("3: gmvFloorConfig === undefined", r3.configs.gmvFloorConfig === undefined);
  }

  // 4 — not_found: stub returns a null row.
  const r4 = await getBrandConfig("brand-1", "user-1", async () => ({ ok: true, row: null }));
  check("4: ok === false", r4.ok === false);
  check("4: reason === not_found", r4.ok === false && r4.reason === "not_found");

  // 5 — query_failed: stub reports failure.
  const r5 = await getBrandConfig("brand-1", "user-1", async () => ({ ok: false }));
  check("5: ok === false", r5.ok === false);
  check("5: reason === query_failed", r5.ok === false && r5.reason === "query_failed");

  // 6 — malformed numeric: commission_rate cannot be coerced.
  const r6 = await getBrandConfig("brand-1", "user-1", stubRow({
    ...baseRow,
    commission_rate: "not-a-number",
  }));
  check("6: ok === false", r6.ok === false);
  check("6: reason === malformed", r6.ok === false && r6.reason === "malformed");
}

runChecks()
  .then(() => {
    console.log(`\n(${passed} passed, ${failures} failed)`);
    if (failures > 0) process.exit(1);
  })
  .catch((err) => {
    console.error(`\n(${passed} passed, ${failures} failed)`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
