// src/lib/discovery-run-row.check.ts
// Golden-vector check for buildDiscoveryRunInsert (pure).
// Run with: npx tsx src/lib/discovery-run-row.check.ts

import { buildDiscoveryRunInsert } from "./discovery-run-row";
import type { OutreachPlan } from "./outreach-plan";
import type { DiscoverResponseBody } from "./discover-route-core";

type DiscoverSuccess = Extract<DiscoverResponseBody, { ok: true }>;

const PLAN: OutreachPlan = {
  invites: [
    { creatorOpenId: "c1", composite: 88, commissionRate: 0.15, effectiveGmv: 12000 },
    { creatorOpenId: "c2", composite: 71, commissionRate: 0.15, effectiveGmv: 8000 },
  ],
  eligibleCount: 5,
  selectedCount: 2,
  cappedOutCount: 3,
};

const PLAN_EMPTY: OutreachPlan = { invites: [], eligibleCount: 0, selectedCount: 0, cappedOutCount: 0 };

const BODY_WITH_OVERRIDES: DiscoverSuccess = {
  ok: true,
  plan: PLAN,
  pagesFetched: 2,
  lastNextPageToken: null,
  lastSearchKey: "sk",
  stoppedEarly: false,
  brandId: "brand-123",
  searchBody: { keyword: "testosterone", count_range: { count_ge: 1000 } },
  maxPages: 5,
};

const BODY_STOPPED: DiscoverSuccess = {
  ok: true,
  plan: PLAN,
  pagesFetched: 3,
  lastNextPageToken: "tok",
  lastSearchKey: "sk2",
  stoppedEarly: true,
  stopReason: { code: -2, message: "transport_http_429" },
  brandId: "brand-999",
  searchBody: null,
  maxPages: 3,
};

const BODY_EMPTY: DiscoverSuccess = {
  ok: true,
  plan: PLAN_EMPTY,
  pagesFetched: 1,
  lastNextPageToken: null,
  lastSearchKey: null,
  stoppedEarly: false,
  brandId: "brand-0",
  searchBody: null,
  maxPages: 1,
};

let failures = 0;
function assert(label: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) failures++;
}
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Case 1: overrides present, not stopped early
{
  const r = buildDiscoveryRunInsert("user-abc", BODY_WITH_OVERRIDES);
  assert("1: user_id", r.user_id === "user-abc");
  assert("1: brand_id", r.brand_id === "brand-123");
  assert("1: overrides deep-equals", deepEqual(r.overrides, { keyword: "testosterone", count_range: { count_ge: 1000 } }));
  assert("1: max_pages 5", r.max_pages === 5);
  assert("1: plan pass-through (same ref)", r.plan === PLAN);
  assert("1: pages_fetched 2", r.pages_fetched === 2);
  assert("1: stopped_early false", r.stopped_early === false);
  assert("1: stop_reason null", r.stop_reason === null);
  assert("1: creator_count 2", r.creator_count === 2);
}

// Case 2: stopped early, null overrides, stopReason present
{
  const r = buildDiscoveryRunInsert("user-xyz", BODY_STOPPED);
  assert("2: user_id", r.user_id === "user-xyz");
  assert("2: brand_id", r.brand_id === "brand-999");
  assert("2: overrides null", r.overrides === null);
  assert("2: max_pages 3", r.max_pages === 3);
  assert("2: stopped_early true", r.stopped_early === true);
  assert("2: stop_reason deep-equals", deepEqual(r.stop_reason, { code: -2, message: "transport_http_429" }));
  assert("2: creator_count 2", r.creator_count === 2);
}

// Case 3: empty plan → creator_count 0
{
  const r = buildDiscoveryRunInsert("u0", BODY_EMPTY);
  assert("3: creator_count 0", r.creator_count === 0);
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
