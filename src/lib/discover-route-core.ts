// src/lib/discover-route-core.ts
//
// SECURITY: Pure orchestration module — no `import "server-only"`, safe to run
// under plain npx tsx. All error strings returned here are FIXED CONSTANTS; no
// user data, env value, token, secret, or key ever appears in this module.
// The only values threaded through unchanged are the discovery pipeline's own
// pre-coerced, value-free `code` and `message` fields (produced by
// tiktok-creator-search-fetcher under its separate security contract). Tokens,
// secrets, and shop ciphers live exclusively in the route shell that wires the
// real server-only fetchers — they are NEVER present here.

import { discoverScoreAndPlanPaged, type PagedDiscoverArgs, type PagedDiscoverResult } from "./discover-score-plan-paged";
import type { FetchCreatorSearch, SearchCreatorsArgs } from "./tiktok-creator-search-fetcher";
import type { FetchCreatorDetail } from "./score-candidate";
import type { PipelineConfigs } from "./brand-config";
import type { GetBrandConfigResult } from "./brand-config-read";
import type { MarketplaceSearchBody, GmvRange } from "./tiktok-marketplace-request";
import type { OutreachPlan } from "./outreach-plan";

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE: 12 | 20 = 20;
const DEFAULT_MAX_PAGES = 3;
const MIN_MAX_PAGES = 1;
const MAX_MAX_PAGES = 5;
const KEYWORD_MAX_LEN = 200;
const ALLOWED_GMV_RANGES: readonly GmvRange[] = [
  "GMV_RANGE_0_100",
  "GMV_RANGE_100_1000",
  "GMV_RANGE_1000_10000",
  "GMV_RANGE_10000_AND_ABOVE",
];

// ── Injected-dependency types ────────────────────────────────────────────────

type GetConfigFn = (brandId: string, userId: string) => Promise<GetBrandConfigResult>;
type RunPagedFn = (args: PagedDiscoverArgs) => Promise<PagedDiscoverResult>;

// ── Exported types ───────────────────────────────────────────────────────────

export type DiscoverRouteDeps = {
  userId: string;
  getConfig: GetConfigFn;          // injected (real one is server-only)
  fetchSearch: FetchCreatorSearch; // injected
  fetchDetail: FetchCreatorDetail; // injected
  runPaged?: RunPagedFn;           // default: discoverScoreAndPlanPaged
};

export type DiscoverResponseBody =
  | {
      ok: true;
      plan: OutreachPlan;
      pagesFetched: number;
      lastNextPageToken: string | null;
      lastSearchKey: string | null;
      stoppedEarly: boolean;
      stopReason?: { code: number; message: string };
    }
  | { ok: false; error: string; stage?: "search"; code?: number; message?: string };

export type DiscoverRouteResult = { status: number; body: DiscoverResponseBody };

// ── Orchestration ────────────────────────────────────────────────────────────

