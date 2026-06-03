// src/lib/discover-score-plan.check.ts
// Positive-control fixtures for discoverScoreAndPlan — the discovery composition root that
// threads a creator SEARCH through the offline scoring pipeline into buildOutreachPlan. Proves:
// eligible survivors are ranked by composite (GMV-driven here) and capped to maxInvites; the fit
// gate drops a candidate WITHOUT fetching its detail; a per-detail failure gracefully drops just
// that creator; a failed search is the ONLY hard fail and short-circuits before any detail fetch;
// and an empty-but-ok search yields a valid zero-invite plan with passed-through pagination.
//
// PURE: the two fetcher types are imported TYPE-ONLY, so the server-only fetcher modules are
// NEVER executed. This needs NO react-server condition and NO env:
//
//   npx tsx src/lib/discover-score-plan.check.ts

import { discoverScoreAndPlan } from "./discover-score-plan";
import type { GetCreatorApiResponse } from "./tiktok-marketplace-parse";
import type {
  MarketplaceCandidate,
  ParseSearchCreatorsResult,
} from "./tiktok-marketplace-search-parse";
import type { FetchCreatorSearch, SearchCreatorsArgs } from "./tiktok-creator-search-fetcher";
import type { FetchCreatorDetail } from "./score-candidate";
import type { BrandFitConfig } from "./fit-score";
import type { OutreachPolicyConfig } from "./outreach-plan";

