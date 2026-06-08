import "server-only";

// SECURITY: Writes a brand's approved_claims free-text column via the service-role Supabase
// client, which bypasses RLS. Server-only (see import) — never import into client/browser
// code. Per-user isolation is enforced by the .eq("id", brandId).eq("user_id", userId) scope
// on the update, NOT by the database: a write targeting a brand the caller does not own
// matches zero rows -> brand_not_found, and nothing is written. userId MUST come from the
// server-validated session, never client input. Mirrors brand-content-read.ts's discipline.
import { getSupabaseServerClient } from "./supabase-server";

// Mirror the create route's clamp (MAX_TEXT_FIELD) so update and insert agree on bounds.
const MAX_APPROVED_CLAIMS = 6000;

export type UpdateBrandApprovedClaimsResult =
  | { ok: true }
  | { ok: false; reason: "brand_not_found" | "update_failed" };

// Update one brand's approved_claims. The raw text is trimmed and clamped; a blank value is
// stored as null (matching the create path's "blank => null", so parseApprovedClaims yields
// []). The scoped update IS the isolation boundary; a zero-row result (unknown brand or not
// owned — indistinguishable, by design) yields brand_not_found. Never logs row contents.
export async function updateBrandApprovedClaims(args: {
  brandId: string;
  userId: string;
  approvedClaims: string;
}): Promise<UpdateBrandApprovedClaimsResult> {
  const { brandId, userId, approvedClaims } = args;

  const trimmed = approvedClaims.trim();
  const value = trimmed.length === 0 ? null : trimmed.slice(0, MAX_APPROVED_CLAIMS);

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .update({ approved_claims: value })
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
