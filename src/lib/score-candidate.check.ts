// src/lib/score-candidate.check.ts
// Positive-control fixtures for scoreCandidate — the gate-aware orchestrator wiring the
// cheap fit gate to the expensive detail-fetch + composite. Proves: a fit rejection
// short-circuits WITHOUT fetching detail; a survivor fetches once and scores end to end
// with the fit sub-score threaded in; a detail parse failure propagates as stage "parse".
// Also proves the optional post-score GMV floor: above-floor passes through (result
// undisturbed), below-floor drops as stage "gmv_floor" (detail still fetched — it is a
// post-score gate), and the floor never disturbs the fit/parse short-circuits.
// Run: npx tsx src/lib/score-candidate.check.ts
import { scoreCandidate, type FetchCreatorDetail } from "./score-candidate";
import type { BrandFitConfig } from "./fit-score";
import type { MarketplaceCandidate } from "./tiktok-marketplace-search-parse";
import type { GetCreatorApiResponse } from "./tiktok-marketplace-parse";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); }
  else { console.error(`FAIL  ${name}`); failures++; }
}

function makeCandidate(overrides: Partial<MarketplaceCandidate> = {}): MarketplaceCandidate {
  return {
    creatorOpenId: "open_c1",
    username: "creator",
    nickname: null,
    avatarUrl: null,
    selectionRegion: "US",
    categoryIds: ["100"],
    avgEcLiveUv: null,
    avgEcVideoViewCount: null,
    followerCount: 80000,
    gmv: null,
    ...overrides,
  };
}

function recordingFetch(calls: string[], resp: GetCreatorApiResponse): FetchCreatorDetail {
  return async (id: string) => { calls.push(id); return resp; };
}

// Reused detail: a video-only creator (gmv 5000 precise; likes 6000; comments 1000;
// views 100000; posts 20). Independently yields performanceSubScore 55.
const videoOnlyDetail: GetCreatorApiResponse = {
  code: 0,
  message: "ok",
  data: {
    creator: {
      username: "videocreator",
      bio_description: "fitness content",
      follower_count: 50000,
      gmv: { currency: "USD", amount: "5000" },
      ec_video_count: 20,
      avg_ec_video_like_count: 300,
      avg_ec_video_comment_count: 50,
      avg_ec_video_play_count: 5000,
    },
  },
};

// Region + followers are hard gates; category is soft.
const cfg: BrandFitConfig = {
  targetCategoryIds: ["100"], targetRegions: ["US"], minFollowers: 50000,
  gates: { region: true, followers: true, category: false },
};

