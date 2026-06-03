// src/lib/score-candidate.ts
// Gate-aware orchestrator for the two-stage per-creator scoring flow:
//   1. CHEAP: computeFit on the search-candidate signals (category/region/followers).
//      A creator failing a brand hard gate is rejected here — and its expensive detail
//      lookup is NEVER fetched.
//   2. EXPENSIVE (survivors only): fetch the get-creator detail (injected async boundary),
//      then score via scoreCreatorFromResponse, threading in the fit sub-score from stage 1.
//   3. OPTIONAL (configured): a post-score GMV floor drops a scored creator whose effective
//      GMV is below the operator's minGmvFloor; absent GMV is never dropped (passes through).
// Pure and fully fixture-testable without network/auth; the live fetcher is wired by the
// caller. score-creator stays a standalone unit (this layers on top of it).

import { computeFit, type BrandFitConfig } from "./fit-score";
import { scoreCreatorFromResponse } from "./score-creator";
import type { MarketplaceCandidate } from "./tiktok-marketplace-search-parse";
import type { GetCreatorApiResponse } from "./tiktok-marketplace-parse";
import type { TransformedCreatorMetrics } from "./tiktok-transform";
import type { CompositeScoreResult } from "./composite-score";
import { applyGmvFloor, type GmvFloorConfig } from "./gmv-floor";

export type FetchCreatorDetail = (creatorOpenId: string) => Promise<GetCreatorApiResponse>;

export type ScoreCandidateArgs = {
  config: BrandFitConfig;
  candidate: MarketplaceCandidate;
  fetchDetail: FetchCreatorDetail;
  gmvFloorConfig?: GmvFloorConfig;
};

export type ScoreCandidateResult =
  | { ok: false; stage: "fit"; rejectedBy: "region" | "followers" | "category" }
  | { ok: false; stage: "parse"; code: number; message: string }
  | { ok: false; stage: "gmv_floor"; effectiveGmv: number }
  | {
      ok: true;
      fitSubScore: number;
      metrics: TransformedCreatorMetrics;
      score: CompositeScoreResult;
    };

export async function scoreCandidate(args: ScoreCandidateArgs): Promise<ScoreCandidateResult> {
  const { config, candidate, fetchDetail, gmvFloorConfig } = args;

  // Stage 1 — cheap fit gate on the search-candidate signals.
  const fit = computeFit(config, {
    categoryIds: candidate.categoryIds,
    selectionRegion: candidate.selectionRegion,
    followerCount: candidate.followerCount,
  });
  if (!fit.ok) {
    // Gated out — do NOT fetch the expensive detail.
    return { ok: false, stage: "fit", rejectedBy: fit.rejectedBy };
  }

  // Stage 2 — survivors only: fetch detail and score, threading in the fit sub-score.
  const response = await fetchDetail(candidate.creatorOpenId);
  const scored = scoreCreatorFromResponse({
    response,
    creatorUserId: candidate.creatorOpenId,
    fitSubScore: fit.fitSubScore,
  });
  if (!scored.ok) {
    return { ok: false, stage: "parse", code: scored.code, message: scored.message };
  }

  // Stage 3 — optional outreach-stage GMV floor (operator knob). Applied only AFTER a
  // successful score. Absent GMV is never dropped (applyGmvFloor returns no_gmv_no_floor,
  // which passes); only an explicit below_floor drops the candidate.
  if (gmvFloorConfig) {
    const floored = applyGmvFloor(gmvFloorConfig, scored.metrics);
    if (!floored.pass) {
      return { ok: false, stage: "gmv_floor", effectiveGmv: floored.effectiveGmv };
    }
  }

  return {
    ok: true,
    fitSubScore: fit.fitSubScore,
    metrics: scored.metrics,
    score: scored.score,
  };
}
