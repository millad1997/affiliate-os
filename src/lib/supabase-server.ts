import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * A server-only Supabase client that authenticates with the service role key.
 *
 * The service role key bypasses Row Level Security, so this file must never be
 * imported by client components or any code that runs in the browser.
 * It is safe here because this file is only ever imported from server-side
 * code (Route Handlers, Server Actions, etc.) and the service role key is
 * stored in an env var that is not prefixed with NEXT_PUBLIC_.
 */

let client: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables: ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local",
    );
  }

  client = createClient(url, key, {
    auth: {
      // Disable the built-in session/token management — this client acts as a
      // server-side service, not a logged-in user.
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return client;
}
