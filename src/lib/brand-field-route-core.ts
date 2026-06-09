// brand-field-route-core.ts
//
// SECURITY: Pure orchestration for the editable-brand-field update endpoint — no
// `import "server-only"`, safe under plain npx tsx. Same invariants as the claims handler:
//   • Same-origin guard (CSRF) via the shared isSameOrigin.
//   • userId is taken ONLY from deps (the server-validated session), NEVER the body.
//   • `field` MUST be one of the BrandTextField allowlist (isBrandTextField) — an unknown or
//     non-string field is rejected here BEFORE the write is ever called, so a client can never
//     name an arbitrary column (and `approved_claims`, deliberately excluded, can't be reached
//     through this generic route — it keeps its own dedicated path).
//   • the write is delegated to an injected update (real impl is server-only, scoped id+user).
// `value` MAY be an empty string — that clears the field — so only its TYPE is validated here;
// trimming/clamping/null-coercion is the server module's job. All error strings are fixed
// constants; no header, body value, or secret ever appears in a response.

import type { UpdateBrandTextFieldResult } from "./brand-content-write";
import { isBrandTextField, type BrandTextField } from "./brand-text-fields";
import { isSameOrigin, type SameOriginHeaders } from "./same-origin-guard";

type UpdateTextFieldFn = (args: {
  brandId: string;
  userId: string;
  field: BrandTextField;
  value: string;
}) => Promise<UpdateBrandTextFieldResult>;

export type UpdateBrandFieldRequestHeaders = SameOriginHeaders;

export type UpdateBrandFieldRouteDeps = {
  userId: string; // MUST originate from the server-validated session
  update: UpdateTextFieldFn; // injected; real one is updateBrandTextField (server-only)
};

export type UpdateBrandFieldResponseBody =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateBrandFieldRouteResult = {
  status: number;
  body: UpdateBrandFieldResponseBody;
};

export async function handleUpdateBrandFieldRequest(
  headers: UpdateBrandFieldRequestHeaders,
  rawBody: unknown,
  deps: UpdateBrandFieldRouteDeps,
): Promise<UpdateBrandFieldRouteResult> {
  // 1. Same-origin guard (CSRF).
  if (!isSameOrigin(headers)) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }

  // 2. Validate body shape.
  if (typeof rawBody !== "object" || rawBody === null) {
    return { status: 400, body: { ok: false, error: "invalid_request" } };
  }
  const raw = rawBody as Record<string, unknown>;

  const brandId = raw["brandId"];
  if (typeof brandId !== "string" || brandId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_brand_id" } };
  }

  // 3. Field MUST be allowlisted — rejected before any write is attempted.
  const field = raw["field"];
  if (!isBrandTextField(field)) {
    return { status: 400, body: { ok: false, error: "invalid_field" } };
  }

  // 4. Value must be a string; empty string is allowed (clears the field).
  const value = raw["value"];
  if (typeof value !== "string") {
    return { status: 400, body: { ok: false, error: "invalid_value" } };
  }

  // 5. Delegate. userId comes from deps (session), NOT the body. value passed through as-is;
  //    the server module trims/clamps/null-coerces.
  const result = await deps.update({
    brandId: brandId.trim(),
    userId: deps.userId,
    field,
    value,
  });

  // 6. Map the result to an HTTP-shaped response.
  if (result.ok) {
    return { status: 200, body: { ok: true } };
  }
  switch (result.reason) {
    case "brand_not_found":
      return { status: 404, body: { ok: false, error: "brand_not_found" } };
    case "update_failed":
      return { status: 500, body: { ok: false, error: "update_failed" } };
  }
}
