import "server-only";

// SECURITY: This module reads a brand's stored configuration via the service-role
// Supabase client, which bypasses RLS. It is server-only (see the import above) and
// must NEVER be imported into client/browser code. Per-user isolation is enforced by
// the .eq("user_id", userId) filter, NOT by the database — userId must come from the
// server-validated session. It never logs row contents and fails closed.

import { getSupabaseServerClient } from "./supabase-server";
import { brandConfigToPipelineConfigs, type BrandConfigInput, type PipelineConfigs } from "./brand-config";

// snake_case DB row. NOTE: numeric columns (commission_rate, min_gmv_floor) arrive from
// PostgREST as STRINGS; integer columns (min_followers, max_invites) arrive as numbers.
export type BrandConfigRow = {
  target_category_ids: string[];
  target_regions: string[];
  min_followers: number | null;
  gate_region: boolean;
  gate_followers: boolean;
  gate_category: boolean;
  max_invites: number;
  commission_rate: number | string;
  min_gmv_floor: number | string | null;
};

export type GetBrandConfigResult =
  | { ok: true; configs: PipelineConfigs }
  | { ok: false; reason: "not_found" | "query_failed" | "malformed" };

// Injected row fetcher (DI seam for tests). Default does the real service-role read.
export type FetchBrandRow = (
  brandId: string,
  userId: string,
) => Promise<{ ok: true; row: BrandConfigRow | null } | { ok: false }>;

const SELECT_COLUMNS =
  "target_category_ids, target_regions, min_followers, gate_region, gate_followers, gate_category, max_invites, commission_rate, min_gmv_floor";

// SECURITY: service-role client bypasses RLS, so the .eq("user_id", userId) filter below
// is what enforces per-user isolation. userId MUST come from the server-validated session
// (caller's responsibility), never from client input. Never logs row contents.
const defaultFetchBrandRow: FetchBrandRow = async (brandId, userId) => {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .select(SELECT_COLUMNS)
      .eq("id", brandId)
      .eq("user_id", userId)
      .maybeSingle<BrandConfigRow>();
    if (error) return { ok: false };
    return { ok: true, row: data ?? null };
  } catch {
    return { ok: false };
  }
};

// Coerce a numeric-or-string to a finite number, else null.
function toFiniteNumber(v: number | string): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Map the snake_case row into BrandConfigInput, coercing the numeric columns. Returns null
// if a required numeric is malformed (shouldn't happen given NOT NULL defaults, but fail-closed).
function rowToInput(row: BrandConfigRow): BrandConfigInput | null {
  const commissionRate = toFiniteNumber(row.commission_rate);
  if (commissionRate === null) return null;
  let minGmvFloor: number | null = null;
  if (row.min_gmv_floor !== null) {
    minGmvFloor = toFiniteNumber(row.min_gmv_floor);
    if (minGmvFloor === null) return null;
  }
  return {
    targetCategoryIds: row.target_category_ids,
    targetRegions: row.target_regions,
    minFollowers: row.min_followers,
    gateRegion: row.gate_region,
    gateFollowers: row.gate_followers,
    gateCategory: row.gate_category,
    maxInvites: row.max_invites,
    commissionRate,
    minGmvFloor,
  };
}

export async function getBrandConfig(
  brandId: string,
  userId: string,
  fetchRow: FetchBrandRow = defaultFetchBrandRow,
): Promise<GetBrandConfigResult> {
  const res = await fetchRow(brandId, userId);
  if (!res.ok) return { ok: false, reason: "query_failed" };
  if (res.row === null) return { ok: false, reason: "not_found" };
  const input = rowToInput(res.row);
  if (input === null) return { ok: false, reason: "malformed" };
  return { ok: true, configs: brandConfigToPipelineConfigs(input) };
}
