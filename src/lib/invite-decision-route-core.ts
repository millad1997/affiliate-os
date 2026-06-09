// src/lib/invite-decision-route-core.ts
//
// SECURITY: Pure orchestration for the invite-decision write endpoint — no
// `import "server-only"`, safe under plain npx tsx. It upholds three invariants:
//   • Same-origin guard (CSRF defense): rejects requests whose Sec-Fetch-Site is
//     cross-site/same-site, or whose Origin host does not match the request Host.
//     This is defense-in-depth atop the SameSite=Lax session cookie. The guard now
//     lives in the shared ./same-origin-guard module (isSameOrigin), used by every
//     write route.
//   • userId is taken ONLY from deps (the server-validated session), NEVER from the
//     request body — a body cannot make the write act as another tenant.
//   • the actual write is delegated to an injected store (real impl is server-only and
//     does ownership + plan-membership + decision-value checks). All error strings here
//     are fixed constants; no header, body value, id, or secret ever appears in a response.

import type { ApproveAllPendingResult, DeleteInviteDecisionResult, RejectAllPendingResult, StoreInviteDecisionResult } from "./invite-decisions";
import { isSameOrigin, type SameOriginHeaders } from "./same-origin-guard";

type StoreFn = (args: {
  runId: string;
  userId: string;
  creatorOpenId: string;
  decision: string;
}) => Promise<StoreInviteDecisionResult>;

// Re-exported alias keeps the existing route-shell import stable; structurally
// identical to the shared SameOriginHeaders.
export type InviteDecisionRequestHeaders = SameOriginHeaders;

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

type ClearFn = (args: {
  runId: string;
  userId: string;
  creatorOpenId: string;
}) => Promise<DeleteInviteDecisionResult>;

export type ClearInviteDecisionRouteDeps = {
  userId: string; // MUST originate from the server-validated session
  clear: ClearFn; // injected; real one is deleteInviteDecision (server-only)
};

export type ClearInviteDecisionResponseBody =
  | { ok: true }
  | { ok: false; error: string };

export type ClearInviteDecisionRouteResult = {
  status: number;
  body: ClearInviteDecisionResponseBody;
};

// Pure orchestration for the invite-decision CLEAR (DELETE) endpoint — sibling to
// handleInviteDecisionRequest, same invariants:
//   • Same-origin guard (CSRF) via the shared isSameOrigin.
//   • userId is taken ONLY from deps (the server-validated session), NEVER the body.
//   • the actual delete is delegated to an injected clear (real impl is server-only and
//     does the run-ownership re-read + triple-scoped delete).
// There is no decision field — clearing carries no value. All error strings are fixed
// constants; no header, body value, id, or secret ever appears in a response.
export async function handleClearInviteDecisionRequest(
  headers: InviteDecisionRequestHeaders,
  rawBody: unknown,
  deps: ClearInviteDecisionRouteDeps,
): Promise<ClearInviteDecisionRouteResult> {
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

  // 3. Delegate to the injected clear. userId comes from deps (session), NOT the body.
  const result = await deps.clear({
    runId: runId.trim(),
    userId: deps.userId,
    creatorOpenId: creatorOpenId.trim(),
  });

  // 4. Map the clear result to an HTTP-shaped response.
  if (result.ok) {
    return { status: 200, body: { ok: true } };
  }
  switch (result.reason) {
    case "run_not_found":
      return { status: 404, body: { ok: false, error: "run_not_found" } };
    case "delete_failed":
      return { status: 500, body: { ok: false, error: "delete_failed" } };
  }
}

type ApproveAllFn = (args: {
  runId: string;
  userId: string;
}) => Promise<ApproveAllPendingResult>;

export type ApproveAllRouteDeps = {
  userId: string; // MUST originate from the server-validated session
  approveAll: ApproveAllFn; // injected; real one is approveAllPendingInviteDecisions (server-only)
};

export type ApproveAllResponseBody =
  | { ok: true; approved: number }
  | { ok: false; error: string };

export type ApproveAllRouteResult = {
  status: number;
  body: ApproveAllResponseBody;
};

