// src/lib/discovery-run-row.ts
// PURE: maps a successful discovery response into the discovery_runs insert payload
// (snake_case; omits id/created_at, which the DB defaults). No DB access, no server-only
// imports — runs under plain `npx tsx` for its check.

import type { DiscoverResponseBody } from "./discover-route-core";
import type { OutreachPlan } from "./outreach-plan";
import type { MarketplaceSearchBody } from "./tiktok-marketplace-request";

type DiscoverSuccess = Extract<DiscoverResponseBody, { ok: true }>;

export type DiscoveryRunInsert = {
  user_id: string;
  brand_id: string;
  overrides: MarketplaceSearchBody | null;
  max_pages: number;
  plan: OutreachPlan;
  pages_fetched: number;
  stopped_early: boolean;
  stop_reason: { code: number; message: string } | null;
  creator_count: number;
};

export function buildDiscoveryRunInsert(
  userId: string,
  body: DiscoverSuccess,
): DiscoveryRunInsert {
  return {
    user_id: userId,
    brand_id: body.brandId,
    overrides: body.searchBody,
    max_pages: body.maxPages,
    plan: body.plan,
    pages_fetched: body.pagesFetched,
    stopped_early: body.stoppedEarly,
    stop_reason: body.stopReason ?? null,
    creator_count: body.plan.selectedCount,
  };
}
