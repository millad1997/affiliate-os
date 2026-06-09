// SECURITY: Thin public entry point for the bulk "reject all pending" action. Glue only —
// the same-origin (CSRF) guard, body validation, and result mapping live in the pure, tested
// handleRejectAllPendingRequest; the pending set is computed server-side by the injected
// rejectAllPendingInviteDecisions (run-ownership re-read + multi-row upsert as rejected).
// userId comes ONLY from the server-validated Supabase session, never the body.

import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { rejectAllPendingInviteDecisions } from "@/lib/invite-decisions";
import { handleRejectAllPendingRequest } from "@/lib/invite-decision-route-core";

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

  const result = await handleRejectAllPendingRequest(
    {
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    rawBody,
    { userId, rejectAll: rejectAllPendingInviteDecisions },
  );

  return NextResponse.json(result.body, { status: result.status });
}
