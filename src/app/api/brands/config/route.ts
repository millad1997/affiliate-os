// SECURITY: Thin entry point for updating a brand's Discovery & outreach config (the nine
// structured fields). Glue only — the same-origin (CSRF) guard, brandId + config validation
// (via parseBrandConfigFields inside the route-core), and result mapping live in the pure,
// tested handleUpdateBrandConfigRequest; the scoped write is the injected updateBrandConfig
// (server-only, .eq id + user_id). userId comes ONLY from the server-validated session.
// Adds NO new env dependency — rides the existing Supabase config.

import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { updateBrandConfig } from "@/lib/brand-config-write";
import { handleUpdateBrandConfigRequest } from "@/lib/brand-config-route-core";

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

  const result = await handleUpdateBrandConfigRequest(
    {
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    rawBody,
    { userId, update: updateBrandConfig },
  );

  return NextResponse.json(result.body, { status: result.status });
}
