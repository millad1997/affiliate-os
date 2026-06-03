// src/lib/discover-score-plan.ts
// Discovery composition root (PURE): SEARCH -> score the candidate pool -> build the outreach
// plan, in a single call. This is the top of the OFFLINE pipeline: it threads a creator search
// through scoreCandidatePool (which runs the cheap fit gate -> detail fetch -> score -> optional
// GMV floor per candidate) and hands the resulting ScoredEntry[] to buildOutreachPlan, returning
// either a single hard-fail (the search itself failed) or a complete plan plus the search's
// pagination handles (nextPageToken / searchKey) for the caller to page on.
//
// Why this stays PURE: both fetchers are INJECTED and imported TYPE-ONLY, so the server-only
// fetcher modules (tiktok-creator-search-fetcher and the live get-creator detail fetcher) are
// NEVER executed merely by importing this file. It composes fully on fixtures — no env, no
// react-server condition, no network/auth.
//
// Failure model (deliberately asymmetric):
//   - A failed SEARCH is the ONLY hard fail. With no candidates there is nothing to score, so we
//     short-circuit and NEVER call fetchDetail / scoreCandidatePool.
//   - Per-creator detail failures are NOT handled here: a transport failure is already coerced to
//     a non-zero code that scoreCreatorFromResponse rejects as a "parse" stage, and
//     buildOutreachPlan excludes every non-ok entry — so one bad detail simply drops that creator.
//   - An empty-but-ok search yields a valid zero-invite plan (eligible/selected/capped all 0),
//     not an error.

import { scoreCandidatePool } from "./score-candidate-pool";
import { buildOutreachPlan, type OutreachPolicyConfig, type OutreachPlan } from "./outreach-plan";
import type { FetchCreatorSearch, SearchCreatorsArgs } from "./tiktok-creator-search-fetcher";
import type { FetchCreatorDetail } from "./score-candidate";
import type { BrandFitConfig } from "./fit-score";
import type { GmvFloorConfig } from "./gmv-floor";

export type DiscoverScoreAndPlanArgs = {
  fetchSearch: FetchCreatorSearch;
  fetchDetail: FetchCreatorDetail;
  config: BrandFitConfig;
  policy: OutreachPolicyConfig;
  searchArgs: SearchCreatorsArgs;
  gmvFloorConfig?: GmvFloorConfig;
};

export type DiscoverScoreAndPlanResult =
  | { ok: false; stage: "search"; code: number; message: string }
  | { ok: true; plan: OutreachPlan; nextPageToken: string | null; searchKey: string | null };

export async function discoverScoreAndPlan(
  args: DiscoverScoreAndPlanArgs,
): Promise<DiscoverScoreAndPlanResult> {
  // 1 — run the discovery search. This is the only hard-fail boundary.
  const search = await args.fetchSearch(args.searchArgs);
  if (!search.ok) {
    return { ok: false, stage: "search", code: search.code, message: search.message };
  }

  // 2 — score the pool. Per-candidate fit rejects and detail/parse failures are absorbed inside
  //     scoreCandidatePool's entries (non-ok), to be excluded by buildOutreachPlan below.
  const entries = await scoreCandidatePool({
    config: args.config,
    candidates: search.candidates,
    fetchDetail: args.fetchDetail,
    gmvFloorConfig: args.gmvFloorConfig,
  });

  // 3 — rank/cap the scored survivors into the invite plan.
  const plan = buildOutreachPlan(args.policy, entries);

  // 4 — return the plan alongside the search's pagination handles (pass-through).
  return { ok: true, plan, nextPageToken: search.nextPageToken, searchKey: search.searchKey };
}
