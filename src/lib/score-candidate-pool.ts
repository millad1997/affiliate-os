// src/lib/score-candidate-pool.ts
// Pool scorer: maps scoreCandidate over a candidate pool, producing the ScoredEntry[] that
// buildOutreachPlan consumes. This is the composition root of the OFFLINE pipeline:
//   pool -> (per-candidate: cheap fit gate -> detail fetch -> score -> optional GMV floor)
//        -> ScoredEntry[] -> buildOutreachPlan.
// Pure: the detail fetcher is injected (the live fetcher is wired by the caller later), so
// this runs fully on fixtures. The cheap-gate-before-expensive-fetch economics live inside
// scoreCandidate; this layer just threads the pool through and pairs each result with its
// creatorOpenId (which scoreCandidate's own result does not carry). Scoring is sequential:
// deterministic output order, conservative on the quota-bound detail calls. Concurrency and
// rate-limiting are the live fetcher's concern, not this layer's.

import { scoreCandidate, type FetchCreatorDetail } from "./score-candidate";
import type { BrandFitConfig } from "./fit-score";
import type { MarketplaceCandidate } from "./tiktok-marketplace-search-parse";
import type { GmvFloorConfig } from "./gmv-floor";
import type { ScoredEntry } from "./outreach-plan";

export type ScorePoolArgs = {
  config: BrandFitConfig;
  candidates: MarketplaceCandidate[];
  fetchDetail: FetchCreatorDetail;
  gmvFloorConfig?: GmvFloorConfig;
};

export async function scoreCandidatePool(args: ScorePoolArgs): Promise<ScoredEntry[]> {
  const { config, candidates, fetchDetail, gmvFloorConfig } = args;

  const entries: ScoredEntry[] = [];
  for (const candidate of candidates) {
    const result = await scoreCandidate({ config, candidate, fetchDetail, gmvFloorConfig });
    entries.push({ creatorOpenId: candidate.creatorOpenId, result });
  }
  return entries;
}
