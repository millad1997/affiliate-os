import Link from "next/link";
import { requireUser } from "@/lib/require-user";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import CreatorList, { type ScoredCreator } from "./CreatorList";
import LogoutButton from "@/components/LogoutButton";

// cookies() and getUser() are request-time operations — force dynamic rendering
// so the list is always fresh and the auth check always runs.
export const dynamic = "force-dynamic";

async function fetchScoredCreators(userId: string): Promise<{ creators: ScoredCreator[]; error: string | null }> {
  try {
    // Data fetching uses the service-role client (bypasses RLS) but we MUST
    // constrain the query to the current user's rows. The service-role key
    // can read every row in the table, so the .eq("user_id", userId) filter
    // below is what enforces per-user isolation in this code path.
    //
    // SECURITY: userId comes from requireUser() — a server-side check of the
    // Supabase auth cookies via the anon-key client. It is never read from
    // the URL, request body, or any client-controlled input, so a user cannot
    // ask to see someone else's rows.
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("scored_creators")
      .select("id, username, brand_category, brand_description, creator_bio, follower_count, recent_captions, score, rationale, created_at, brand_id, total_gmv, gmv_last_30d, posts_last_30d, posts_last_7d, likes_last_30d, likes_last_7d, views_last_30d, views_last_7d, comments_last_30d, comments_last_7d, avg_posts_per_week_12w, composite_score, performance_subscore, score_basis")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[scored-creators] Supabase fetch error:", error);
      return { creators: [], error: error.message };
    }

    const rows = data ?? [];

    // Resolve brand names for rows that have a brand_id. The second query is
    // constrained to both the collected ids AND the current user's id, so the
    // service-role client cannot return another user's brand names.
    const brandIds = [...new Set(rows.map((r) => r.brand_id).filter((id): id is string => id !== null))];
    const brandNameMap = new Map<string, string>();
    if (brandIds.length > 0) {
      const { data: brands } = await supabase
        .from("brands")
        .select("id, name")
        .in("id", brandIds)
        .eq("user_id", userId);
      for (const b of brands ?? []) {
        brandNameMap.set(b.id, b.name);
      }
    }

    const creators: ScoredCreator[] = rows.map((r) => ({
      ...r,
      brand_name: r.brand_id ? (brandNameMap.get(r.brand_id) ?? null) : null,
    }));

    return { creators, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[scored-creators] Unexpected fetch error:", err);
    return { creators: [], error: msg };
  }
}

export default async function ScoredCreatorsPage() {
  const user = await requireUser();
  const { creators, error } = await fetchScoredCreators(user.id);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Affiliate Commerce OS</p>
            <h1 className="text-lg font-semibold">Scored creators</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/creator-score"
              className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Score a creator
            </Link>
            <Link
              href="/runs"
              className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Discovery runs
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
          >
            <p className="font-medium">Could not load scored creators</p>
            <p className="mt-1 font-mono text-xs">{error}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {creators.length === 0
                ? "No creators scored yet."
                : `${creators.length} creator${creators.length === 1 ? "" : "s"} scored — newest first. Click any row to expand.`}
            </p>
            <CreatorList creators={creators} />
          </>
        )}
      </main>
    </div>
  );
}
