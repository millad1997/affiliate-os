// brand-config-route-core.ts
//
// SECURITY: Pure orchestration for the brand-config update endpoint — no `import "server-only"`,
// safe under plain npx tsx. Same invariants as the other write handlers:
//   • Same-origin guard (CSRF) via the shared isSameOrigin.
//   • userId is taken ONLY from deps (the server-validated session), NEVER the body.
//   • Validation/coercion of the nine config fields is delegated to parseBrandConfigFields —
//     the SAME pure validator the create route uses, so update and insert agree exactly. Its
//     error string is passed straight through on failure (controlled vocabulary, not a secret).
//   • the write is delegated to an injected update (real impl is server-only, scoped id+user).
// All other error strings are fixed constants; no header, body value, or secret is ever echoed.

import type { UpdateBrandConfigResult } from "./brand-config-write";
import { parseBrandConfigFields, type ParsedBrandConfigFields } from "./brand-config-input-parse";
import { isSameOrigin, type SameOriginHeaders } from "./same-origin-guard";

type UpdateConfigFn = (args: {
  brandId: string;
  userId: string;
  fields: ParsedBrandConfigFields;
}) => Promise<UpdateBrandConfigResult>;

export type UpdateBrandConfigRequestHeaders = SameOriginHeaders;

export type UpdateBrandConfigRouteDeps = {
  userId: string; // MUST originate from the server-validated session
  update: UpdateConfigFn; // injected; real one is updateBrandConfig (server-only)
};

export type UpdateBrandConfigResponseBody =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateBrandConfigRouteResult = {
  status: number;
  body: UpdateBrandConfigResponseBody;
};

export async function handleUpdateBrandConfigRequest(
  headers: UpdateBrandConfigRequestHeaders,
  rawBody: unknown,
  deps: UpdateBrandConfigRouteDeps,
): Promise<UpdateBrandConfigRouteResult> {
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

  // 3. Validate + coerce the nine config fields via the SAME validator the create route uses.
  const parsed = parseBrandConfigFields(raw);
  if (!parsed.ok) {
    return { status: 400, body: { ok: false, error: parsed.error } };
  }

  // 4. Delegate. userId from deps (session), NOT the body. Fields are already validated+typed.
  const result = await deps.update({
    brandId: brandId.trim(),
    userId: deps.userId,
    fields: parsed.fields,
  });

  // 5. Map the result to an HTTP-shaped response.
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
