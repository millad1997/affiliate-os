// SECURITY: Thin public entry point for recording an operator's invite decision.
// Glue only — all validation, the same-origin (CSRF) guard, and result mapping live in
// the pure, tested core handleInviteDecisionRequest. Invariants:
//   • userId comes ONLY from the server-validated Supabase session (never the body).
//   • the core's same-origin guard rejects cross-site POSTs (defense-in-depth atop the
//     SameSite=Lax session cookie).
//   • the store (server-only) enforces run ownership + plan membership before writing.

import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { deleteInviteDecision, storeInviteDecision } from "@/lib/invite-decisions";
import {
  handleClearInviteDecisionRequest,
  handleInviteDecisionRequest,
} from "@/lib/invite-decision-route-core";

export async function POST(request: Request) {
  const authClient = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await handleInviteDecisionRequest(
    {
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    rawBody,
    { userId, store: storeInviteDecision },
  );

  return NextResponse.json(result.body, { status: result.status });
}

// DELETE clears (removes) an operator's decision, returning the creator to Pending. Same
// session-auth + same-origin guard + injected server-only delete as POST; the clear is
// idempotent and tenant-isolated (run-ownership re-read + triple-scoped delete).
export async function DELETE(request: Request) {
  const authClient = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await handleClearInviteDecisionRequest(
    {
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    rawBody,
    { userId, clear: deleteInviteDecision },
  );

  return NextResponse.json(result.body, { status: result.status });
}
