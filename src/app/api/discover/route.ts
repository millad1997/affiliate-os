// SECURITY: This is the thin public entry point for creator discovery. It does
// no request/response logic of its own — all of that lives in the pure, tested
// core handleDiscoverRequest. The invariants this shell upholds:
//   • cross-site / forged-origin POSTs are rejected up front by the shared
//     same-origin guard (CSRF defense-in-depth atop the SameSite session cookie).
//   • userId comes ONLY from the server-validated Supabase session (never from
//     the request body), so a client cannot run discovery as another tenant.
//   • appKey/appSecret are read from env, never logged, and never placed in any
//     response.
//   • all request parsing, validation, and response shaping live in the pure,
//     tested core; this file is glue only.
//   • successful runs are persisted best-effort (a store failure never blocks
//     the user's result); the persisted run is owned by the session userId.
import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getBrandConfig } from "@/lib/brand-config-read";
import { makeFetchCreatorSearch } from "@/lib/tiktok-creator-search-fetcher";
import { makeFetchCreatorDetail } from "@/lib/tiktok-creator-fetcher";
import { handleDiscoverRequest } from "@/lib/discover-route-core";
import { buildDiscoveryRunInsert } from "@/lib/discovery-run-row";
import { storeDiscoveryRun } from "@/lib/discovery-runs";
import { isSameOrigin } from "@/lib/same-origin-guard";

export async function POST(request: Request) {
  // Same-origin guard (CSRF defense-in-depth). Reject cross-site / forged-origin
  // POSTs before doing any work or touching the session.
  if (
    !isSameOrigin({
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    })
  ) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const authClient = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId = user.id;
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appKey || !appSecret) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const fetchSearch = makeFetchCreatorSearch({ userId, appKey, appSecret });
  const fetchDetail = makeFetchCreatorDetail({ userId, appKey, appSecret });
  const result = await handleDiscoverRequest(rawBody, {
    userId,
    getConfig: getBrandConfig,
    fetchSearch,
    fetchDetail,
  });
  // Persist successful runs best-effort: a store failure degrades to runId:null and
  // never blocks the response. The persisted run's user_id is the session userId above.
  const body = result.body;
  if (result.status === 200 && body.ok) {
    const stored = await storeDiscoveryRun(buildDiscoveryRunInsert(userId, body));
    return NextResponse.json({ ...body, runId: stored.ok ? stored.id : null }, { status: 200 });
  }
  return NextResponse.json(body, { status: result.status });
}
