import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client for server-side auth checks in Server Components,
 * Server Functions, and Route Handlers.
 *
 * KEY DIFFERENCES FROM getSupabaseServerClient() in supabase-server.ts:
 *
 *  supabase-server.ts          │  supabase-auth-server.ts (this file)
 *  ─────────────────────────── │  ──────────────────────────────────────
 *  Service role key            │  Anon key
 *  Bypasses RLS entirely       │  Respects RLS policies
 *  Singleton — no cookies      │  Created per-request from live cookies
 *  Used for trusted DB writes  │  Used to ask "who is the logged-in user?"
 *
 * WHY MIXING THEM UP IS DANGEROUS:
 * If you used the service-role client to check "is someone logged in?", you
 * are asking a client that has no concept of sessions — it is always a trusted
 * admin. It would never see a missing or expired session token, so every user,
 * including anonymous requests, would appear to be "admin-level" in terms of
 * DB access. Data you intended to be private could be exposed.
 *
 * Conversely, if you used this anon-key client for bulk DB writes, every query
 * would be gated by RLS. If the user's RLS policy doesn't allow writing (which
 * is fine intentionally for public reads), your write would silently fail.
 *
 * Rule of thumb:
 *   - "Who is the user?" → this file (anon key, respects RLS, per-request)
 *   - "Write to DB as a trusted server op" → supabase-server.ts (service role)
 */
export async function getSupabaseAuthServerClient() {
  // cookies() is async in Next.js 16. Awaiting it gives us access to the
  // cookies sent with the current request.
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // setAll is intentionally omitted here. Server Components cannot write
        // Set-Cookie headers — that must happen in the proxy (proxy.ts) which
        // runs before the render and can modify the response. Omitting setAll
        // is valid because CookieMethodsServer marks it as optional; the client
        // simply won't try to refresh tokens mid-render.
      },
    },
  );
}
