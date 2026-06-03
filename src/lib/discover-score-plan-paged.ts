// src/lib/discover-score-plan-paged.ts
// Multi-page discovery composition root (PURE): iterates up to `maxPages` search pages,
// de-duplicates candidates across pages, scores the accumulated pool, and builds the outreach
// plan. Extends the single-page discover-score-plan pattern with:
//
//   - Page loop: each iteration threads the previous page's nextPageToken + searchKey back
//     into the next request body, preserving the API's stable search session.
//   - De-duplication: a Set<string> guards by creatorOpenId so a candidate appearing on
//     multiple pages is scored only once (first occurrence wins; later ones are skipped).
//   - Early exhaustion: if a page's nextPageToken is null, the API has no more results;
//     we stop before consuming the remaining maxPages budget.
//   - Asymmetric failure model (mirrors single-page sibling):
//       * Page-1 failure with zero accumulated candidates = the ONLY hard fail (ok: false).
//       * A later page failure (candidates already accumulated) = partial success with
//         stoppedEarly: true and a stopReason, so the plan is built on whatever was gathered.
//   - maxPages <= 0: clamps to 0 — no fetch is issued, returns a valid zero-invite plan.
//
// Why this stays PURE: both fetchers are INJECTED and imported TYPE-ONLY, so the server-only
// fetcher modules (tiktok-creator-search-fetcher, tiktok-creator-fetcher) are NEVER executed
// by importing this file. No env, no react-server condition, no network/auth required.

import { scoreCandidatePool } from "./score-candidate-pool";
import { buildOutreachPlan, type OutreachPolicyConfig, type OutreachPlan } from "./outreach-plan";
import type { FetchCreatorSearch, SearchCreatorsArgs } from "./tiktok-creator-search-fetcher";
import type { MarketplaceCandidate } from "./tiktok-marketplace-search-parse";
import type { FetchCreatorDetail } from "./score-candidate";
import type { BrandFitConfig } from "./fit-score";
import type { GmvFloorConfig } from "./gmv-floor";

export type PagedDiscoverArgs = {
  fetchSearch: FetchCreatorSearch;
  fetchDetail: FetchCreatorDetail;
  config: BrandFitConfig;
  policy: OutreachPolicyConfig;
  searchArgs: SearchCreatorsArgs;  // page-1 search criteria; pageSize + optional body
  maxPages: number;                // number of search pages to fetch (>= 0; negative clamps to 0)
  gmvFloorConfig?: GmvFloorConfig;
};

export type PagedDiscoverResult =
  | { ok: false; stage: "search"; code: number; message: string }
  | {
      ok: true;
      plan: OutreachPlan;
      pagesFetched: number;
      lastNextPageToken: string | null;
      lastSearchKey: string | null;
      stoppedEarly: boolean;          // true iff a later page failed after candidates were accumulated
      stopReason?: { code: number; message: string };
    };

export async function discoverScoreAndPlanPaged(
  args: PagedDiscoverArgs,
): Promise<PagedDiscoverResult> {
  const seen = new Set<string>();
  const candidates: MarketplaceCandidate[] = [];

  let pagesFetched = 0;
  let lastNextPageToken: string | null = null;
  let lastSearchKey: string | null = null;
  let stoppedEarly = false;
  let stopReason: { code: number; message: string } | undefined = undefined;

  let pageArgs: SearchCreatorsArgs = args.searchArgs;
  const limit = Math.max(0, args.maxPages);

  for (let page = 0; page < limit; page++) {
    const res = await args.fetchSearch(pageArgs);

    if (!res.ok) {
      // Page-1 with nothing accumulated: hard fail — there is no partial result to return.
      if (candidates.length === 0) {
        return { ok: false, stage: "search", code: res.code, message: res.message };
      }
      // Later page failure: stop the loop but keep everything gathered so far.
      stoppedEarly = true;
      stopReason = { code: res.code, message: res.message };
      break;
    }

    pagesFetched++;
    lastNextPageToken = res.nextPageToken;
    lastSearchKey = res.searchKey;

    // Accumulate unique candidates (first occurrence wins).
    for (const c of res.candidates) {
      if (!seen.has(c.creatorOpenId)) {
        seen.add(c.creatorOpenId);
        candidates.push(c);
      }
    }

    // API exhausted — no point issuing another request.
    if (res.nextPageToken === null) break;

    // Thread the pagination handles into the next request's body so the API continues
    // the same stable search session (search_key ties the pages together server-side).
    pageArgs = {
      pageSize: args.searchArgs.pageSize,
      pageToken: res.nextPageToken,
      body: { ...(args.searchArgs.body ?? {}), search_key: res.searchKey ?? undefined },
    };
  }

  const entries = await scoreCandidatePool({
    config: args.config,
    candidates,
    fetchDetail: args.fetchDetail,
    gmvFloorConfig: args.gmvFloorConfig,
  });

  const plan = buildOutreachPlan(args.policy, entries);

  return {
    ok: true,
    plan,
    pagesFetched,
    lastNextPageToken,
    lastSearchKey,
    stoppedEarly,
    stopReason,
  };
}
