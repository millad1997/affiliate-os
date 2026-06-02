// src/lib/score-creator.ts
// Assembled per-creator scoring pipeline (the moat, wired offline):
//   get-creator API response -> parseGetCreatorResponse -> transformMarketplaceCreator
//   -> computeComposite.
// Takes a raw get-creator envelope, the creator's id (the parser's id passthrough),
// and the externally-computed profile-fit sub-score; returns metrics + composite, or a
// parse-stage error. Pure and fully fixture-testable: the search->get-creator network
// step and the fit-sub-score computation are deliberately out of scope.

import {
  parseGetCreatorResponse,
  type GetCreatorApiResponse,
} from "./tiktok-marketplace-parse";
import {
  transformMarketplaceCreator,
  type TransformedCreatorMetrics,
} from "./tiktok-transform";
import { computeComposite, type CompositeScoreResult } from "./composite-score";

export type ScoreCreatorArgs = {
  response: GetCreatorApiResponse;
  creatorUserId: string;
  fitSubScore: number;
};

export type ScoreCreatorResult =
  | { ok: true; metrics: TransformedCreatorMetrics; score: CompositeScoreResult }
  | { ok: false; stage: "parse"; code: number; message: string };

export function scoreCreatorFromResponse(args: ScoreCreatorArgs): ScoreCreatorResult {
  const parsed = parseGetCreatorResponse(args.response, args.creatorUserId);
  if (!parsed.ok) {
    return { ok: false, stage: "parse", code: parsed.code, message: parsed.message };
  }

  const metrics = transformMarketplaceCreator(parsed.creator);

  const score = computeComposite({
    fitSubScore: args.fitSubScore,
    gmvLast30d: metrics.gmvLast30d,
    gmvSource: metrics.gmvSource,
    gmvRange: metrics.gmvRange,
    totalGmv: metrics.totalGmv,
    avgPostsPerWeek12w: metrics.avgPostsPerWeek12w,
    postsLast30d: metrics.postsLast30d,
    likesLast30d: metrics.likesLast30d,
    commentsLast30d: metrics.commentsLast30d,
    viewsLast30d: metrics.viewsLast30d,
  });

  return { ok: true, metrics, score };
}
