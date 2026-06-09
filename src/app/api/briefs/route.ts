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
//   • the §3.7 compliance scan is a second paid call on the same approved path; it soft-fails
//     to scan: null inside the core and never blocks an already-built brief.
//   • on success the brief + scan outcome are persisted to the append-only §3.7 audit trail
//     (storeBrief), as a best-effort write that never blocks the response.
import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getDiscoveryRun } from "@/lib/discovery-runs";
import { listInviteDecisions } from "@/lib/invite-decisions";
import { getBrandContent } from "@/lib/brand-content-read";
import { buildContentBrief } from "@/lib/content-brief";
import { scanBriefCompliance } from "@/lib/compliance-scan";
import { storeBrief } from "@/lib/briefs";
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

  // Latency instrumentation: time the two PAID phases (generate, then scan) by wrapping the
  // injected calls. The finally blocks record wall-clock ms even if a call throws, so the
  // numbers reflect real spend latency. The core is untouched; timings are merged into the
  // success response below and are NOT persisted (a brief hydrated on load carries no timing).
  let generateMs = 0;
  let scanMs = 0;

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
      buildBrief: async (brand) => {
        const t0 = performance.now();
        try {
          return await buildContentBrief(brand, generate);
        } finally {
          generateMs = Math.round(performance.now() - t0);
        }
      },
      scanBrief: async (brand, brief) => {
        const t0 = performance.now();
        try {
          return await scanBriefCompliance(brand, brief, generate);
        } finally {
          scanMs = Math.round(performance.now() - t0);
        }
      },
      persistBrief: ({ runId, creatorOpenId, brief, scan }) =>
        storeBrief({ runId, userId, creatorOpenId, brief, scan }).then(() => undefined),
    },
  );

  if (result.body.ok) {
    return NextResponse.json(
      { ...result.body, timings: { generateMs, scanMs, totalMs: generateMs + scanMs } },
      { status: result.status },
    );
  }
  return NextResponse.json(result.body, { status: result.status });
}
