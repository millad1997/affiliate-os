import { requireUser } from "@/lib/require-user";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import CreatorScoreForm, { type SavedBrand } from "./CreatorScoreForm";

// cookies() and getUser() are request-time operations — force dynamic rendering
// so the auth check always runs.
export const dynamic = "force-dynamic";

async function fetchBrandsForUser(userId: string): Promise<SavedBrand[]> {
  try {
    // Uses the service-role client (bypasses RLS) constrained to the current
    // user's rows — same pattern as /brands. userId comes from requireUser()
    // so a user cannot read another user's brands.
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .select("id, name, category, description")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[creator-score] Failed to fetch brands:", error);
      return [];
    }

    return (data ?? []) as SavedBrand[];
  } catch (err) {
    console.error("[creator-score] Unexpected error fetching brands:", err);
    return [];
  }
}

export default async function CreatorScorePage() {
  const user = await requireUser();
  const savedBrands = await fetchBrandsForUser(user.id);
  return <CreatorScoreForm savedBrands={savedBrands} />;
}
