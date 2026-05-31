import { NextResponse } from "next/server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { generateState, buildAuthorizeUrl } from "@/lib/tiktok-authorize";

// Must run on the Node.js runtime: generateState() uses node:crypto via
// randomBytes, which is not available on the Edge runtime.
export const runtime = "nodejs";

// A redirect + Set-Cookie response must never be statically cached.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // ── Auth guard ─────────────────────────────────────────────────────────────
  // Use the anon-key, per-request cookie client — the only correct way to ask
  // "who is the logged-in user?" on the server. The service-role client has no
  // concept of sessions and must never be used for this check.
  const authClient = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    // NextResponse.redirect requires an absolute URL. We borrow only the origin
    // from request.url so the redirect lands on the correct host in every
    // environment; the path "/login" is a hardcoded constant — no request
    // query param, header, or body input is ever interpolated here.
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── Env guard ──────────────────────────────────────────────────────────────
  const serviceId = process.env.TIKTOK_SERVICE_ID;
  if (!serviceId || serviceId.trim() === "") {
    return NextResponse.json(
      { error: "TikTok authorization is not configured. Please contact support." },
      { status: 500 },
    );
  }

  // ── Build redirect URL + CSRF cookie ──────────────────────────────────────
  // Generate the state once and reuse the exact same value for both the cookie
  // and the URL query param — they MUST match for the callback to accept the
  // response.  The redirect target is constructed purely from our own constants
  // + the server-side env var + the generated state; no request input is ever
  // interpolated into the URL (no open-redirect risk).
  const state = generateState();

  const authorizeUrl = buildAuthorizeUrl({
    serviceId: serviceId.trim(),
    state,
    region: "US",
  });

  const response = NextResponse.redirect(authorizeUrl);

  // The cookie must survive TikTok's cross-site redirect back to our callback.
  // sameSite:"lax" is required for that — "strict" would cause the browser to
  // withhold the cookie on the cross-site return navigation and break CSRF
  // validation.
  response.cookies.set("tiktok_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes — enough for the round-trip
  });

  return response;
}
