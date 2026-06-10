// SECURITY: Thin entry point for the outreach SEND. POST /api/sends triggers IRREVERSIBLE
// outreach to creators on the user's behalf. All logic lives in the pure, tested core
// handleSendRequest; this file is glue only. Invariants:
//   • the core's same-origin guard rejects cross-site POSTs (defense-in-depth atop the
//     SameSite=Lax session cookie).
//   • userId comes ONLY from the server-validated Supabase session (never the body); it is
//     captured by the persistSend closure so the core never handles it.
//   • eligibility is buildSendPlan's alone (only approved, never twice per run) and the core
//     enforces the strict compliance gate (latest brief verdict must be "pass") before any
//     adapter call.
//   • the adapter behind the seam is the STUB (makeStubSendAdapter) until TikTok scope
//     activation — no live outreach leaves this route yet. Swapping in the live signed
//     adapter at activation changes ONLY the sendOutreach line below.
//   • every attempt outcome is persisted to the append-only sends audit (storeSend);
//     persistence failures surface as sent_unrecorded in the core, never swallowed.
import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getDiscoveryRun } from "@/lib/discovery-runs";
import { listInviteDecisions } from "@/lib/invite-decisions";
import { getLatestBrief } from "@/lib/briefs";
import { listSentCreatorOpenIds, storeSend } from "@/lib/sends";
import { briefToPlainText } from "@/lib/brief-plain-text";
import { makeStubSendAdapter } from "@/lib/outreach-send-adapter";
import { handleSendRequest } from "@/lib/send-route-core";

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

  const result = await handleSendRequest(
    {
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    rawBody,
    {
      userId,
      getRun: getDiscoveryRun,
      getDecisions: listInviteDecisions,
      getSentCreatorOpenIds: listSentCreatorOpenIds,
      getLatestBrief,
      composeMessage: briefToPlainText,
      sendOutreach: makeStubSendAdapter(),
      persistSend: ({ runId, creatorOpenId, status, errorCode }) =>
        storeSend({ runId, userId, creatorOpenId, status, errorCode }),
    },
  );

  return NextResponse.json(result.body, { status: result.status });
}
