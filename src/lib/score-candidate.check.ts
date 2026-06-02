// src/lib/score-candidate.check.ts
// Positive-control fixtures for scoreCandidate — the gate-aware orchestrator wiring the
// cheap fit gate to the expensive detail-fetch + composite. Proves: a fit rejection
// short-circuits WITHOUT fetching detail; a survivor fetches once and scores end to end
// with the fit sub-score threaded in; a detail parse failure propagates as stage "parse".
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

  if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
  console.log("\nAll score-candidate checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });
