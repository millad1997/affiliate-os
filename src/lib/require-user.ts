import { redirect } from "next/navigation";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import type { User } from "@supabase/supabase-js";

/**
 * Asserts that there is a currently logged-in user.
 *
 * If a valid session exists, returns the Supabase User object (which contains
 * id, email, created_at, and any metadata you store on the user).
 *
 * If there is no session — or the session token is invalid — calls
 * redirect("/login"), which throws a Next.js-internal error that is caught
 * by the framework and turned into an HTTP 307 redirect. It never returns in
 * that case; no code after the call to requireUser() will run.
 *
 * Use this in every Server Component page that requires authentication:
 *
 *   const user = await requireUser();
 *
 * WHY ONE SOURCE OF TRUTH IS SAFER THAN THREE COPIES:
 *
 * Auth logic is security-critical. With three copies of the same check:
 *
 * 1. A future edit (e.g. changing the redirect target from /login to /signin,
 *    or adding a check for a specific role) must be applied to every copy.
 *    Miss one and you have an inconsistent security boundary — one page
 *    redirects correctly, another silently lets users through.
 *
 * 2. Bugs compound silently. If the pattern has a subtle flaw today, it exists
 *    three times. Fix it in one place and the other two remain vulnerable.
 *
 * 3. Code review is harder. Reviewers must inspect three identical blocks to
 *    confirm they are truly identical. One centralised function is one thing
 *    to audit.
 *
 * 4. Testing is cleaner. One unit test on requireUser() covers all callers.
 *    Three copies require three tests to get the same coverage.
 */
export async function requireUser(): Promise<User> {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // TypeScript now knows `user` is non-null because redirect() throws (never
  // returns) when user is null — so reaching this line proves user is defined.
  return user;
}

/**
 * Returns the current user, or null if no session exists.
 * Never redirects. Use this on pages that are accessible to everyone but
 * render different content depending on login state (e.g. the homepage).
 *
 *   const user = await getOptionalUser();
 *   // user is User | null
 */
export async function getOptionalUser(): Promise<User | null> {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
