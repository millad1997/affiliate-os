// src/lib/brand-config-input-parse.check.ts
// Standalone assertion script for parseBrandConfigFields.
// Pure: no react-server, no env, no DB.
// Run: npx tsx src/lib/brand-config-input-parse.check.ts

import { parseBrandConfigFields } from "./brand-config-input-parse";

let passed = 0;
let failures = 0;

function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); passed++; }
  else { console.error(`FAIL  ${name}`); failures++; throw new Error(`Assertion failed: ${name}`); }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// 1 — Full valid body, comma-string inputs for the array fields.
const r1 = parseBrandConfigFields({
  target_category_ids: "60001, 60002",
  target_regions: "US",
  min_followers: 1000,
  gate_region: true,
  gate_followers: false,
  gate_category: false,
  max_invites: 50,
  commission_rate: 15,
  min_gmv_floor: 2000,
});
check("1: ok === true", r1.ok === true);
check("1: target_category_ids deep-equals [\"60001\",\"60002\"]",
  r1.ok && deepEqual(r1.fields.target_category_ids, ["60001", "60002"]));
check("1: target_regions deep-equals [\"US\"]",
  r1.ok && deepEqual(r1.fields.target_regions, ["US"]));
check("1: min_followers === 1000", r1.ok && r1.fields.min_followers === 1000);
check("1: gate_region === true", r1.ok && r1.fields.gate_region === true);
check("1: gate_followers === false", r1.ok && r1.fields.gate_followers === false);
check("1: gate_category === false", r1.ok && r1.fields.gate_category === false);
check("1: max_invites === 50", r1.ok && r1.fields.max_invites === 50);
check("1: commission_rate === 15", r1.ok && r1.fields.commission_rate === 15);
check("1: min_gmv_floor === 2000", r1.ok && r1.fields.min_gmv_floor === 2000);

// 2 — Same fields as arrays of strings instead of comma-strings.
const r2 = parseBrandConfigFields({
  target_category_ids: ["60001", "60002"],
  target_regions: ["US", "CA"],
  min_followers: 1000,
  gate_region: true,
  gate_followers: false,
  gate_category: false,
  max_invites: 50,
  commission_rate: 15,
  min_gmv_floor: 2000,
});
check("2: ok === true", r2.ok === true);
check("2: target_category_ids parsed identically to comma-string variant",
  r2.ok && deepEqual(r2.fields.target_category_ids, ["60001", "60002"]));
check("2: target_regions parsed identically to comma-string variant",
  r2.ok && deepEqual(r2.fields.target_regions, ["US", "CA"]));

// 3 — All optional fields absent (empty body {}).
const r3 = parseBrandConfigFields({});
check("3: ok === true", r3.ok === true);
check("3: target_category_ids === []", r3.ok && deepEqual(r3.fields.target_category_ids, []));
check("3: target_regions === []", r3.ok && deepEqual(r3.fields.target_regions, []));
check("3: min_followers === null", r3.ok && r3.fields.min_followers === null);
check("3: gate_region defaults to true", r3.ok && r3.fields.gate_region === true);
check("3: gate_followers defaults to false", r3.ok && r3.fields.gate_followers === false);
check("3: gate_category defaults to false", r3.ok && r3.fields.gate_category === false);
check("3: max_invites defaults to 50", r3.ok && r3.fields.max_invites === 50);
check("3: commission_rate defaults to 10", r3.ok && r3.fields.commission_rate === 10);
check("3: min_gmv_floor === null", r3.ok && r3.fields.min_gmv_floor === null);

// 4 — Comma-string with interior spaces and trailing/double commas — empties dropped.
const r4 = parseBrandConfigFields({ target_category_ids: "60001, , 60002 ," });
check("4: ok === true", r4.ok === true);
check("4: target_category_ids drops empties -> [\"60001\",\"60002\"]",
  r4.ok && deepEqual(r4.fields.target_category_ids, ["60001", "60002"]));

// 5 — min_followers non-numeric string -> validation error.
const r5 = parseBrandConfigFields({ min_followers: "abc" });
check("5: ok === false", r5.ok === false);
check("5: error mentions min_followers",
  !r5.ok && r5.error.includes("min_followers"));

// 6 — min_followers negative integer -> validation error.
const r6 = parseBrandConfigFields({ min_followers: -5 });
check("6: ok === false", r6.ok === false);
check("6: error mentions min_followers",
  !r6.ok && r6.error.includes("min_followers"));

// 7 — commission_rate negative -> validation error.
const r7 = parseBrandConfigFields({ commission_rate: -1 });
check("7: ok === false", r7.ok === false);
check("7: error mentions commission_rate",
  !r7.ok && r7.error.includes("commission_rate"));

// 8 — Explicit gate_region:false overrides the DEFAULT_GATES.region default of true.
const r8 = parseBrandConfigFields({ gate_region: false });
check("8: ok === true", r8.ok === true);
check("8: gate_region === false (real boolean overrides default)",
  r8.ok && r8.fields.gate_region === false);

// 9 — Numeric string for max_invites, empty string for min_gmv_floor and commission_rate.
const r9 = parseBrandConfigFields({ max_invites: "25", min_gmv_floor: "", commission_rate: "" });
check("9: ok === true", r9.ok === true);
check("9: max_invites coerced from string \"25\" -> 25",
  r9.ok && r9.fields.max_invites === 25);
check("9: min_gmv_floor \"\" -> null",
  r9.ok && r9.fields.min_gmv_floor === null);
check("9: commission_rate \"\" -> 10",
  r9.ok && r9.fields.commission_rate === 10);

console.log(`\n(${passed} passed, ${failures} failed)`);
