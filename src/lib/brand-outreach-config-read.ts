import "server-only";

// SECURITY: This module reads a brand's outreach configuration via the service-role
// Supabase client, which bypasses RLS. It is server-only (see the import above) and
// must NEVER be imported into client/browser code. Per-user isolation is enforced by
// the .eq("user_id", userId) filter, NOT by the database — userId must come from the
// server-validated session. It never logs row contents and fails closed.

import { getSupabaseServerClient } from "./supabase-server";
import type { BrandOutreachConfig } from "./outreach-readiness";

export type BrandOutreachRow = {
  tiktok_product_ids: string[];
  seller_contact_email: string | null;
  has_free_sample: boolean;
  is_sample_approval_exempt: boolean;
  collaboration_duration_days: number;
  commission_rate: number | string; // PostgREST numerics arrive as strings
};

export type GetBrandOutreachConfigResult =
  | { ok: true; config: BrandOutreachConfig }
  | { ok: false; reason: "not_found" | "query_failed" | "malformed" };

export type FetchBrandOutreachRow = (
  brandId: string,
  userId: string,
) => Promise<{ ok: true; row: BrandOutreachRow | null } | { ok: false }>;

const SELECT_COLUMNS =
  "tiktok_product_ids, seller_contact_email, has_free_sample, is_sample_approval_exempt, collaboration_duration_days, commission_rate";

// SECURITY: service-role client bypasses RLS, so the .eq("user_id", userId) filter below
// is what enforces per-user isolation. userId MUST come from the server-validated session
// (caller's responsibility), never from client input. Never logs row contents.
const defaultFetchBrandOutreachRow: FetchBrandOutreachRow = async (brandId, userId) => {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .select(SELECT_COLUMNS)
      .eq("id", brandId)
      .eq("user_id", userId)
      .maybeSingle<BrandOutreachRow>();
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

function rowToConfig(row: BrandOutreachRow): BrandOutreachConfig | null {
  const commissionRatePercent = toFiniteNumber(row.commission_rate);
  if (commissionRatePercent === null) return null;
  return {
    tiktokProductIds: row.tiktok_product_ids,
    sellerContactEmail: row.seller_contact_email,
    hasFreeSample: row.has_free_sample,
    isSampleApprovalExempt: row.is_sample_approval_exempt,
    collaborationDurationDays: row.collaboration_duration_days,
    commissionRatePercent,
  };
}

export async function getBrandOutreachConfig(
  brandId: string,
  userId: string,
  fetchRow: FetchBrandOutreachRow = defaultFetchBrandOutreachRow,
): Promise<GetBrandOutreachConfigResult> {
  const res = await fetchRow(brandId, userId);
  if (!res.ok) return { ok: false, reason: "query_failed" };
  if (res.row === null) return { ok: false, reason: "not_found" };
  const config = rowToConfig(res.row);
  if (config === null) return { ok: false, reason: "malformed" };
  return { ok: true, config };
}
