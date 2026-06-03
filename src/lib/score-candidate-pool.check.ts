// src/lib/score-candidate-pool.check.ts
// Positive controls for scoreCandidatePool — the offline pipeline composition root.
// Proves: each candidate maps to a ScoredEntry pairing its creatorOpenId with the result;
// input order is preserved; fit rejects carry stage "fit" and their detail is NEVER fetched
// (the cheap-gate economics survive the pool layer); the optional gmvFloorConfig threads
// through to a "gmv_floor" reject; and the output feeds buildOutreachPlan end to end.
// Run: npx tsx src/lib/score-candidate-pool.check.ts
import { scoreCandidatePool } from "./score-candidate-pool";
import { buildOutreachPlan, type OutreachPolicyConfig } from "./outreach-plan";
import type { BrandFitConfig } from "./fit-score";
import type { MarketplaceCandidate } from "./tiktok-marketplace-search-parse";
import type { GetCreatorApiResponse } from "./tiktok-marketplace-parse";
import type { FetchCreatorDetail } from "./score-candidate";

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

// Precise GMV 5000 -> perf 55; with category-soft fit 100 -> composite 73 (see score-candidate).
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

const cfg: BrandFitConfig = {
  targetCategoryIds: ["100"], targetRegions: ["US"], minFollowers: 50000,
  gates: { region: true, followers: true, category: false },
};

async function main() {
  // 1 — mixed pool: two survivors + one out-of-region reject. Order preserved; reject not fetched.
  const calls1: string[] = [];
  const pool1 = [
    makeCandidate({ creatorOpenId: "open_pass1" }),
    makeCandidate({ creatorOpenId: "open_reject", selectionRegion: "GB" }),
    makeCandidate({ creatorOpenId: "open_pass2" }),
  ];
  const entries1 = await scoreCandidatePool({ config: cfg, candidates: pool1, fetchDetail: recordingFetch(calls1, videoOnlyDetail) });
  check("1: 3 entries (one per candidate)", entries1.length === 3);
  check("1: order — [0] pass1", entries1[0].creatorOpenId === "open_pass1");
  check("1: order — [1] reject", entries1[1].creatorOpenId === "open_reject");
  check("1: order — [2] pass2", entries1[2].creatorOpenId === "open_pass2");
  check("1: pass1 ok", entries1[0].result.ok === true);
  check("1: reject not ok", entries1[1].result.ok === false);
  if (!entries1[1].result.ok) check("1: reject stage fit", entries1[1].result.stage === "fit");
  check("1: pass2 ok", entries1[2].result.ok === true);
  check("1: detail fetched only for survivors (2)", calls1.length === 2);
  check("1: fetched pass1 then pass2 (reject skipped)", calls1[0] === "open_pass1" && calls1[1] === "open_pass2");

  // 2 — optional gmvFloorConfig threads through: a survivor below the floor drops as "gmv_floor".
  const calls2: string[] = [];
  const entries2 = await scoreCandidatePool({
    config: cfg,
    candidates: [makeCandidate({ creatorOpenId: "open_low" })],
    fetchDetail: recordingFetch(calls2, videoOnlyDetail),
    gmvFloorConfig: { minGmvFloor: 10000 },
  });
  check("2: 1 entry", entries2.length === 1);
  check("2: not ok (floored)", entries2[0].result.ok === false);
  if (!entries2[0].result.ok) check("2: stage gmv_floor", entries2[0].result.stage === "gmv_floor");
  check("2: detail WAS fetched (post-score gate)", calls2.length === 1);

  // 3 — end to end: pool -> scoreCandidatePool -> buildOutreachPlan. Two survivors (both 73),
  //     cap 1 -> one selected (stable -> pass1), one capped; reject excluded from eligibility.
  const calls3: string[] = [];
  const pool3 = [
    makeCandidate({ creatorOpenId: "open_pass1" }),
    makeCandidate({ creatorOpenId: "open_reject", selectionRegion: "GB" }),
    makeCandidate({ creatorOpenId: "open_pass2" }),
  ];
  const entries3 = await scoreCandidatePool({ config: cfg, candidates: pool3, fetchDetail: recordingFetch(calls3, videoOnlyDetail) });
  const policy: OutreachPolicyConfig = { maxInvites: 1, commissionRate: 15 };
  const plan3 = buildOutreachPlan(policy, entries3);
  check("3: eligibleCount 2 (reject excluded)", plan3.eligibleCount === 2);
  check("3: selectedCount 1", plan3.selectedCount === 1);
  check("3: cappedOutCount 1", plan3.cappedOutCount === 1);
  check("3: invite is pass1 (stable on 73 tie)", plan3.invites[0].creatorOpenId === "open_pass1");
  check("3: invite effGmv 5000 (precise)", plan3.invites[0].effectiveGmv === 5000);
  check("3: invite commission 15", plan3.invites[0].commissionRate === 15);

  if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
  console.log("\nAll score-candidate-pool checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });
