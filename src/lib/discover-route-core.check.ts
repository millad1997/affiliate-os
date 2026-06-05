// src/lib/discover-route-core.check.ts
// Positive-control script for discover-route-core.
// Run with: npx tsx src/lib/discover-route-core.check.ts

import { handleDiscoverRequest, type DiscoverRouteDeps } from "./discover-route-core";
import type { PipelineConfigs } from "./brand-config";
import type { OutreachPlan } from "./outreach-plan";
import type { PagedDiscoverArgs, PagedDiscoverResult } from "./discover-score-plan-paged";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_CONFIGS: PipelineConfigs = {
  fitConfig: {
    targetCategoryIds: ["health"],
    targetRegions: ["US"],
    minFollowers: null,
    gates: { region: true, followers: false, category: false },
  },
  policy: { maxInvites: 10, commissionRate: 0.15 },
  gmvFloorConfig: { minGmvFloor: 500 },
};

const FAKE_PLAN = {} as OutreachPlan;

// ── Stubs ─────────────────────────────────────────────────────────────────────

// Never reached in these tests (runPaged mock bypasses both fetchers).
const noopFetchSearch: DiscoverRouteDeps["fetchSearch"] = async () => {
  throw new Error("fetchSearch stub called unexpectedly");
};
const noopFetchDetail: DiscoverRouteDeps["fetchDetail"] = async () => {
  throw new Error("fetchDetail stub called unexpectedly");
};

// ── Factories ─────────────────────────────────────────────────────────────────

function makeOkGetConfig() {
  return async (_brandId: string, _userId: string) => ({
    ok: true as const,
    configs: FAKE_CONFIGS,
  });
}

function makeFailGetConfig(reason: "not_found" | "malformed" | "query_failed") {
  return async (_brandId: string, _userId: string) => ({
    ok: false as const,
    reason,
  });
}

let lastRunPagedArgs: PagedDiscoverArgs | null = null;

function makeOkRunPaged(
  overrideResult?: Partial<Extract<PagedDiscoverResult, { ok: true }>>,
) {
  return async (args: PagedDiscoverArgs): Promise<PagedDiscoverResult> => {
    lastRunPagedArgs = args;
    return {
      ok: true,
      plan: FAKE_PLAN,
      pagesFetched: 2,
      lastNextPageToken: null,
      lastSearchKey: "sk",
      stoppedEarly: false,
      ...overrideResult,
    };
  };
}

function makeFailRunPaged() {
  return async (args: PagedDiscoverArgs): Promise<PagedDiscoverResult> => {
    lastRunPagedArgs = args;
    return { ok: false, stage: "search", code: -1, message: "transport_network_error" };
  };
}

// ── Harness ───────────────────────────────────────────────────────────────────

