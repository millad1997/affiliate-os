// brand-text-fields.ts
//
// SECURITY / PURITY: PURE allowlist module — NO `import "server-only"`, no DB, no secrets.
// Single source of truth for WHICH free-text brand columns are editable in-app. Imported by
// both the pure route-core (request validation) and the server-only write module (column
// allowlist). Keeping the allowlist here — not derived from client input — is the safety
// boundary: an arbitrary client string can never become a column name in an UPDATE.
//
// NOTE: `approved_claims` is intentionally NOT in this set. It has its own dedicated
// write/route/editor path with claim-specific semantics and is left untouched.

export const BRAND_TEXT_FIELDS = [
  "description",
  "commission_context",
  "exclusion_list",
] as const;

export type BrandTextField = (typeof BRAND_TEXT_FIELDS)[number];

// Runtime membership check used by the route-core to reject unknown field keys.
export function isBrandTextField(value: unknown): value is BrandTextField {
  return (
    typeof value === "string" &&
    (BRAND_TEXT_FIELDS as readonly string[]).includes(value)
  );
}
