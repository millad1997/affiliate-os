// src/lib/outreach-plan.ts
// Outreach decision engine (V1): turns scored survivors into a ranked, capped invite plan.
// This is the "brain -> plan" layer that sits directly on scoreCandidate's output. It is a
// PURE module, fully fixture-testable. Producing the plan is gate-free; SENDING it (TikTok
// Targeted Collaboration write API) is a separate, gated layer and is NOT part of this module.
//
// V1 policy (all operator-set config, nothing baked in):
//   - eligible := the ok:true (scored) entries. fit/parse rejects are ignored here.
//   - rank eligible by composite score, high to low (no tiebreak in V1; sort is stable, so
//     equal composites keep input order).
//   - select the top `maxInvites`; the remaining eligible entries are "capped out".
//   - attach the brand's flat `commissionRate` to each selected invite (pass-through).
//   - each invite carries effectiveGmv, derived by deriveEffectiveGmv — the SAME function
//     the GMV floor uses — so the plan's GMV can never drift from the floor's filter basis.

import type { ScoreCandidateResult } from "./score-candidate";
import { deriveEffectiveGmv } from "./gmv-floor";

export type OutreachPolicyConfig = {
  maxInvites: number;      // invite-count cap for this batch
  commissionRate: number;  // flat brand rate, pass-through (units operator-defined, e.g. 15 = 15%)
};

export type ScoredEntry = {
  creatorOpenId: string;
  result: ScoreCandidateResult;
};

export type InvitePlanItem = {
  creatorOpenId: string;
  composite: number;
  commissionRate: number;
  effectiveGmv: number | null;
};

export type OutreachPlan = {
  invites: InvitePlanItem[];  // selected, ordered by composite descending
  eligibleCount: number;      // total ok:true (scored) entries supplied
  selectedCount: number;      // invites.length === min(eligibleCount, maxInvites)
  cappedOutCount: number;     // eligible entries beyond the cap (eligibleCount - selectedCount)
};

type EligibleEntry = {
  creatorOpenId: string;
  result: Extract<ScoreCandidateResult, { ok: true }>;
};

export function buildOutreachPlan(
  config: OutreachPolicyConfig,
  entries: ScoredEntry[],
): OutreachPlan {
  // Eligible = the scored survivors. Fit/parse rejects are not outreach candidates.
  const eligible = entries.filter(
    (e): e is EligibleEntry => e.result.ok === true,
  );

  // Rank by composite, high to low. No V1 tiebreak; the sort is stable so equal
  // composites preserve input order.
  const ranked = [...eligible].sort(
    (a, b) => b.result.score.composite - a.result.score.composite,
  );

  // Select the top N (cap floored at 0).
  const selected = ranked.slice(0, Math.max(0, config.maxInvites));

  const invites: InvitePlanItem[] = selected.map((e) => ({
    creatorOpenId: e.creatorOpenId,
    composite: e.result.score.composite,
    commissionRate: config.commissionRate,
    effectiveGmv: deriveEffectiveGmv(e.result.metrics),
  }));

  return {
    invites,
    eligibleCount: eligible.length,
    selectedCount: invites.length,
    cappedOutCount: eligible.length - invites.length,
  };
}
