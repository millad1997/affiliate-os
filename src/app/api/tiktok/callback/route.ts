import { NextResponse, type NextRequest } from "next/server";
import { verifyState, exchangeCodeForCredentials } from "@/lib/tiktok-callback";
import { storeTikTokCredentials } from "@/lib/tiktok-credentials";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

// Must run on the Node.js runtime: verifyState() uses node:crypto (timingSafeEqual),
// which is not available on the Edge runtime.
export const runtime = "nodejs";

// Reads request cookies and issues redirects + Set-Cookie — never statically cache.
export const dynamic = "force-dynamic";

const STATE_COOKIE = "tiktok_oauth_state";

// Clears the one-time CSRF state cookie on the given response and returns it.
// maxAge:0 expires it immediately; path "/" must match how it was originally set.
function clearStateCookie(response: NextResponse): NextResponse {
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Read code + state from the query string and validate BEFORE touching cookies.
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return new NextResponse("Invalid callback request", { status: 400 });
  }

  // 2. Read the CSRF cookie value (undefined if the cookie is absent).
  const cookieValue = request.cookies.get(STATE_COOKIE)?.value;

  // 3. Constant-time CSRF check. On failure, 400 + clear the one-time cookie.
  if (!verifyState(cookieValue, state)) {
    return clearStateCookie(new NextResponse("Invalid state", { status: 400 }));
  }

  // 4. Identify the logged-in user via the anon-key, per-request cookie client.
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Redirect target is a hardcoded path + this request's origin only; no request
    // input is interpolated into the path (no open-redirect risk). verifyState has
    // already passed, so the one-time cookie is consumed — burn it on this path too.
    return clearStateCookie(NextResponse.redirect(new URL("/login", request.url)));
  }

  // 5. Server-side app credentials. These are read here and NEVER logged.
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appKey || appKey.trim() === "" || !appSecret || appSecret.trim() === "") {
    return new NextResponse("TikTok is not configured", { status: 500 });
  }

  // 6. Exchange the one-time code for credentials (no fetchImpl -> real fetch).
  const result = await exchangeCodeForCredentials({ code, appKey, appSecret });
  if (!result.ok) {
    // Single coarse line: kind + already-secret-free detail/message only. NEVER
    // the code, tokens, appSecret, or any raw request/response body.
    const reason = result.kind === "transport" ? result.detail : result.message;
    console.error(`tiktok_callback exchange_failed kind=${result.kind} ${reason}`);
    return clearStateCookie(
      NextResponse.redirect(new URL("/?tiktok=error", request.url)),
    );
  }

  // 7. Persist the credentials for this user.
  const stored = await storeTikTokCredentials(user.id, result.token);
  if (!stored.ok) {
    console.error(`tiktok_callback store_failed reason=${stored.reason}`);
    return clearStateCookie(
      NextResponse.redirect(new URL("/?tiktok=error", request.url)),
    );
  }

  // 8. Success — redirect home and clear the one-time CSRF cookie.
  return clearStateCookie(
    NextResponse.redirect(new URL("/?tiktok=connected", request.url)),
  );
}
