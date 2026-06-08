// brand-claims-route-core.ts
//
// SECURITY: Pure orchestration for the brand approved-claims update endpoint — no
// `import "server-only"`, safe under plain npx tsx. Same invariants as the invite-decision
// handlers:
//   • Same-origin guard (CSRF) via the shared isSameOrigin.
//   • userId is taken ONLY from deps (the server-validated session), NEVER the body.
//   • the write is delegated to an injected update (real impl is server-only, scoped by
//     id + user_id).
// approvedClaims MAY be an empty string — that clears the claim library — so only its TYPE
// is validated here; trimming/clamping/null-coercion is the server module's job. All error
// strings are fixed constants; no header, body value, or secret ever appears in a response.

import type { UpdateBrandApprovedClaimsResult } from "./brand-content-write";
import { isSameOrigin, type SameOriginHeaders } from "./same-origin-guard";

type UpdateClaimsFn = (args: {
  brandId: string;
  userId: string;
  approvedClaims: string;
}) => Promise<UpdateBrandApprovedClaimsResult>;

export type UpdateBrandClaimsRequestHeaders = SameOriginHeaders;

export type UpdateBrandClaimsRouteDeps = {
  userId: string; // MUST originate from the server-validated session
  update: UpdateClaimsFn; // injected; real one is updateBrandApprovedClaims (server-only)
};

export type UpdateBrandClaimsResponseBody =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateBrandClaimsRouteResult = {
  status: number;
  body: UpdateBrandClaimsResponseBody;
};

export async function handleUpdateBrandClaimsRequest(
  headers: UpdateBrandClaimsRequestHeaders,
  rawBody: unknown,
  deps: UpdateBrandClaimsRouteDeps,
): Promise<UpdateBrandClaimsRouteResult> {
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
  const approvedClaims = raw["approvedClaims"];
  if (typeof approvedClaims !== "string") {
    return { status: 400, body: { ok: false, error: "invalid_approved_claims" } };
  }

  // 3. Delegate. userId comes from deps (session), NOT the body. approvedClaims is passed
  //    through as-is; the server module trims/clamps/null-coerces.
  const result = await deps.update({
    brandId: brandId.trim(),
    userId: deps.userId,
    approvedClaims,
  });

  // 4. Map the result to an HTTP-shaped response.
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
