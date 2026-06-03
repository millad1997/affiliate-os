// src/lib/composite-score.check.ts
// Positive-control fixtures for computeComposite — the scoring engine had no check file.
// Covers: fit-only (no perf data), full precise weighting, the video-only downstream
// proof (the a26e413 transform fix raises the composite), range path + penalty, the
// zero-posts consistency penalty, the no-views engagement branch, piecewise
// interpolation, and anchor clamping.
// Run: npx tsx src/lib/composite-score.check.ts
import { computeComposite, type CompositeScoreArgs } from "./composite-score";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); }
  else { console.error(`FAIL  ${name}`); failures++; }
}

// 1 — fit-only: no precise GMV and no range -> fit minus NO_PERF_DATA_PENALTY (12).
const fitOnly: CompositeScoreArgs = {
  fitSubScore: 70, gmvLast30d: null, gmvSource: "none", gmvRange: null,
  totalGmv: null, avgPostsPerWeek12w: null, postsLast30d: null,
  likesLast30d: null, commentsLast30d: null, viewsLast30d: null,
};
const r1 = computeComposite(fitOnly);
check("1: fit-only composite = fit - 12", r1.composite === 58);
check("1: fit-only perf is null", r1.performanceSubScore === null);
check("1: fit-only basis", r1.scoreBasis === "fit_only_no_perf_data");

// 2 — precise, all three live components active, weights sum to 1.0.
const full: CompositeScoreArgs = {
  fitSubScore: 80, gmvLast30d: 10000, gmvSource: "precise", gmvRange: null,
  totalGmv: 50000, avgPostsPerWeek12w: 7, postsLast30d: 30,
  likesLast30d: 8000, commentsLast30d: 2000, viewsLast30d: 200000,
};
const r2 = computeComposite(full);
check("2: full perf = 71", r2.performanceSubScore === 71);
check("2: full composite = 75", r2.composite === 75);
check("2: full basis", r2.scoreBasis === "composite");

// 3 — video-only downstream proof: post-fix (comp3+comp4 present) vs pre-fix (nulled).
//     Same precise GMV (5000) and fit (60); only engagement/consistency differ.
const videoOnlyPostFix: CompositeScoreArgs = {
  fitSubScore: 60, gmvLast30d: 5000, gmvSource: "precise", gmvRange: null,
  totalGmv: null, avgPostsPerWeek12w: 10, postsLast30d: 43,
  likesLast30d: 9000, commentsLast30d: 1000, viewsLast30d: 200000,
};
const videoOnlyPreFix: CompositeScoreArgs = {
  fitSubScore: 60, gmvLast30d: 5000, gmvSource: "precise", gmvRange: null,
  totalGmv: null, avgPostsPerWeek12w: null, postsLast30d: null,
  likesLast30d: null, commentsLast30d: null, viewsLast30d: null,
};
const r3post = computeComposite(videoOnlyPostFix);
const r3pre = computeComposite(videoOnlyPreFix);
check("3: post-fix composite = 61", r3post.composite === 61);
check("3: pre-fix composite = 51", r3pre.composite === 51);
check("3: fix raises video-only composite", r3post.composite > r3pre.composite);

// 4 — range GMV: comp1 uses midpoint, composite takes RANGE_PENALTY (4), basis composite_range.
const range: CompositeScoreArgs = {
  fitSubScore: 50, gmvLast30d: null, gmvSource: "range", gmvRange: { min: 8000, max: 12000 },
  totalGmv: null, avgPostsPerWeek12w: null, postsLast30d: null,
  likesLast30d: null, commentsLast30d: null, viewsLast30d: null,
};
const r4 = computeComposite(range);
check("4: range perf = 65 (midpoint 10000)", r4.performanceSubScore === 65);
check("4: range composite = 55 (59 - 4)", r4.composite === 55);
check("4: range basis", r4.scoreBasis === "composite_range");

// 5 — zero-posts consistency penalty halves comp3. Paired: posts=0 vs posts>0, all else equal.
const zeroPosts: CompositeScoreArgs = {
  fitSubScore: 50, gmvLast30d: 1000, gmvSource: "precise", gmvRange: null,
  totalGmv: null, avgPostsPerWeek12w: 7, postsLast30d: 0,
  likesLast30d: null, commentsLast30d: null, viewsLast30d: null,
};
const somePosts: CompositeScoreArgs = { ...zeroPosts, postsLast30d: 5 };
const r5zero = computeComposite(zeroPosts);
const r5some = computeComposite(somePosts);
check("5: zero-posts perf = 19", r5zero.performanceSubScore === 19);
check("5: nonzero-posts perf = 31", r5some.performanceSubScore === 31);
check("5: zero-posts penalty lowers perf", (r5zero.performanceSubScore ?? 0) < (r5some.performanceSubScore ?? 0));
check("5: zero-posts composite = 31", r5zero.composite === 31);

// 6 — engagement with no views: comp4 = raw score only (no rate component).
const noViews: CompositeScoreArgs = {
  fitSubScore: 50, gmvLast30d: 5000, gmvSource: "precise", gmvRange: null,
  totalGmv: null, avgPostsPerWeek12w: null, postsLast30d: null,
  likesLast30d: 10000, commentsLast30d: null, viewsLast30d: null,
};
const r6 = computeComposite(noViews);
check("6: no-views perf = 50", r6.performanceSubScore === 50);
check("6: no-views composite = 50", r6.composite === 50);

// 7 — piecewise interpolation at a non-anchor GMV (7500 -> 55, between 5000/10000).
const interp: CompositeScoreArgs = {
  fitSubScore: 40, gmvLast30d: 7500, gmvSource: "precise", gmvRange: null,
  totalGmv: null, avgPostsPerWeek12w: null, postsLast30d: null,
  likesLast30d: null, commentsLast30d: null, viewsLast30d: null,
};
const r7 = computeComposite(interp);
check("7: interpolated perf = 55", r7.performanceSubScore === 55);
check("7: interpolated composite = 49", r7.composite === 49);

// 8 — GMV above the top anchor clamps comp1 to 100.
const clampTop: CompositeScoreArgs = {
  fitSubScore: 100, gmvLast30d: 50000, gmvSource: "precise", gmvRange: null,
  totalGmv: null, avgPostsPerWeek12w: null, postsLast30d: null,
  likesLast30d: null, commentsLast30d: null, viewsLast30d: null,
};
const r8 = computeComposite(clampTop);
check("8: clamp perf = 100", r8.performanceSubScore === 100);
check("8: clamp composite = 100", r8.composite === 100);

if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nAll composite-score checks passed.");
