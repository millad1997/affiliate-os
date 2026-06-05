import "server-only";

// SECURITY: Reads/writes discovery_runs via the service-role Supabase client, which
// bypasses RLS. Server-only (see import above) — never import into client/browser code.
// Per-user isolation is enforced by the .eq("user_id", userId) filter, NOT the database;
// userId / insert.user_id MUST originate from the server-validated session (caller's
// responsibility), never client input. Never logs row contents; fails closed.

import { getSupabaseServerClient } from "./supabase-server";
import type { DiscoveryRunInsert } from "./discovery-run-row";
import type { OutreachPlan } from "./outreach-plan";
import type { MarketplaceSearchBody } from "./tiktok-marketplace-request";

export type DiscoveryRun = {
  id: string;
  userId: string;
  brandId: string;
  createdAt: string;
  overrides: MarketplaceSearchBody | null;
  maxPages: number;
  plan: OutreachPlan;
  pagesFetched: number;
  stoppedEarly: boolean;
  stopReason: { code: number; message: string } | null;
  creatorCount: number;
};

type DiscoveryRunRow = {
  id: string;
  user_id: string;
  brand_id: string;
  created_at: string;
  overrides: MarketplaceSearchBody | null;
  max_pages: number;
  plan: OutreachPlan;
  pages_fetched: number;
  stopped_early: boolean;
  stop_reason: { code: number; message: string } | null;
  creator_count: number;
};

const SELECT_COLUMNS =
  "id, user_id, brand_id, created_at, overrides, max_pages, plan, " +
  "pages_fetched, stopped_early, stop_reason, creator_count";

function rowToRun(row: DiscoveryRunRow): DiscoveryRun {
  return {
    id: row.id,
    userId: row.user_id,
    brandId: row.brand_id,
    createdAt: row.created_at,
    overrides: row.overrides,
    maxPages: row.max_pages,
    plan: row.plan,
    pagesFetched: row.pages_fetched,
    stoppedEarly: row.stopped_early,
    stopReason: row.stop_reason,
    creatorCount: row.creator_count,
  };
}

export type StoreDiscoveryRunResult =
  | { ok: true; id: string }
  | { ok: false; reason: "insert_failed" };

// Insert one discovery run. insert.user_id MUST come from the server-validated session.
// Never logs the row; returns a fixed, value-free reason on failure.
export async function storeDiscoveryRun(
  insert: DiscoveryRunInsert,
): Promise<StoreDiscoveryRunResult> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("discovery_runs")
      .insert(insert)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !data) return { ok: false, reason: "insert_failed" };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, reason: "insert_failed" };
  }
}

export type GetDiscoveryRunResult =
  | { ok: true; run: DiscoveryRun }
  | { ok: false; reason: "not_found" | "query_failed" };

// Read one run, double-scoped by id + user_id. The .eq("user_id", userId) filter is what
// enforces tenant isolation (service-role bypasses RLS). userId MUST come from session.
export async function getDiscoveryRun(
  runId: string,
  userId: string,
): Promise<GetDiscoveryRunResult> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("discovery_runs")
      .select(SELECT_COLUMNS)
      .eq("id", runId)
      .eq("user_id", userId)
      .maybeSingle<DiscoveryRunRow>();
    if (error) return { ok: false, reason: "query_failed" };
    if (!data) return { ok: false, reason: "not_found" };
    return { ok: true, run: rowToRun(data) };
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}