async function main() {
  // 1 — fit rejects (out of region) -> stage "fit", and detail is NEVER fetched.
  const calls1: string[] = [];
  const cand1 = makeCandidate({ selectionRegion: "GB" });
  const res1 = await scoreCandidate({ config: cfg, candidate: cand1, fetchDetail: recordingFetch(calls1, videoOnlyDetail) });
  check("1: not ok", res1.ok === false);
  if (!res1.ok) check("1: stage fit", res1.stage === "fit");
  if (!res1.ok && res1.stage === "fit") check("1: rejectedBy region", res1.rejectedBy === "region");
  check("1: detail NOT fetched", calls1.length === 0);

  // 2 — survivor: fetched once, scored end to end, fit (100) threaded into the composite.
  //     category-only soft -> fit 100; perf 55; composite round(0.6*55 + 0.4*100) = 73.
  const calls2: string[] = [];
  const cand2 = makeCandidate({ creatorOpenId: "open_survivor", selectionRegion: "US", followerCount: 80000, categoryIds: ["100"] });
  const res2 = await scoreCandidate({ config: cfg, candidate: cand2, fetchDetail: recordingFetch(calls2, videoOnlyDetail) });
  check("2: ok", res2.ok === true);
  if (res2.ok) {
    check("2: fitSubScore 100", res2.fitSubScore === 100);
    check("2: gmv precise 5000", res2.metrics.gmvLast30d === 5000 && res2.metrics.gmvSource === "precise");
    check("2: perf 55", res2.score.performanceSubScore === 55);
    check("2: composite 73 (fit threaded in)", res2.score.composite === 73);
    check("2: basis composite", res2.score.scoreBasis === "composite");
  }
  check("2: detail fetched once", calls2.length === 1);
  check("2: fetched the candidate id", calls2[0] === "open_survivor");

  // 3 — survivor, but the detail call returns an API error -> stage "parse" propagates.
  const calls3: string[] = [];
  const cand3 = makeCandidate({ selectionRegion: "US", followerCount: 80000, categoryIds: ["100"] });
  const errorDetail: GetCreatorApiResponse = { code: 99999, message: "boom" };
  const res3 = await scoreCandidate({ config: cfg, candidate: cand3, fetchDetail: recordingFetch(calls3, errorDetail) });
  check("3: not ok", res3.ok === false);
  if (!res3.ok) check("3: stage parse", res3.stage === "parse");
  if (!res3.ok && res3.stage === "parse") {
    check("3: code 99999", res3.code === 99999);
    check("3: message boom", res3.message === "boom");
  }
  check("3: detail was fetched (survivor)", calls3.length === 1);

  // 4 — floor configured, precise GMV (5000) ABOVE floor (1000) -> passes through to
  //     success, scored result undisturbed (composite still 73). Detail fetched once.
  const calls4: string[] = [];
  const cand4 = makeCandidate({ creatorOpenId: "open_above", selectionRegion: "US", followerCount: 80000, categoryIds: ["100"] });
  const res4 = await scoreCandidate({ config: cfg, candidate: cand4, fetchDetail: recordingFetch(calls4, videoOnlyDetail), gmvFloorConfig: { minGmvFloor: 1000 } });
  check("4: ok (above floor)", res4.ok === true);
  if (res4.ok) {
    check("4: composite still 73", res4.score.composite === 73);
    check("4: gmv precise 5000", res4.metrics.gmvLast30d === 5000);
  }
  check("4: detail fetched once", calls4.length === 1);

  // 5 — floor configured, precise GMV (5000) BELOW floor (10000) -> dropped as stage
  //     "gmv_floor" with effectiveGmv 5000. Detail WAS fetched (floor is a POST-score gate).
  const calls5: string[] = [];
  const cand5 = makeCandidate({ creatorOpenId: "open_below", selectionRegion: "US", followerCount: 80000, categoryIds: ["100"] });
  const res5 = await scoreCandidate({ config: cfg, candidate: cand5, fetchDetail: recordingFetch(calls5, videoOnlyDetail), gmvFloorConfig: { minGmvFloor: 10000 } });
  check("5: not ok (below floor)", res5.ok === false);
  if (!res5.ok) check("5: stage gmv_floor", res5.stage === "gmv_floor");
  if (!res5.ok && res5.stage === "gmv_floor") check("5: effectiveGmv 5000", res5.effectiveGmv === 5000);
  check("5: detail WAS fetched (post-score gate)", calls5.length === 1);

  // 6 — floor configured but fit REJECTS (out of region): still stage "fit", detail NEVER
  //     fetched. The floor config does not disturb the cheap early gate / short-circuit.
  const calls6: string[] = [];
  const cand6 = makeCandidate({ selectionRegion: "GB" });
  const res6 = await scoreCandidate({ config: cfg, candidate: cand6, fetchDetail: recordingFetch(calls6, videoOnlyDetail), gmvFloorConfig: { minGmvFloor: 10000 } });
  check("6: not ok", res6.ok === false);
  if (!res6.ok) check("6: stage fit (floor not reached)", res6.stage === "fit");
  check("6: detail NOT fetched", calls6.length === 0);

  // 7 — floor configured but the detail call API-errors: still stage "parse"; the floor is
  //     never reached because scoring failed first.
  const calls7: string[] = [];
  const cand7 = makeCandidate({ selectionRegion: "US", followerCount: 80000, categoryIds: ["100"] });
  const errorDetail7: GetCreatorApiResponse = { code: 99999, message: "boom" };
  const res7 = await scoreCandidate({ config: cfg, candidate: cand7, fetchDetail: recordingFetch(calls7, errorDetail7), gmvFloorConfig: { minGmvFloor: 10000 } });
  check("7: not ok", res7.ok === false);
  if (!res7.ok) check("7: stage parse (floor not reached)", res7.stage === "parse");
  check("7: detail fetched once", calls7.length === 1);

  if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
  console.log("\nAll score-candidate checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });
