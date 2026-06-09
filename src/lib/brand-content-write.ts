import "server-only";

// SECURITY: Writes a brand's approved_claims free-text column via the service-role Supabase
// client, which bypasses RLS. Server-only (see import) — never import into client/browser
// code. Per-user isolation is enforced by the .eq("id", brandId).eq("user_id", userId) scope
// on the update, NOT by the database: a write targeting a brand the caller does not own
// matches zero rows -> brand_not_found, and nothing is written. userId MUST come from the
// server-validated session, never client input. Mirrors brand-content-read.ts's discipline.
import { getSupabaseServerClient } from "./supabase-server";
import { isBrandTextField, type BrandTextField } from "./brand-text-fields";

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

// Same clamp as the approved_claims / create path, applied to each editable free-text field.
const MAX_BRAND_TEXT_FIELD = 6000;

export type UpdateBrandTextFieldResult =
  | { ok: true }
  | { ok: false; reason: "brand_not_found" | "update_failed" };

// Update one editable free-text column (description | commission_context | exclusion_list) on a
// single brand. SECURITY: `field` is constrained to the BrandTextField allowlist at compile time
// AND re-checked at runtime here (defense in depth), so an arbitrary string can never become a
// column name in the UPDATE — fail closed (no write) if it is somehow not allowlisted. Same
// isolation model as updateBrandApprovedClaims: the .eq("id", brandId).eq("user_id", userId)
// scope IS the boundary — a write targeting a brand the caller does not own matches zero rows ->
// brand_not_found, and nothing is written. userId MUST come from the server-validated session.
// value is trimmed; blank -> null (matching the create path); else clamped. Never logs contents.
export async function updateBrandTextField(args: {
  brandId: string;
  userId: string;
  field: BrandTextField;
  value: string;
}): Promise<UpdateBrandTextFieldResult> {
  const { brandId, userId, field, value } = args;

  // Defense in depth: never let a non-allowlisted key reach the UPDATE.
  if (!isBrandTextField(field)) return { ok: false, reason: "update_failed" };

  const trimmed = value.trim();
  const next = trimmed.length === 0 ? null : trimmed.slice(0, MAX_BRAND_TEXT_FIELD);

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .update({ [field]: next })
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