export async function handleDiscoverRequest(
  rawBody: unknown,
  deps: DiscoverRouteDeps,
): Promise<DiscoverRouteResult> {
  // 1. Validate rawBody is a non-null object.
  if (typeof rawBody !== "object" || rawBody === null) {
    return { status: 400, body: { ok: false, error: "invalid_brand_id" } };
  }

  const raw = rawBody as Record<string, unknown>;

  // 2. Validate brandId.
  const brandId = raw["brandId"];
  if (typeof brandId !== "string" || brandId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_brand_id" } };
  }

  // 3. Validate optional maxPages.
  let maxPages = DEFAULT_MAX_PAGES;
  if ("maxPages" in raw && raw["maxPages"] !== undefined) {
    const mp = raw["maxPages"];
    if (typeof mp !== "number" || !Number.isFinite(mp)) {
      return { status: 400, body: { ok: false, error: "invalid_max_pages" } };
    }
    maxPages = Math.min(MAX_MAX_PAGES, Math.max(MIN_MAX_PAGES, Math.floor(mp)));
  }

  // 4. Validate optional overrides object.
  let keyword: string | undefined;
  let minFollowers: number | undefined;
  let gmvRanges: GmvRange[] | undefined;

  if ("overrides" in raw && raw["overrides"] !== undefined) {
    const ov = raw["overrides"];
    if (typeof ov !== "object" || ov === null) {
      return { status: 400, body: { ok: false, error: "invalid_overrides" } };
    }
    const overrides = ov as Record<string, unknown>;

    if ("keyword" in overrides && overrides["keyword"] !== undefined) {
      if (typeof overrides["keyword"] !== "string") {
        return { status: 400, body: { ok: false, error: "invalid_overrides" } };
      }
      const trimmed = overrides["keyword"].trim();
      if (trimmed.length > KEYWORD_MAX_LEN) {
        return { status: 400, body: { ok: false, error: "invalid_overrides" } };
      }
      if (trimmed.length > 0) keyword = trimmed;
    }

    if ("minFollowers" in overrides && overrides["minFollowers"] !== undefined) {
      const mf = overrides["minFollowers"];
      if (
        typeof mf !== "number" ||
        !Number.isFinite(mf) ||
        !Number.isInteger(mf) ||
        mf < 0
      ) {
        return { status: 400, body: { ok: false, error: "invalid_overrides" } };
      }
      minFollowers = mf;
    }

    if ("gmvRanges" in overrides && overrides["gmvRanges"] !== undefined) {
      const gr = overrides["gmvRanges"];
      if (
        !Array.isArray(gr) ||
        !gr.every((v) => (ALLOWED_GMV_RANGES as readonly unknown[]).includes(v))
      ) {
        return { status: 400, body: { ok: false, error: "invalid_overrides" } };
      }
      gmvRanges = gr as GmvRange[];
    }
  }

  // 5. Build MarketplaceSearchBody.
  let body: MarketplaceSearchBody | undefined;
  const built: MarketplaceSearchBody = {};
  if (keyword !== undefined) built.keyword = keyword;
  if (minFollowers !== undefined) built.count_range = { count_ge: minFollowers };
  if (gmvRanges !== undefined && gmvRanges.length > 0) built.gmv_ranges = gmvRanges;
  if (Object.keys(built).length > 0) body = built;

  // 6. Fetch brand config (injected — real impl is server-only).
  const cfg = await deps.getConfig(brandId.trim(), deps.userId);
  if (!cfg.ok) {
    switch (cfg.reason) {
      case "not_found":
        return { status: 404, body: { ok: false, error: "brand_not_found" } };
      case "malformed":
        return { status: 500, body: { ok: false, error: "brand_config_malformed" } };
      case "query_failed":
        return { status: 500, body: { ok: false, error: "brand_config_unavailable" } };
    }
  }

  // 7. Run paged discovery pipeline.
  const runPaged = deps.runPaged ?? discoverScoreAndPlanPaged;
  const searchArgs: SearchCreatorsArgs = { pageSize: PAGE_SIZE, body };

  const result = await runPaged({
    fetchSearch: deps.fetchSearch,
    fetchDetail: deps.fetchDetail,
    config: cfg.configs.fitConfig,
    policy: cfg.configs.policy,
    searchArgs,
    maxPages,
    gmvFloorConfig: cfg.configs.gmvFloorConfig,
  });

  // 8. Map pipeline result to HTTP-shaped response.
  if (!result.ok) {
    return {
      status: 502,
      body: {
        ok: false,
        error: "discovery_search_failed",
        stage: result.stage,
        code: result.code,
        message: result.message,
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      plan: result.plan,
      pagesFetched: result.pagesFetched,
      lastNextPageToken: result.lastNextPageToken,
      lastSearchKey: result.lastSearchKey,
      stoppedEarly: result.stoppedEarly,
      stopReason: result.stopReason,
    },
  };
}
