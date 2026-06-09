// SECURITY: Thin entry point for updating one editable free-text brand field
// (description | commission_context | exclusion_list). Glue only — the same-origin (CSRF)
// guard, brandId/field/value validation, and result mapping live in the pure, tested
// handleUpdateBrandFieldRequest; the scoped write is the injected updateBrandTextField
// (server-only, .eq id + user_id, allowlist-guarded). userId comes ONLY from the
// server-validated session. Adds NO new env dependency — rides the existing Supabase config.

import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { updateBrandTextField } from "@/lib/brand-content-write";
import { handleUpdateBrandFieldRequest } from "@/lib/brand-field-route-core";

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

  const result = await handleUpdateBrandFieldRequest(
    {
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    rawBody,
    { userId, update: updateBrandTextField },
  );

  return NextResponse.json(result.body, { status: result.status });
}
