// src/lib/score-candidate.ts
// Gate-aware orchestrator for the two-stage per-creator scoring flow:
//   1. CHEAP: computeFit on the search-candidate signals (category/region/followers).
//      A creator failing a brand hard gate is rejected here — and its expensive detail
//      lookup is NEVER fetched.
//   2. EXPENSIVE (survivors only): fetch the get-creator detail (injected async boundary),
//      then score via scoreCreatorFromResponse, threading in the fit sub-score from stage 1.
// Pure and fully fixture-testable without network/auth; the live fetcher is wired by the
// caller. score-creator stays a standalone unit (this layers on top of it).

import { computeFit, type BrandFitConfig } from "./fit-score";
import { scoreCreatorFromResponse } from "./score-creator";
import type { MarketplaceCandidate } from "./tiktok-marketplace-search-parse";
import type { GetCreatorApiResponse } from "./tiktok-marketplace-parse";
import type { TransformedCreatorMetrics } from "./tiktok-transform";
import type { CompositeScoreResult } from "./composite-score";

export type FetchCreatorDetail = (creatorOpenId: string) => Promise<GetCreatorApiResponse>;

export type ScoreCandidateArgs = {
  config: BrandFitConfig;
  candidate: MarketplaceCandidate;
  fetchDetail: FetchCreatorDetail;
};

export type ScoreCandidateResult =
  | { ok: false; stage: "fit"; rejectedBy: "region" | "followers" | "category" }
  | { ok: false; stage: "parse"; code: number; message: string }
  | {
      ok: true;
      fitSubScore: number;
      metrics: TransformedCreatorMetrics;
      score: CompositeScoreResult;
    };

export async function scoreCandidate(args: ScoreCandidateArgs): Promise<ScoreCandidateResult> {
  const { config, candidate, fetchDetail } = args;

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

  return {
    ok: true,
    fitSubScore: fit.fitSubScore,
    metrics: scored.metrics,
    score: scored.score,
  };
}