// Pure orchestration for the bulk "approve all pending" endpoint — sibling to the other two
// handlers, same invariants:
//   • Same-origin guard (CSRF) via the shared isSameOrigin.
//   • userId is taken ONLY from deps (the server-validated session), NEVER the body.
//   • the batch write is delegated to an injected approveAll (real impl is server-only and
//     computes the pending set from the owned run, then multi-row upserts).
// The body carries ONLY runId — there is no client-supplied creator list to validate, by
// design (the pending set is server-authoritative). All error strings are fixed constants.
export async function handleApproveAllPendingRequest(
  headers: InviteDecisionRequestHeaders,
  rawBody: unknown,
  deps: ApproveAllRouteDeps,
): Promise<ApproveAllRouteResult> {
  // 1. Same-origin guard (CSRF).
  if (!isSameOrigin(headers)) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }

  // 2. Validate body shape — only runId is required.
  if (typeof rawBody !== "object" || rawBody === null) {
    return { status: 400, body: { ok: false, error: "invalid_request" } };
  }
  const raw = rawBody as Record<string, unknown>;

  const runId = raw["runId"];
  if (typeof runId !== "string" || runId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_run_id" } };
  }

  // 3. Delegate. userId comes from deps (session), NOT the body.
  const result = await deps.approveAll({
    runId: runId.trim(),
    userId: deps.userId,
  });

  // 4. Map the result to an HTTP-shaped response.
  if (result.ok) {
    return { status: 200, body: { ok: true, approved: result.approved } };
  }
  switch (result.reason) {
    case "run_not_found":
      return { status: 404, body: { ok: false, error: "run_not_found" } };
    case "store_failed":
      return { status: 500, body: { ok: false, error: "store_failed" } };
  }
}

type RejectAllFn = (args: {
  runId: string;
  userId: string;
}) => Promise<RejectAllPendingResult>;

export type RejectAllRouteDeps = {
  userId: string; // MUST originate from the server-validated session
  rejectAll: RejectAllFn; // injected; real impl will be rejectAllPendingInviteDecisions (server-only)
};

export type RejectAllResponseBody =
  | { ok: true; rejected: number }
  | { ok: false; error: string };

export type RejectAllRouteResult = {
  status: number;
  body: RejectAllResponseBody;
};

// Pure orchestration for the bulk "reject all pending" endpoint — sibling to
// handleApproveAllPendingRequest, same invariants:
//   • Same-origin guard (CSRF) via the shared isSameOrigin.
//   • userId is taken ONLY from deps (the server-validated session), NEVER the body.
//   • the batch write is delegated to an injected rejectAll (real impl is server-only and
//     computes the pending set from the owned run, then multi-row upserts as rejected).
// The body carries ONLY runId — the pending set is server-authoritative, no client list.
// All error strings are fixed constants.
export async function handleRejectAllPendingRequest(
  headers: InviteDecisionRequestHeaders,
  rawBody: unknown,
  deps: RejectAllRouteDeps,
): Promise<RejectAllRouteResult> {
  // 1. Same-origin guard (CSRF).
  if (!isSameOrigin(headers)) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }

  // 2. Validate body shape — only runId is required.
  if (typeof rawBody !== "object" || rawBody === null) {
    return { status: 400, body: { ok: false, error: "invalid_request" } };
  }
  const raw = rawBody as Record<string, unknown>;

  const runId = raw["runId"];
  if (typeof runId !== "string" || runId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_run_id" } };
  }

  // 3. Delegate. userId comes from deps (session), NOT the body.
  const result = await deps.rejectAll({
    runId: runId.trim(),
    userId: deps.userId,
  });

  // 4. Map the result to an HTTP-shaped response.
  if (result.ok) {
    return { status: 200, body: { ok: true, rejected: result.rejected } };
  }
  switch (result.reason) {
    case "run_not_found":
      return { status: 404, body: { ok: false, error: "run_not_found" } };
    case "store_failed":
      return { status: 500, body: { ok: false, error: "store_failed" } };
  }
}
