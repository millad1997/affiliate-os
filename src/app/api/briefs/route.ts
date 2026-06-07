// SECURITY: Thin entry point for content-brief generation. POST /api/briefs triggers a
// PAID Anthropic call on the user's behalf. All logic lives in the pure, tested core
// handleBriefRequest; this file is glue only. Invariants:
//   • the core's same-origin guard rejects cross-site POSTs (defense-in-depth atop the
//     SameSite=Lax session cookie).
//   • userId comes ONLY from the server-validated Supabase session (never the body).
//   • ANTHROPIC_API_KEY stays inside the server-only adapter (makeAnthropicGenerate) — it
//     is never read, logged, or returned here.
//   • the core enforces run ownership + plan membership + an "approved"-decision cost guard
//     before any paid call.
import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getDiscoveryRun } from "@/lib/discovery-runs";
import { listInviteDecisions } from "@/lib/invite-decisions";
import { getBrandContent } from "@/lib/brand-content-read";
import { buildContentBrief } from "@/lib/content-brief";
import { makeAnthropicGenerate } from "@/lib/anthropic-generate";
import { handleBriefRequest } from "@/lib/brief-route-core";

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

  const generate = makeAnthropicGenerate();

  const result = await handleBriefRequest(
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
      getBrandContent,
      buildBrief: (brand) => buildContentBrief(brand, generate),
    },
  );

  return NextResponse.json(result.body, { status: result.status });
}
