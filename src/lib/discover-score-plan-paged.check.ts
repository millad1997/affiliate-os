// src/lib/discover-score-plan-paged.check.ts
// Positive-control fixtures for discoverScoreAndPlanPaged — the multi-page discovery composition
// root. Proves: candidates accumulate across pages and are de-duplicated by creatorOpenId;
// pagination handles (nextPageToken + searchKey) thread correctly into subsequent requests;
// the page cap (maxPages) stops fetching without failing; a page-1 failure hard-fails;
// a mid-pagination failure yields a partial-success result (stoppedEarly); API exhaustion
// (nextPageToken null) stops early without stoppedEarly; and maxPages 0 issues no fetch.
// GMV amounts are kept strictly below the 30 000 saturation knee so composites are strictly
// distinct and the ranking is unambiguous.
//
// PURE: fetcher types are imported TYPE-ONLY; no server-only module is executed. Needs NO
// react-server condition and NO env:
//
//   npx tsx src/lib/discover-score-plan-paged.check.ts

import { discoverScoreAndPlanPaged } from "./discover-score-plan-paged";
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
// Throw on first mismatch — stops the run with the scenario name only, never a data value.
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.log(`FAIL: ${name}`);
    throw new Error(`assertion failed: ${name}`);
  }
  passed++;
  console.log(`PASS: ${name}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ALL-GATED: region + followers + category are all HARD gates, so every survivor scores
// fitSubScore 100 (no soft signals) and composite order is driven only by GMV.
const ALL_GATED: BrandFitConfig = {
  targetCategoryIds: ["60001"],
  targetRegions: ["US"],
  minFollowers: 1000,
  gates: { region: true, followers: true, category: true },
};

// Realistic search candidate. Defaults pass ALL_GATED (US / 50000 followers / ["60001"]).
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

// Detail with CONSTANT perf fields; only gmv.amount varies. All amounts are STRICTLY BELOW
// 30 000 (the composite saturation knee) so composites are strictly distinct.
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

// Page-aware search stub. The incoming pageToken is read from args.pageToken; when it is
// undefined (first request) the sentinel "__INITIAL__" is used as the map key. Each call
// records { pageToken, searchKey } into searchCalls for cursor-threading assertions.
type SearchCallRecord = { pageToken: string | undefined; searchKey: string | undefined };

function pagedSearchStub(
  pages: Record<string, ParseSearchCreatorsResult>,
  searchCalls: SearchCallRecord[],
): FetchCreatorSearch {
  return async (args: SearchCreatorsArgs): Promise<ParseSearchCreatorsResult> => {
    const key = args.pageToken ?? "__INITIAL__";
    searchCalls.push({ pageToken: args.pageToken, searchKey: args.body?.search_key });
    const result = pages[key];
    if (result === undefined) {
      return { ok: false, code: -99, message: `no stub for pageToken "${key}"` };
    }
    return result;
  };
}

// Detail fetcher stub: records requested id, returns canned response from map.
function detailStub(
  map: Record<string, GetCreatorApiResponse>,
  calls: string[],
): FetchCreatorDetail {
  return async (id: string) => {
    calls.push(id);
    return map[id];
  };
}

const BASE_ARGS: SearchCreatorsArgs = { pageSize: 20 };

async function main() {
  // ── (A) MULTI-PAGE accumulate + de-dup + threading + ranking ──────────────────
  // 3 pages fetched (stops at nextPageToken null on page 3). c2 appears on pages 1 and 2
  // (duplicate); only the first occurrence is scored. GMVs are strictly below 30 000 so
  // composites are unambiguously ordered: c1(25000) > c2(18000) > c3(12000) > c4(8000).
  {
    const searchCalls: SearchCallRecord[] = [];
    const detailCalls: string[] = [];

    const pages: Record<string, ParseSearchCreatorsResult> = {
      __INITIAL__: { ok: true, candidates: [candidate("c1"), candidate("c2")], nextPageToken: "p2", searchKey: "sk1" },
      p2:          { ok: true, candidates: [candidate("c2"), candidate("c3")], nextPageToken: "p3", searchKey: "sk2" },
      p3:          { ok: true, candidates: [candidate("c4")],                  nextPageToken: null,  searchKey: "sk3" },
    };
    const detailMap: Record<string, GetCreatorApiResponse> = {
      c1: detailWithGmv("25000"),
      c2: detailWithGmv("18000"),
      c3: detailWithGmv("12000"),
      c4: detailWithGmv("8000"),
    };
    const policy: OutreachPolicyConfig = { maxInvites: 10, commissionRate: 15 };

    const r = await discoverScoreAndPlanPaged({
      fetchSearch: pagedSearchStub(pages, searchCalls),
      fetchDetail: detailStub(detailMap, detailCalls),
      config: ALL_GATED,
      policy,
      searchArgs: BASE_ARGS,
      maxPages: 5,
    });

    check("(A) ok===true", r.ok === true);
    if (!r.ok) throw new Error("unreachable");
    check("(A) pagesFetched===3", r.pagesFetched === 3);
    check("(A) lastNextPageToken===null", r.lastNextPageToken === null);
    check("(A) stoppedEarly===false", r.stoppedEarly === false);
    check("(A) eligibleCount===4 (c2 de-duped, not 5)", r.plan.eligibleCount === 4);
    check("(A) detail calls.length===4", detailCalls.length === 4);
    check("(A) no duplicate 'c2' in detail calls", detailCalls.filter((id) => id === "c2").length === 1);
    check(
      "(A) invites order === [c1,c2,c3,c4] (GMV-descending)",
      JSON.stringify(r.plan.invites.map((i) => i.creatorOpenId)) ===
        JSON.stringify(["c1", "c2", "c3", "c4"]),
    );
    console.log("(A) composites:", r.plan.invites.map((i) => i.composite));
    check(
      "(A) composites strictly descending",
      r.plan.invites[0].composite > r.plan.invites[1].composite &&
        r.plan.invites[1].composite > r.plan.invites[2].composite &&
        r.plan.invites[2].composite > r.plan.invites[3].composite,
    );
    // Cursor threading: page 2 must carry token "p2" and searchKey "sk1" from page 1.
    check("(A) searchCalls[1].pageToken==='p2'",   searchCalls[1].pageToken === "p2");
    check("(A) searchCalls[1].searchKey==='sk1'",  searchCalls[1].searchKey === "sk1");
    // Page 3 must carry token "p3" and searchKey "sk2" from page 2.
    check("(A) searchCalls[2].pageToken==='p3'",   searchCalls[2].pageToken === "p3");
    check("(A) searchCalls[2].searchKey==='sk2'",  searchCalls[2].searchKey === "sk2");
  }

  // ── (B) maxPages CAP stops before exhaustion ──────────────────────────────────
  // Pages __INITIAL__ (token "p2") and "p2" (token "p3") are fetched; "p3" is never reached
  // because maxPages 2 caps the loop. stoppedEarly stays false (the cap is NOT a failure).
  {
    const searchCalls: SearchCallRecord[] = [];
    const detailCalls: string[] = [];

    const pages: Record<string, ParseSearchCreatorsResult> = {
      __INITIAL__: { ok: true, candidates: [candidate("c1")], nextPageToken: "p2", searchKey: "sk1" },
      p2:          { ok: true, candidates: [candidate("c2")], nextPageToken: "p3", searchKey: "sk2" },
      p3:          { ok: true, candidates: [candidate("c3")], nextPageToken: null,  searchKey: "sk3" },
    };
    const detailMap: Record<string, GetCreatorApiResponse> = {
      c1: detailWithGmv("25000"),
      c2: detailWithGmv("18000"),
    };
    const policy: OutreachPolicyConfig = { maxInvites: 10, commissionRate: 15 };

    const r = await discoverScoreAndPlanPaged({
      fetchSearch: pagedSearchStub(pages, searchCalls),
      fetchDetail: detailStub(detailMap, detailCalls),
      config: ALL_GATED,
      policy,
      searchArgs: BASE_ARGS,
      maxPages: 2,
    });

    check("(B) ok===true", r.ok === true);
    if (!r.ok) throw new Error("unreachable");
    check("(B) pagesFetched===2", r.pagesFetched === 2);
    check("(B) lastNextPageToken==='p3' (more exist, caller can resume)", r.lastNextPageToken === "p3");
    check("(B) stoppedEarly===false (cap is not a failure)", r.stoppedEarly === false);
    check("(B) only 2-page candidates scored (eligibleCount===2)", r.plan.eligibleCount === 2);
    check("(B) searchCalls.length===2 (p3 never fetched)", searchCalls.length === 2);
  }

  // ── (C) PAGE-1 FAILURE hard-fails ─────────────────────────────────────────────
  // The very first search request fails; no candidates have been accumulated yet, so we
  // return ok: false. fetchDetail is NEVER called.
  {
    const searchCalls: SearchCallRecord[] = [];
    const detailCalls: string[] = [];

    const pages: Record<string, ParseSearchCreatorsResult> = {
      __INITIAL__: { ok: false, code: 45101004, message: "search quota exceeded" },
    };
    const policy: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };

    const r = await discoverScoreAndPlanPaged({
      fetchSearch: pagedSearchStub(pages, searchCalls),
      fetchDetail: detailStub({}, detailCalls),
      config: ALL_GATED,
      policy,
      searchArgs: BASE_ARGS,
      maxPages: 5,
    });

    check("(C) ok===false", r.ok === false);
    if (r.ok) throw new Error("unreachable");
    check("(C) stage==='search'", r.stage === "search");
    check("(C) code===45101004", r.code === 45101004);
    check("(C) message==='search quota exceeded'", r.message === "search quota exceeded");
    check("(C) detail calls.length===0", detailCalls.length === 0);
  }

  // ── (D) MID-PAGINATION failure -> partial success ─────────────────────────────
  // Page 1 succeeds; page 2 fails. Because candidates were already accumulated from page 1,
  // we do NOT hard-fail; stoppedEarly is true and plan is built on page-1 creators only.
  {
    const searchCalls: SearchCallRecord[] = [];
    const detailCalls: string[] = [];

    const pages: Record<string, ParseSearchCreatorsResult> = {
      __INITIAL__: { ok: true, candidates: [candidate("c1"), candidate("c2")], nextPageToken: "p2", searchKey: "sk1" },
      p2:          { ok: false, code: 45101004, message: "search quota exceeded" },
    };
    const detailMap: Record<string, GetCreatorApiResponse> = {
      c1: detailWithGmv("25000"),
      c2: detailWithGmv("18000"),
    };
    const policy: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };

    const r = await discoverScoreAndPlanPaged({
      fetchSearch: pagedSearchStub(pages, searchCalls),
      fetchDetail: detailStub(detailMap, detailCalls),
      config: ALL_GATED,
      policy,
      searchArgs: BASE_ARGS,
      maxPages: 5,
    });

    check("(D) ok===true", r.ok === true);
    if (!r.ok) throw new Error("unreachable");
    check("(D) pagesFetched===1", r.pagesFetched === 1);
    check("(D) stoppedEarly===true", r.stoppedEarly === true);
    check("(D) stopReason.code===45101004", r.stopReason?.code === 45101004);
    check("(D) stopReason.message==='search quota exceeded'", r.stopReason?.message === "search quota exceeded");
    check("(D) plan.eligibleCount===2 (page-1 creators scored)", r.plan.eligibleCount === 2);
  }

  // ── (E) EXHAUSTION before maxPages ────────────────────────────────────────────
  // The first (and only) page has nextPageToken null — the API has no more results. The loop
  // stops after 1 iteration without consuming the remaining maxPages budget. stoppedEarly
  // stays false because this is normal API exhaustion, not a failure.
  {
    const searchCalls: SearchCallRecord[] = [];
    const detailCalls: string[] = [];

    const pages: Record<string, ParseSearchCreatorsResult> = {
      __INITIAL__: { ok: true, candidates: [candidate("c1")], nextPageToken: null, searchKey: "sk1" },
    };
    const detailMap: Record<string, GetCreatorApiResponse> = {
      c1: detailWithGmv("25000"),
    };
    const policy: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };

    const r = await discoverScoreAndPlanPaged({
      fetchSearch: pagedSearchStub(pages, searchCalls),
      fetchDetail: detailStub(detailMap, detailCalls),
      config: ALL_GATED,
      policy,
      searchArgs: BASE_ARGS,
      maxPages: 5,
    });

    check("(E) ok===true", r.ok === true);
    if (!r.ok) throw new Error("unreachable");
    check("(E) pagesFetched===1", r.pagesFetched === 1);
    check("(E) stoppedEarly===false", r.stoppedEarly === false);
    check("(E) lastNextPageToken===null", r.lastNextPageToken === null);
    check("(E) plan.eligibleCount===1", r.plan.eligibleCount === 1);
    check("(E) searchCalls.length===1 (no extra fetch after null token)", searchCalls.length === 1);
  }

  // ── (F) maxPages 0 -> empty plan, NO fetch ─────────────────────────────────────
  // Clamping: maxPages 0 (and any negative) must skip the loop entirely. fetchSearch and
  // fetchDetail are NEVER called. Returns a valid zero-invite plan.
  {
    const searchCalls: SearchCallRecord[] = [];
    const detailCalls: string[] = [];

    const policy: OutreachPolicyConfig = { maxInvites: 5, commissionRate: 15 };

    const r = await discoverScoreAndPlanPaged({
      fetchSearch: pagedSearchStub({}, searchCalls),
      fetchDetail: detailStub({}, detailCalls),
      config: ALL_GATED,
      policy,
      searchArgs: BASE_ARGS,
      maxPages: 0,
    });

    check("(F) ok===true", r.ok === true);
    if (!r.ok) throw new Error("unreachable");
    check("(F) pagesFetched===0", r.pagesFetched === 0);
    check("(F) plan.eligibleCount===0", r.plan.eligibleCount === 0);
    check("(F) plan.selectedCount===0", r.plan.selectedCount === 0);
    check("(F) plan.cappedOutCount===0", r.plan.cappedOutCount === 0);
    check("(F) searchCalls.length===0", searchCalls.length === 0);
    check("(F) detail calls.length===0", detailCalls.length === 0);
  }

  console.log(`\n(${passed} passed, 0 failed)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