let failures = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.log(`FAIL: ${label}`);
    failures++;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Cases ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  // A: {} → 400 invalid_brand_id
  {
    const r = await handleDiscoverRequest({}, {
      userId: "u1",
      getConfig: makeOkGetConfig(),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
    });
    assert(
      "A: {} → 400 invalid_brand_id",
      r.status === 400 && !r.body.ok && (r.body as { error: string }).error === "invalid_brand_id",
    );
  }

  // B: { brandId: "   " } → 400 invalid_brand_id
  {
    const r = await handleDiscoverRequest({ brandId: "   " }, {
      userId: "u1",
      getConfig: makeOkGetConfig(),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
    });
    assert(
      "B: brandId whitespace-only → 400 invalid_brand_id",
      r.status === 400 && !r.body.ok && (r.body as { error: string }).error === "invalid_brand_id",
    );
  }

  // C: { brandId: 123 } → 400 invalid_brand_id
  {
    const r = await handleDiscoverRequest({ brandId: 123 }, {
      userId: "u1",
      getConfig: makeOkGetConfig(),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
    });
    assert(
      "C: brandId non-string → 400 invalid_brand_id",
      r.status === 400 && !r.body.ok && (r.body as { error: string }).error === "invalid_brand_id",
    );
  }

  // D: getConfig returns not_found → 404 brand_not_found
  {
    const r = await handleDiscoverRequest({ brandId: "b1" }, {
      userId: "u1",
      getConfig: makeFailGetConfig("not_found"),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
    });
    assert(
      "D: not_found → 404 brand_not_found",
      r.status === 404 && !r.body.ok && (r.body as { error: string }).error === "brand_not_found",
    );
  }

  // E: reason malformed → 500 brand_config_malformed
  {
    const r = await handleDiscoverRequest({ brandId: "b1" }, {
      userId: "u1",
      getConfig: makeFailGetConfig("malformed"),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
    });
    assert(
      "E: malformed → 500 brand_config_malformed",
      r.status === 500 && !r.body.ok && (r.body as { error: string }).error === "brand_config_malformed",
    );
  }

  // F: reason query_failed → 500 brand_config_unavailable
  {
    const r = await handleDiscoverRequest({ brandId: "b1" }, {
      userId: "u1",
      getConfig: makeFailGetConfig("query_failed"),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
    });
    assert(
      "F: query_failed → 500 brand_config_unavailable",
      r.status === 500 && !r.body.ok && (r.body as { error: string }).error === "brand_config_unavailable",
    );
  }

  // G: ok path — response shape and recorded runPaged args
  {
    lastRunPagedArgs = null;
    const r = await handleDiscoverRequest({ brandId: "b1" }, {
      userId: "u1",
      getConfig: makeOkGetConfig(),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
      runPaged: makeOkRunPaged(),
    });
    assert("G: status 200", r.status === 200);
    assert("G: body.ok true", r.body.ok === true);
    assert(
      "G: body.plan === FAKE_PLAN",
      r.body.ok && (r.body as { plan: OutreachPlan }).plan === FAKE_PLAN,
    );
    assert(
      "G: body.pagesFetched 2",
      r.body.ok && (r.body as { pagesFetched: number }).pagesFetched === 2,
    );
    assert(
      "G: args.config === FAKE_CONFIGS.fitConfig",
      lastRunPagedArgs !== null && lastRunPagedArgs.config === FAKE_CONFIGS.fitConfig,
    );
    assert(
      "G: args.policy === FAKE_CONFIGS.policy",
      lastRunPagedArgs !== null && lastRunPagedArgs.policy === FAKE_CONFIGS.policy,
    );
    assert(
      "G: args.gmvFloorConfig === FAKE_CONFIGS.gmvFloorConfig",
      lastRunPagedArgs !== null && lastRunPagedArgs.gmvFloorConfig === FAKE_CONFIGS.gmvFloorConfig,
    );
    assert(
      "G: args.searchArgs.pageSize === 20",
      lastRunPagedArgs !== null && lastRunPagedArgs.searchArgs.pageSize === 20,
    );
    assert(
      "G: args.searchArgs.body === undefined",
      lastRunPagedArgs !== null && lastRunPagedArgs.searchArgs.body === undefined,
    );
    assert(
      "G: args.maxPages === 3",
      lastRunPagedArgs !== null && lastRunPagedArgs.maxPages === 3,
    );
  }

  // H: overrides + maxPages clamped to MAX_MAX_PAGES (5)
  {
    lastRunPagedArgs = null;
    const r = await handleDiscoverRequest(
      {
        brandId: "b1",
        maxPages: 99,
        overrides: {
          keyword: " testosterone ",
          minFollowers: 1000,
          gmvRanges: ["GMV_RANGE_10000_AND_ABOVE"],
        },
      },
      {
        userId: "u1",
        getConfig: makeOkGetConfig(),
        fetchSearch: noopFetchSearch,
        fetchDetail: noopFetchDetail,
        runPaged: makeOkRunPaged(),
      },
    );
    assert("H: status 200", r.status === 200);
    assert(
      "H: searchArgs.body deep-equals expected",
      lastRunPagedArgs !== null &&
        deepEqual(lastRunPagedArgs.searchArgs.body, {
          keyword: "testosterone",
          count_range: { count_ge: 1000 },
          gmv_ranges: ["GMV_RANGE_10000_AND_ABOVE"],
        }),
    );
    assert(
      "H: maxPages clamped to 5",
      lastRunPagedArgs !== null && lastRunPagedArgs.maxPages === 5,
    );
  }

  // I: overrides.keyword not a string → 400 invalid_overrides
  {
    const r = await handleDiscoverRequest(
      { brandId: "b1", overrides: { keyword: 5 } },
      {
        userId: "u1",
        getConfig: makeOkGetConfig(),
        fetchSearch: noopFetchSearch,
        fetchDetail: noopFetchDetail,
      },
    );
    assert(
      "I: keyword non-string → 400 invalid_overrides",
      r.status === 400 && !r.body.ok && (r.body as { error: string }).error === "invalid_overrides",
    );
  }

  // J: overrides.gmvRanges with bogus value → 400 invalid_overrides
  {
    const r = await handleDiscoverRequest(
      { brandId: "b1", overrides: { gmvRanges: ["BOGUS"] } },
      {
        userId: "u1",
        getConfig: makeOkGetConfig(),
        fetchSearch: noopFetchSearch,
        fetchDetail: noopFetchDetail,
      },
    );
    assert(
      "J: bogus gmvRange → 400 invalid_overrides",
      r.status === 400 && !r.body.ok && (r.body as { error: string }).error === "invalid_overrides",
    );
  }

  // K: minFollowers negative → 400; minFollowers non-integer → 400
  {
    const r1 = await handleDiscoverRequest(
      { brandId: "b1", overrides: { minFollowers: -1 } },
      {
        userId: "u1",
        getConfig: makeOkGetConfig(),
        fetchSearch: noopFetchSearch,
        fetchDetail: noopFetchDetail,
      },
    );
    assert(
      "K: minFollowers -1 → 400 invalid_overrides",
      r1.status === 400 && !r1.body.ok && (r1.body as { error: string }).error === "invalid_overrides",
    );

    const r2 = await handleDiscoverRequest(
      { brandId: "b1", overrides: { minFollowers: 12.5 } },
      {
        userId: "u1",
        getConfig: makeOkGetConfig(),
        fetchSearch: noopFetchSearch,
        fetchDetail: noopFetchDetail,
      },
    );
    assert(
      "K: minFollowers 12.5 → 400 invalid_overrides",
      r2.status === 400 && !r2.body.ok && (r2.body as { error: string }).error === "invalid_overrides",
    );
  }

  // L: maxPages "abc" → 400 invalid_max_pages
  {
    const r = await handleDiscoverRequest({ brandId: "b1", maxPages: "abc" }, {
      userId: "u1",
      getConfig: makeOkGetConfig(),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
    });
    assert(
      "L: maxPages string → 400 invalid_max_pages",
      r.status === 400 && !r.body.ok && (r.body as { error: string }).error === "invalid_max_pages",
    );
  }

  // M: runPaged returns ok:false → 502 discovery_search_failed (code/message passed through)
  {
    const r = await handleDiscoverRequest({ brandId: "b1" }, {
      userId: "u1",
      getConfig: makeOkGetConfig(),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
      runPaged: makeFailRunPaged(),
    });
    assert("M: status 502", r.status === 502);
    assert(
      "M: error discovery_search_failed",
      !r.body.ok && (r.body as { error: string }).error === "discovery_search_failed",
    );
    assert(
      "M: stage search",
      !r.body.ok && (r.body as { stage?: string }).stage === "search",
    );
    assert(
      "M: code -1",
      !r.body.ok && (r.body as { code?: number }).code === -1,
    );
    assert(
      "M: message transport_network_error",
      !r.body.ok && (r.body as { message?: string }).message === "transport_network_error",
    );
  }

  // N: maxPages 0 → clamps to 1; maxPages -3 → clamps to 1
  {
    lastRunPagedArgs = null;
    await handleDiscoverRequest({ brandId: "b1", maxPages: 0 }, {
      userId: "u1",
      getConfig: makeOkGetConfig(),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
      runPaged: makeOkRunPaged(),
    });
    assert(
      "N: maxPages 0 → recorded maxPages 1",
      lastRunPagedArgs !== null && lastRunPagedArgs.maxPages === 1,
    );

    lastRunPagedArgs = null;
    await handleDiscoverRequest({ brandId: "b1", maxPages: -3 }, {
      userId: "u1",
      getConfig: makeOkGetConfig(),
      fetchSearch: noopFetchSearch,
      fetchDetail: noopFetchDetail,
      runPaged: makeOkRunPaged(),
    });
    assert(
      "N: maxPages -3 → recorded maxPages 1",
      lastRunPagedArgs !== null && lastRunPagedArgs.maxPages === 1,
    );
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
