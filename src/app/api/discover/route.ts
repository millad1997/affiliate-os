// SECURITY: This is the thin public entry point for creator discovery. It does
// no request/response logic of its own — all of that lives in the pure, tested
// core handleDiscoverRequest. The invariants this shell upholds:
//   • userId comes ONLY from the server-validated Supabase session (never from
//     the request body), so a client cannot run discovery as another tenant.
//   • appKey/appSecret are read from env, never logged, and never placed in any
//     response.
//   • all request parsing, validation, and response shaping live in the pure,
//     tested core; this file is glue only.

import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getBrandConfig } from "@/lib/brand-config-read";
import { makeFetchCreatorSearch } from "@/lib/tiktok-creator-search-fetcher";
import { makeFetchCreatorDetail } from "@/lib/tiktok-creator-fetcher";
import { handleDiscoverRequest } from "@/lib/discover-route-core";

export async function POST(request: Request) {
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

  return NextResponse.json(result.body, { status: result.status });
}
