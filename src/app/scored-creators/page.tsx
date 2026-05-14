import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import CreatorList, { type ScoredCreator } from "./CreatorList";

// Render this page on every request so the list always reflects the latest
// scored_creators rows. Without this, Next.js would pre-render it once at
// build time and serve stale data until the next deployment.
export const dynamic = "force-dynamic";

async function fetchScoredCreators(): Promise<{ creators: ScoredCreator[]; error: string | null }> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("scored_creators")
      .select("id, username, brand_category, brand_description, creator_bio, follower_count, recent_captions, score, rationale, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[scored-creators] Supabase fetch error:", error);
      return { creators: [], error: error.message };
    }

    return { creators: (data ?? []) as ScoredCreator[], error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[scored-creators] Unexpected fetch error:", err);
    return { creators: [], error: msg };
  }
}

export default async function ScoredCreatorsPage() {
  const { creators, error } = await fetchScoredCreators();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Affiliate Commerce OS</p>
            <h1 className="text-lg font-semibold">Scored creators</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/creator-score"
              className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Score a creator
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Home
            </Link>
          </div>
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
