// SECURITY: Thin entry point for updating a brand's approved_claims. Glue only — the
// same-origin (CSRF) guard, validation, and result mapping live in the pure, tested
// handleUpdateBrandClaimsRequest; the scoped write is the injected updateBrandApprovedClaims
// (server-only, .eq id + user_id). userId comes ONLY from the server-validated session.

import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { updateBrandApprovedClaims } from "@/lib/brand-content-write";
import { handleUpdateBrandClaimsRequest } from "@/lib/brand-claims-route-core";

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

  const result = await handleUpdateBrandClaimsRequest(
    {
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    rawBody,
    { userId, update: updateBrandApprovedClaims },
  );

  return NextResponse.json(result.body, { status: result.status });
}
