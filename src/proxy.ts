import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js Proxy (previously called Middleware) runs between the browser and
 * your app on every matched request, before any page or API route handler.
 *
 * Its sole job here is session maintenance: if the user's access token has
 * expired, Supabase Auth silently refreshes it using the refresh token stored
 * in their cookies, and the updated tokens are written back to the response
 * cookies so the browser has the new values going forward.
 *
 * Without this, a user whose access token expired mid-session would appear
 * logged-out even though their refresh token is still valid, because no
 * server-side code would ever trigger the refresh.
 *
 * We do NOT do any route protection here — that is a separate step. Right now
 * all pages are accessible regardless of login state.
 */
export async function proxy(request: NextRequest) {
  // Start with a passthrough response. We may replace it inside setAll if
  // Supabase needs to write updated session cookies back to the browser.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read all cookies from the incoming request.
        getAll() {
          return request.cookies.getAll();
        },
        // Called by the Supabase client when it writes or refreshes session
        // tokens. We set the cookies on both the request object (so downstream
        // server code in this same request can read them) and the response
        // object (so the browser stores the updated values).
        setAll(cookiesToSet, headers) {
          // Apply to the request: Next.js 16 RequestCookies.set only accepts
          // (name, value) or a single RequestCookie object — no third arg.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          // Rebuild the response carrying the mutated request cookies.
          supabaseResponse = NextResponse.next({ request });

          // Apply the full cookie options (expiry, path, sameSite, etc.) to
          // the response so the browser stores them correctly.
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set({ name, value, ...options }),
          );

          // Apply cache-busting headers that @supabase/ssr adds to prevent
          // CDNs from caching pages that carry auth Set-Cookie headers.
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // IMPORTANT: Do not put any logic between createServerClient and getUser().
  // getUser() validates the access token and triggers a silent refresh if it
  // has expired. The setAll callback above captures any resulting new tokens.
  //
  // We intentionally ignore the returned user here — we are not protecting
  // any routes yet, so we only care about the side-effect (token refresh).
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match every path EXCEPT:
     * - _next/static  — compiled JS/CSS assets
     * - _next/image   — image optimisation endpoint
     * - favicon.ico   — browser tab icon
     * - files with a common static extension
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
