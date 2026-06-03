// src/lib/brand-config.check.ts
// Standalone assertion script for brandConfigToPipelineConfigs and DEFAULT_GATES.
// Pure: no react-server, no env, no DB.
// Run: npx tsx src/lib/brand-config.check.ts

import { brandConfigToPipelineConfigs, DEFAULT_GATES, type BrandConfigInput } from "./brand-config";

let passed = 0;
let failures = 0;

function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); passed++; }
  else { console.error(`FAIL  ${name}`); failures++; throw new Error(`Assertion failed: ${name}`); }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// 1 — Full config WITH floor, default gates.
const input1: BrandConfigInput = {
  targetCategoryIds: ["60001", "60002"],
  targetRegions: ["US"],
  minFollowers: 1000,
  gateRegion: true,
  gateFollowers: false,
  gateCategory: false,
  maxInvites: 50,
  commissionRate: 15,
  minGmvFloor: 2000,
};
const r1 = brandConfigToPipelineConfigs(input1);
check("1: fitConfig.gates deep-equals {region:true,followers:false,category:false}",
  deepEqual(r1.fitConfig.gates, { region: true, followers: false, category: false }));
check("1: fitConfig.targetCategoryIds deep-equals [\"60001\",\"60002\"]",
  deepEqual(r1.fitConfig.targetCategoryIds, ["60001", "60002"]));
check("1: fitConfig.targetRegions deep-equals [\"US\"]",
  deepEqual(r1.fitConfig.targetRegions, ["US"]));
check("1: fitConfig.minFollowers === 1000",
  r1.fitConfig.minFollowers === 1000);
check("1: policy deep-equals {maxInvites:50,commissionRate:15}",
  deepEqual(r1.policy, { maxInvites: 50, commissionRate: 15 }));
check("1: gmvFloorConfig deep-equals {minGmvFloor:2000}",
  deepEqual(r1.gmvFloorConfig, { minGmvFloor: 2000 }));

// 2 — No floor: gmvFloorConfig must be undefined.
const input2: BrandConfigInput = { ...input1, minGmvFloor: null };
const r2 = brandConfigToPipelineConfigs(input2);
check("2: gmvFloorConfig === undefined", r2.gmvFloorConfig === undefined);

// 3 — minFollowers null passes through to fitConfig.minFollowers.
const input3: BrandConfigInput = { ...input1, minFollowers: null };
const r3 = brandConfigToPipelineConfigs(input3);
check("3: fitConfig.minFollowers === null", r3.fitConfig.minFollowers === null);

// 4 — Non-default gates read from stored flags (proves DEFAULT_GATES is not forced).
const input4: BrandConfigInput = {
  ...input1,
  gateRegion: true,
  gateFollowers: true,
  gateCategory: true,
};
const r4 = brandConfigToPipelineConfigs(input4);
check("4: fitConfig.gates deep-equals {region:true,followers:true,category:true}",
  deepEqual(r4.fitConfig.gates, { region: true, followers: true, category: true }));

// 5 — DEFAULT_GATES constant deep-equals {region:true,followers:false,category:false}.
check("5: DEFAULT_GATES deep-equals {region:true,followers:false,category:false}",
  deepEqual(DEFAULT_GATES, { region: true, followers: false, category: false }));

// 6 — Arrays pass through unchanged for both targetCategoryIds and targetRegions.
const input6: BrandConfigInput = {
  ...input1,
  targetCategoryIds: ["A", "B", "C"],
  targetRegions: ["US", "CA", "GB"],
};
const r6 = brandConfigToPipelineConfigs(input6);
check("6: targetCategoryIds pass through unchanged",
  JSON.stringify(r6.fitConfig.targetCategoryIds) === JSON.stringify(["A", "B", "C"]));
check("6: targetRegions pass through unchanged",
  JSON.stringify(r6.fitConfig.targetRegions) === JSON.stringify(["US", "CA", "GB"]));

console.log(`\n(${passed} passed, ${failures} failed)`);
