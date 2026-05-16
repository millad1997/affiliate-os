import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase client for use in browser / Client Components.
 *
 * Uses the ANON key (not the service role key), so Row Level Security
 * policies on your tables apply to every query this client makes.
 *
 * @supabase/ssr's createBrowserClient automatically reads and writes
 * session cookies via document.cookie, which is how the auth session
 * persists between page loads without any extra setup on our part.
 *
 * Call this function inside a component — do not call it at module scope,
 * because process.env is not available until the module is evaluated in
 * the browser context.
 */
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