let passed = 0;
// Throw on first mismatch — a failing assertion stops the run with the scenario name only.
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.log(`FAIL: ${name}`);
    throw new Error(`assertion failed: ${name}`);
  }
  passed++;
  console.log(`PASS: ${name}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ALL-GATED brand config: region + followers + category are all HARD gates, so every survivor
// scores fitSubScore 100 (no soft signals remain) and the composite order is driven only by GMV.
const ALL_GATED: BrandFitConfig = {
  targetCategoryIds: ["60001"],
  targetRegions: ["US"],
  minFollowers: 1000,
  gates: { region: true, followers: true, category: true },
};

// Realistic search candidate. Defaults pass every ALL_GATED gate (US / 50000 followers / 60001).
function candidate(
  openId: string,
  opts: { region?: string | null; followers?: number | null; categoryIds?: string[] } = {},
): MarketplaceCandidate {
  return {
    creatorOpenId: openId,
    username: "mens_wellness_marcus",
    nickname: null,
    avatarUrl: null,
    selectionRegion: opts.region === undefined ? "US" : opts.region,
    categoryIds: opts.categoryIds ?? ["60001"],
    avgEcLiveUv: null,
    avgEcVideoViewCount: null,
    followerCount: opts.followers === undefined ? 50000 : opts.followers,
    gmv: null,
  };
}

// get-creator detail with CONSTANT performance fields; only the precise GMV amount varies, so the
// composite ranks purely on GMV and effectiveGmv === the precise amount.
function detailWithGmv(amount: string): GetCreatorApiResponse {
  return {
    code: 0,
    message: "success",
    data: {
      creator: {
        follower_count: 50000,
        ec_video_count: 20,
        ec_live_count: 4,
        avg_ec_video_like_count: 1200,
        avg_ec_live_like_count: 300,
        avg_ec_video_comment_count: 80,
        avg_ec_live_comment_count: 20,
        avg_ec_video_play_count: 50000,
        avg_ec_live_view_count: 8000,
        gmv: { currency: "USD", amount },
      },
    },
  };
}

// Search fetcher stub: ignores args, returns a canned parse result.
function searchStub(result: ParseSearchCreatorsResult): FetchCreatorSearch {
  return async () => result;
}

// Detail fetcher stub: records each requested id, returns the mapped canned response.
function detailStub(
  map: Record<string, GetCreatorApiResponse>,
  calls: string[],
): FetchCreatorDetail {
  return async (id: string) => {
    calls.push(id);
    return map[id];
  };
}

const SEARCH_ARGS: SearchCreatorsArgs = { pageSize: 20 };

async function main() {
  // ── (A) RANKING + cursor + counts ─────────────────────────────────────────────
  // Candidates supplied OUT of order [mid, high, low]; all pass the gates. GMV values chosen
  // so composites are STRICTLY decreasing: high(500000) saturates the GMV knee -> highest
  // composite; mid(10000) is on the strictly-rising part of the curve -> strictly between
  // high and low; low(5000) -> lowest composite. Cap 5 (>= 3 eligible) -> all selected.
  {
    const calls: string[] = [];
    const result: ParseSearchCreatorsResult = {
      ok: true,
      candidates: [candidate("mid"), candidate("high"), candidate("low")],
      nextPageToken: "npt_9",
      searchKey: "sk_9",
    };
    const map: Record<string, GetCreatorApiResponse> = {
      high: detailWithGmv("500000"),
      mid: detailWithGmv("10000"),
      low: detailWithGmv("5000"),
    };
    const policy: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };
    const r = await discoverScoreAndPlan({
      fetchSearch: searchStub(result),
      fetchDetail: detailStub(map, calls),
      config: ALL_GATED,
      policy,
      searchArgs: SEARCH_ARGS,
    });
    check("(A) ok===true", r.ok === true);
    if (!r.ok) throw new Error("unreachable"); // narrow to the success branch
    check("(A) eligibleCount===3", r.plan.eligibleCount === 3);
    check("(A) selectedCount===3", r.plan.selectedCount === 3);
    check("(A) cappedOutCount===0", r.plan.cappedOutCount === 0);
    check("(A) invites.length===3", r.plan.invites.length === 3);
    check("(A) invites[0]==='high'", r.plan.invites[0].creatorOpenId === "high");
    check("(A) invites[1]==='mid'", r.plan.invites[1].creatorOpenId === "mid");
    check("(A) invites[2]==='low'", r.plan.invites[2].creatorOpenId === "low");
    console.log("composites:", r.plan.invites.map((i) => i.composite));
    // Strict > so a saturation tie cannot silently pass.
    check(
      "(A) composite strictly descending [0]>[1]>[2]",
      r.plan.invites[0].composite > r.plan.invites[1].composite &&
        r.plan.invites[1].composite > r.plan.invites[2].composite,
    );
    check("(A) every invite commissionRate===15", r.plan.invites.every((i) => i.commissionRate === 15));
    console.log("effectiveGmv:", r.plan.invites.map((i) => i.effectiveGmv));
    // Robust to transform scaling: all finite numbers, strictly decreasing.
    check(
      "(A) effectiveGmv all finite",
      r.plan.invites.every((i) => typeof i.effectiveGmv === "number" && Number.isFinite(i.effectiveGmv)),
    );
    check(
      "(A) effectiveGmv strictly descending [0]>[1]>[2]",
      (r.plan.invites[0].effectiveGmv as number) > (r.plan.invites[1].effectiveGmv as number) &&
        (r.plan.invites[1].effectiveGmv as number) > (r.plan.invites[2].effectiveGmv as number),
    );
    check("(A) nextPageToken==='npt_9'", r.nextPageToken === "npt_9");
    check("(A) searchKey==='sk_9'", r.searchKey === "sk_9");
    check("(A) calls.length===3", calls.length === 3);
  }

  // ── (B) CAP ────────────────────────────────────────────────────────────────────
  // Same pool as (A) (same strictly-ordered GMVs) but maxInvites 2 -> top 2 selected
  // (high, mid), low capped out.
  {
    const calls: string[] = [];
    const result: ParseSearchCreatorsResult = {
      ok: true,
      candidates: [candidate("mid"), candidate("high"), candidate("low")],
      nextPageToken: "npt_9",
      searchKey: "sk_9",
    };
    const map: Record<string, GetCreatorApiResponse> = {
      high: detailWithGmv("500000"),
      mid: detailWithGmv("10000"),
      low: detailWithGmv("5000"),
    };
    const policy: OutreachPolicyConfig = { maxInvites: 2, commissionRate: 15 };
    const r = await discoverScoreAndPlan({
      fetchSearch: searchStub(result),
      fetchDetail: detailStub(map, calls),
      config: ALL_GATED,
      policy,
      searchArgs: SEARCH_ARGS,
    });
    check("(B) ok===true", r.ok === true);
    if (!r.ok) throw new Error("unreachable");
    check("(B) eligibleCount===3", r.plan.eligibleCount === 3);
    check("(B) selectedCount===2", r.plan.selectedCount === 2);
    check("(B) cappedOutCount===1", r.plan.cappedOutCount === 1);
    check("(B) invites.length===2", r.plan.invites.length === 2);
    check(
      "(B) invites are [high, mid]",
      JSON.stringify(r.plan.invites.map((i) => i.creatorOpenId)) === JSON.stringify(["high", "mid"]),
    );
    check("(B) no invite is 'low'", r.plan.invites.some((i) => i.creatorOpenId === "low") === false);
  }

  // ── (C) FIT GATE drops a candidate and its detail is never fetched ──────────────
  // "ca_fail" is out-of-region (CA) -> fit-rejected before any detail call.
  {
    const calls: string[] = [];
    const result: ParseSearchCreatorsResult = {
      ok: true,
      candidates: [candidate("us_ok"), candidate("ca_fail", { region: "CA" })],
      nextPageToken: null,
      searchKey: null,
    };
    const map: Record<string, GetCreatorApiResponse> = {
      us_ok: detailWithGmv("50000"),
    };
    const policy: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };
    const r = await discoverScoreAndPlan({
      fetchSearch: searchStub(result),
      fetchDetail: detailStub(map, calls),
      config: ALL_GATED,
      policy,
      searchArgs: SEARCH_ARGS,
    });
    check("(C) ok===true", r.ok === true);
    if (!r.ok) throw new Error("unreachable");
    check("(C) eligibleCount===1", r.plan.eligibleCount === 1);
    check("(C) invites.length===1", r.plan.invites.length === 1);
    check("(C) invites[0]==='us_ok'", r.plan.invites[0].creatorOpenId === "us_ok");
    check("(C) calls.length===1 (gated detail never fetched)", calls.length === 1);
    check("(C) calls does NOT include 'ca_fail'", calls.includes("ca_fail") === false);
  }

  // ── (D) GRACEFUL per-detail failure drops just that creator ─────────────────────
  // "bad" passes the fit gate (so its detail IS fetched) but its detail is a coerced transport
  // failure (code -1) -> scoreCreatorFromResponse rejects it as "parse" -> excluded from the plan.
  {
    const calls: string[] = [];
    const result: ParseSearchCreatorsResult = {
      ok: true,
      candidates: [candidate("good"), candidate("bad")],
      nextPageToken: null,
      searchKey: null,
    };
    const map: Record<string, GetCreatorApiResponse> = {
      good: detailWithGmv("50000"),
      bad: { code: -1, message: "transport_network_error" },
    };
    const policy: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };
    const r = await discoverScoreAndPlan({
      fetchSearch: searchStub(result),
      fetchDetail: detailStub(map, calls),
      config: ALL_GATED,
      policy,
      searchArgs: SEARCH_ARGS,
    });
    check("(D) ok===true", r.ok === true);
    if (!r.ok) throw new Error("unreachable");
    check("(D) eligibleCount===1", r.plan.eligibleCount === 1);
    check("(D) invites.length===1", r.plan.invites.length === 1);
    check("(D) invites[0]==='good'", r.plan.invites[0].creatorOpenId === "good");
    check("(D) 'bad' not in invites", r.plan.invites.some((i) => i.creatorOpenId === "bad") === false);
    check("(D) calls.length===2 (both passed fit, both detail-fetched)", calls.length === 2);
  }

  // ── (E) SEARCH hard-fail short-circuits ─────────────────────────────────────────
  // The search itself fails -> single hard-fail; fetchDetail is NEVER called.
  {
    const calls: string[] = [];
    const result: ParseSearchCreatorsResult = {
      ok: false,
      code: 45101004,
      message: "search quota exceeded",
    };
    const policy: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };
    const r = await discoverScoreAndPlan({
      fetchSearch: searchStub(result),
      fetchDetail: detailStub({}, calls),
      config: ALL_GATED,
      policy,
      searchArgs: SEARCH_ARGS,
    });
    check("(E) ok===false", r.ok === false);
    if (r.ok) throw new Error("unreachable"); // narrow to the failure branch
    check("(E) stage==='search'", r.stage === "search");
    check("(E) code===45101004", r.code === 45101004);
    check("(E) message==='search quota exceeded'", r.message === "search quota exceeded");
    check("(E) calls.length===0 (no detail fetched)", calls.length === 0);
  }

  // ── (F) EMPTY but ok ────────────────────────────────────────────────────────────
  // An ok search with zero candidates -> valid zero-invite plan; pagination passed through.
  {
    const calls: string[] = [];
    const result: ParseSearchCreatorsResult = {
      ok: true,
      candidates: [],
      nextPageToken: null,
      searchKey: null,
    };
    const policy: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };
    const r = await discoverScoreAndPlan({
      fetchSearch: searchStub(result),
      fetchDetail: detailStub({}, calls),
      config: ALL_GATED,
      policy,
      searchArgs: SEARCH_ARGS,
    });
    check("(F) ok===true", r.ok === true);
    if (!r.ok) throw new Error("unreachable");
    check("(F) eligibleCount===0", r.plan.eligibleCount === 0);
    check("(F) selectedCount===0", r.plan.selectedCount === 0);
    check("(F) cappedOutCount===0", r.plan.cappedOutCount === 0);
    check("(F) invites.length===0", r.plan.invites.length === 0);
    check("(F) nextPageToken===null", r.nextPageToken === null);
    check("(F) searchKey===null", r.searchKey === null);
    check("(F) calls.length===0", calls.length === 0);
  }

  console.log(`\n(${passed} passed, 0 failed)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
