// src/lib/outreach-plan.check.ts
// Positive-control fixtures for buildOutreachPlan — the V1 outreach decision engine.
// Proves: only ok:true (scored) entries are eligible (fit/parse rejects excluded); eligible
// are ranked by composite descending; the top `maxInvites` are selected and the rest tallied
// as capped-out; the flat commissionRate is passed through; and each invite carries the
// effectiveGmv derived by deriveEffectiveGmv (precise -> value, range -> midpoint, none ->
// null) — which doubles as direct coverage of that now-public helper. Stable order on ties.
// Run: npx tsx src/lib/outreach-plan.check.ts
import {
  buildOutreachPlan,
  type ScoredEntry,
  type OutreachPolicyConfig,
} from "./outreach-plan";
import type { TransformedCreatorMetrics } from "./tiktok-transform";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); }
  else { console.error(`FAIL  ${name}`); failures++; }
}

// Minimal valid metrics; only the GMV trio matters to the engine (via deriveEffectiveGmv).
function metricsWith(gmv: Partial<TransformedCreatorMetrics>): TransformedCreatorMetrics {
  return {
    gmvLast30d: null,
    totalGmv: null,
    avgPostsPerWeek12w: null,
    postsLast30d: null,
    likesLast30d: null,
    commentsLast30d: null,
    viewsLast30d: null,
    gmvRange: null,
    gmvSource: "none",
    ...gmv,
  };
}

function okEntry(creatorOpenId: string, composite: number, metrics: TransformedCreatorMetrics): ScoredEntry {
  return {
    creatorOpenId,
    result: {
      ok: true,
      fitSubScore: 100,
      metrics,
      score: { composite, performanceSubScore: 50, fitSubScore: 100, scoreBasis: "composite" },
    },
  };
}

// Three eligible creators: distinct composites, varied GMV sources.
const A = okEntry("A", 80, metricsWith({ gmvLast30d: 5000, gmvSource: "precise" }));                  // effGmv 5000
const B = okEntry("B", 73, metricsWith({ gmvRange: { min: 2000, max: 6000 }, gmvSource: "range" }));  // effGmv 4000
const C = okEntry("C", 60, metricsWith({}));                                                          // effGmv null (none)

// Two non-ok entries that must be excluded from eligibility.
const fitReject: ScoredEntry = { creatorOpenId: "D", result: { ok: false, stage: "fit", rejectedBy: "region" } };
const parseReject: ScoredEntry = { creatorOpenId: "E", result: { ok: false, stage: "parse", code: 99999, message: "boom" } };

function main() {
  // 1 — mixed/unsorted input, cap 2: D/E excluded; A,B,C eligible; top 2 (A,B) selected, C capped.
  const cfg1: OutreachPolicyConfig = { maxInvites: 2, commissionRate: 15 };
  const plan1 = buildOutreachPlan(cfg1, [C, fitReject, A, parseReject, B]);
  check("1: eligibleCount 3 (rejects excluded)", plan1.eligibleCount === 3);
  check("1: selectedCount 2", plan1.selectedCount === 2);
  check("1: cappedOutCount 1", plan1.cappedOutCount === 1);
  check("1: invites length 2", plan1.invites.length === 2);
  check("1: ranked desc — A first", plan1.invites[0].creatorOpenId === "A");
  check("1: invites[0].composite 80", plan1.invites[0].composite === 80);
  check("1: order holds (80 >= 73)", plan1.invites[0].composite >= plan1.invites[1].composite);
  check("1: B second", plan1.invites[1].creatorOpenId === "B");
  check("1: commission passed through (15)", plan1.invites[0].commissionRate === 15 && plan1.invites[1].commissionRate === 15);
  check("1: effGmv precise 5000 (A)", plan1.invites[0].effectiveGmv === 5000);
  check("1: effGmv range midpoint 4000 (B)", plan1.invites[1].effectiveGmv === 4000);

  // 2 — cap exceeds eligible: all selected, none capped; C's 'none' GMV -> effGmv null.
  const cfg2: OutreachPolicyConfig = { maxInvites: 10, commissionRate: 20 };
  const plan2 = buildOutreachPlan(cfg2, [A, B, C]);
  check("2: selectedCount 3", plan2.selectedCount === 3);
  check("2: cappedOutCount 0", plan2.cappedOutCount === 0);
  check("2: C is last (composite 60)", plan2.invites[2].creatorOpenId === "C");
  check("2: effGmv none -> null (C)", plan2.invites[2].effectiveGmv === null);
  check("2: commission passed through (20)", plan2.invites[2].commissionRate === 20);

  // 3 — cap 0: nothing selected, all eligible capped out.
  const cfg3: OutreachPolicyConfig = { maxInvites: 0, commissionRate: 15 };
  const plan3 = buildOutreachPlan(cfg3, [A, B, C]);
  check("3: invites length 0", plan3.invites.length === 0);
  check("3: selectedCount 0", plan3.selectedCount === 0);
  check("3: cappedOutCount 3", plan3.cappedOutCount === 3);
  check("3: eligibleCount 3", plan3.eligibleCount === 3);

  // 4 — empty input: all zeros.
  const cfg4: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };
  const plan4 = buildOutreachPlan(cfg4, []);
  check("4: eligibleCount 0", plan4.eligibleCount === 0);
  check("4: invites length 0", plan4.invites.length === 0);
  check("4: cappedOutCount 0", plan4.cappedOutCount === 0);

  // 5 — only rejects: nothing eligible.
  const plan5 = buildOutreachPlan(cfg4, [fitReject, parseReject]);
  check("5: eligibleCount 0 (only rejects)", plan5.eligibleCount === 0);
  check("5: selectedCount 0", plan5.selectedCount === 0);

  // 6 — tie on composite: stable order preserves input order (no V1 tiebreak).
  const tieX = okEntry("tieX", 70, metricsWith({ gmvLast30d: 1000, gmvSource: "precise" }));
  const tieY = okEntry("tieY", 70, metricsWith({ gmvLast30d: 9000, gmvSource: "precise" }));
  const cfg6: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };
  const plan6 = buildOutreachPlan(cfg6, [tieX, tieY]);
  check("6: tie — tieX first (stable input order)", plan6.invites[0].creatorOpenId === "tieX");
  check("6: tie — tieY second", plan6.invites[1].creatorOpenId === "tieY");

  if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
  console.log("\nAll outreach-plan checks passed.");
}

main();
