// src/lib/fit-score.check.ts
// Positive-control fixtures for computeFit — the brand-configurable profile-fit scorer.
// Covers: each hard-gate rejection (region, followers incl. null fail-closed, category),
// all-soft scoring, soft misses, gated-signal renormalization, the all-gated -> 100 case,
// and follower-curve interpolation.
// Run: npx tsx src/lib/fit-score.check.ts
import { computeFit, type BrandFitConfig } from "./fit-score";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); }
  else { console.error(`FAIL  ${name}`); failures++; }
}

// 1 — region hard gate rejects an out-of-region creator.
const cfgRegionGate: BrandFitConfig = {
  targetCategoryIds: ["100"], targetRegions: ["US"], minFollowers: null,
  gates: { region: true, followers: false, category: false },
};
const r1 = computeFit(cfgRegionGate, { categoryIds: ["100"], selectionRegion: "GB", followerCount: 80000 });
check("1: rejected", r1.ok === false);
if (!r1.ok) check("1: rejectedBy region", r1.rejectedBy === "region");

// 2 — followers hard gate rejects below threshold.
const cfgFollowerGate: BrandFitConfig = {
  targetCategoryIds: ["100"], targetRegions: ["US"], minFollowers: 50000,
  gates: { region: false, followers: true, category: false },
};
const r2 = computeFit(cfgFollowerGate, { categoryIds: ["100"], selectionRegion: "US", followerCount: 30000 });
check("2: rejected", r2.ok === false);
if (!r2.ok) check("2: rejectedBy followers", r2.rejectedBy === "followers");

// 2b — followers hard gate fails closed on unknown follower count.
const r2b = computeFit(cfgFollowerGate, { categoryIds: ["100"], selectionRegion: "US", followerCount: null });
check("2b: rejected (null followers)", r2b.ok === false);
if (!r2b.ok) check("2b: rejectedBy followers", r2b.rejectedBy === "followers");

// 3 — category hard gate rejects no-overlap.
const cfgCategoryGate: BrandFitConfig = {
  targetCategoryIds: ["100", "200"], targetRegions: ["US"], minFollowers: null,
  gates: { region: false, followers: false, category: true },
};
const r3 = computeFit(cfgCategoryGate, { categoryIds: ["999"], selectionRegion: "US", followerCount: 60000 });
check("3: rejected", r3.ok === false);
if (!r3.ok) check("3: rejectedBy category", r3.rejectedBy === "category");

// 4 — all soft, perfect match: 0.40*100 + 0.40*100 + 0.20*70 = 94.
const cfgAllSoft: BrandFitConfig = {
  targetCategoryIds: ["100"], targetRegions: ["US"], minFollowers: null,
  gates: { region: false, followers: false, category: false },
};
const r4 = computeFit(cfgAllSoft, { categoryIds: ["100"], selectionRegion: "US", followerCount: 50000 });
check("4: ok", r4.ok === true);
if (r4.ok) {
  check("4: fit 94", r4.fitSubScore === 94);
  check("4: category 100", r4.components.category === 100);
  check("4: region 100", r4.components.region === 100);
  check("4: followers 70", r4.components.followers === 70);
}

// 5 — all soft, region miss (soft, not rejected): 0.40*100 + 0.40*0 + 0.20*70 = 54.
const r5 = computeFit(cfgAllSoft, { categoryIds: ["100"], selectionRegion: "GB", followerCount: 50000 });
check("5: ok", r5.ok === true);
if (r5.ok) {
  check("5: fit 54", r5.fitSubScore === 54);
  check("5: region 0", r5.components.region === 0);
}

// 6 — region gated (survivor in-region), category+followers soft, renormalized over 0.60:
//     (100*0.40 + 40*0.20)/0.60 = 48/0.60 = 80.
const cfgRegionGatedSoftRest: BrandFitConfig = {
  targetCategoryIds: ["100"], targetRegions: ["US"], minFollowers: null,
  gates: { region: true, followers: false, category: false },
};
const r6 = computeFit(cfgRegionGatedSoftRest, { categoryIds: ["100"], selectionRegion: "US", followerCount: 10000 });
check("6: ok", r6.ok === true);
if (r6.ok) {
  check("6: fit 80 (renormalized)", r6.fitSubScore === 80);
  check("6: region dropped (null)", r6.components.region === null);
  check("6: category 100", r6.components.category === 100);
}

// 7 — all three gated and passed -> no soft signals -> perfect structural match, fit 100.
const cfgAllGated: BrandFitConfig = {
  targetCategoryIds: ["100"], targetRegions: ["US"], minFollowers: 50000,
  gates: { region: true, followers: true, category: true },
};
const r7 = computeFit(cfgAllGated, { categoryIds: ["100"], selectionRegion: "US", followerCount: 80000 });
check("7: ok", r7.ok === true);
if (r7.ok) {
  check("7: fit 100", r7.fitSubScore === 100);
  check("7: all components null", r7.components.category === null && r7.components.region === null && r7.components.followers === null);
}

// 8 — follower-curve interpolation, isolated (region+category gated): 30000 -> 55.
const cfgFollowersOnlySoft: BrandFitConfig = {
  targetCategoryIds: ["100"], targetRegions: ["US"], minFollowers: null,
  gates: { region: true, followers: false, category: true },
};
const r8 = computeFit(cfgFollowersOnlySoft, { categoryIds: ["100"], selectionRegion: "US", followerCount: 30000 });
check("8: ok", r8.ok === true);
if (r8.ok) {
  check("8: fit 55 (follower interp)", r8.fitSubScore === 55);
  check("8: followers 55", r8.components.followers === 55);
}

// 9 — all soft, category miss: 0.40*0 + 0.40*100 + 0.20*70 = 54.
const r9 = computeFit(cfgAllSoft, { categoryIds: ["999"], selectionRegion: "US", followerCount: 50000 });
check("9: ok", r9.ok === true);
if (r9.ok) {
  check("9: fit 54", r9.fitSubScore === 54);
  check("9: category 0", r9.components.category === 0);
}

if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nAll fit-score checks passed.");
