import "server-only";

// SECURITY: Writes a brand's structured configuration columns via the service-role Supabase
// client, which bypasses RLS. Server-only (see import) — never import into client/browser code.
// Per-user isolation is enforced by the .eq("id", brandId).eq("user_id", userId) scope on the
// update, NOT by the database: a write targeting a brand the caller does not own matches zero
// rows -> brand_not_found, and nothing is written. userId MUST come from the server-validated
// session, never client input. Receives ALREADY-VALIDATED fields (parseBrandConfigFields runs
// in the pure route-core); this module performs NO parsing — it only writes. The column list is
// enumerated explicitly (not spread) so this write can only ever touch these nine config
// columns. Mirrors brand-content-write.ts's discipline and brand-config-read.ts's column set.

import { getSupabaseServerClient } from "./supabase-server";
import type { ParsedBrandConfigFields } from "./brand-config-input-parse";

export type UpdateBrandConfigResult =
  | { ok: true }
  | { ok: false; reason: "brand_not_found" | "update_failed" };

export async function updateBrandConfig(args: {
  brandId: string;
  userId: string;
  fields: ParsedBrandConfigFields;
}): Promise<UpdateBrandConfigResult> {
  const { brandId, userId, fields } = args;

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .update({
        target_category_ids: fields.target_category_ids,
        target_regions: fields.target_regions,
        min_followers: fields.min_followers,
        gate_region: fields.gate_region,
        gate_followers: fields.gate_followers,
        gate_category: fields.gate_category,
        max_invites: fields.max_invites,
        commission_rate: fields.commission_rate,
        min_gmv_floor: fields.min_gmv_floor,
      })
      .eq("id", brandId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) return { ok: false, reason: "update_failed" };
    if (!data) return { ok: false, reason: "brand_not_found" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "update_failed" };
  }
}
