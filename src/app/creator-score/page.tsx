import { redirect } from "next/navigation";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import CreatorScoreForm from "./CreatorScoreForm";

// Auth check opts this route into dynamic rendering automatically (cookies()
// is a request-time API), but declaring it explicitly is clearer.
export const dynamic = "force-dynamic";

export default async function CreatorScorePage() {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // getUser() contacts the Supabase Auth server to validate the access token.
  // If there is no session, or the session is invalid/expired and the proxy
  // hasn't refreshed it yet, user will be null.
  //
  // redirect() throws a special Next.js error internally — it never returns.
  // Next.js catches that error and issues an HTTP 307 redirect to the browser.
  // No code after redirect() runs.
  if (!user) {
    redirect("/login");
  }

  // User is confirmed logged in. Render the interactive form.
  // CreatorScoreForm is a Client Component — it handles all the state and
  // fetch calls to /api/creator-score. This server wrapper's only job is the
  // auth gate above.
  return <CreatorScoreForm />;
}
