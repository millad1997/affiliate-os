// SECURITY: Thin public entry point for the bulk "approve all pending" action. Glue only —
// the same-origin (CSRF) guard, body validation, and result mapping live in the pure, tested
// handleApproveAllPendingRequest; the pending set is computed server-side by the injected
// approveAllPendingInviteDecisions (run-ownership re-read + multi-row upsert). userId comes
// ONLY from the server-validated Supabase session, never the body.

import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { approveAllPendingInviteDecisions } from "@/lib/invite-decisions";
import { handleApproveAllPendingRequest } from "@/lib/invite-decision-route-core";

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

  const result = await handleApproveAllPendingRequest(
    {
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    rawBody,
    { userId, approveAll: approveAllPendingInviteDecisions },
  );

  return NextResponse.json(result.body, { status: result.status });
}
