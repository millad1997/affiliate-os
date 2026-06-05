// src/lib/invite-decision-route-core.ts
//
// SECURITY: Pure orchestration for the invite-decision write endpoint — no
// `import "server-only"`, safe under plain npx tsx. It upholds three invariants:
//   • Same-origin guard (CSRF defense): rejects requests whose Sec-Fetch-Site is
//     cross-site/same-site, or whose Origin host does not match the request Host.
//     This is defense-in-depth atop the SameSite=Lax session cookie.
//   • userId is taken ONLY from deps (the server-validated session), NEVER from the
//     request body — a body cannot make the write act as another tenant.
//   • the actual write is delegated to an injected store (real impl is server-only and
//     does ownership + plan-membership + decision-value checks). All error strings here
//     are fixed constants; no header, body value, id, or secret ever appears in a response.

import type { StoreInviteDecisionResult } from "./invite-decisions";

type StoreFn = (args: {
  runId: string;
  userId: string;
  creatorOpenId: string;
  decision: string;
}) => Promise<StoreInviteDecisionResult>;

export type InviteDecisionRequestHeaders = {
  origin: string | null;
  host: string | null;
  secFetchSite: string | null;
};

export type InviteDecisionRouteDeps = {
  userId: string; // MUST originate from the server-validated session
  store: StoreFn; // injected; real one is storeInviteDecision (server-only)
};

export type InviteDecisionResponseBody =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type InviteDecisionRouteResult = {
  status: number;
  body: InviteDecisionResponseBody;
};

// Same-origin guard. Returns true if the request is allowed to proceed.
// Sec-Fetch-Site (when present) is the strongest signal: only same-origin and none
// (direct navigation / non-browser) are allowed. Origin (when present) must match the
// request Host (scheme-agnostic host compare). When neither header is present, allow —
// browser CSRF is additionally gated by the SameSite session cookie.
function isSameOrigin(headers: InviteDecisionRequestHeaders): boolean {
  const { origin, host, secFetchSite } = headers;
  if (secFetchSite !== null) {
    if (secFetchSite !== "same-origin" && secFetchSite !== "none") {
      return false;
    }
  }
  if (origin !== null) {
    if (host === null) return false;
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }
    if (originHost !== host) return false;
  }
  return true;
}

export async function handleInviteDecisionRequest(
  headers: InviteDecisionRequestHeaders,
  rawBody: unknown,
  deps: InviteDecisionRouteDeps,
): Promise<InviteDecisionRouteResult> {
  // 1. Same-origin guard (CSRF).
  if (!isSameOrigin(headers)) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }

  // 2. Validate body shape.
  if (typeof rawBody !== "object" || rawBody === null) {
    return { status: 400, body: { ok: false, error: "invalid_request" } };
  }
  const raw = rawBody as Record<string, unknown>;

  const runId = raw["runId"];
  if (typeof runId !== "string" || runId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_run_id" } };
  }
  const creatorOpenId = raw["creatorOpenId"];
  if (typeof creatorOpenId !== "string" || creatorOpenId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_creator_open_id" } };
  }
  const decision = raw["decision"];
  if (typeof decision !== "string") {
    return { status: 400, body: { ok: false, error: "invalid_decision" } };
  }

  // 3. Delegate to the injected store. userId comes from deps (session), NOT the body.
  const result = await deps.store({
    runId: runId.trim(),
    userId: deps.userId,
    creatorOpenId: creatorOpenId.trim(),
    decision,
  });

  // 4. Map the store result to an HTTP-shaped response.
  if (result.ok) {
    return { status: 200, body: { ok: true, id: result.id } };
  }
  switch (result.reason) {
    case "invalid_decision":
      return { status: 400, body: { ok: false, error: "invalid_decision" } };
    case "creator_not_in_run":
      return { status: 404, body: { ok: false, error: "creator_not_in_run" } };
    case "run_not_found":
      return { status: 404, body: { ok: false, error: "run_not_found" } };
    case "store_failed":
      return { status: 500, body: { ok: false, error: "store_failed" } };
  }
}
