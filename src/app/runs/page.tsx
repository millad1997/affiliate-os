import Link from "next/link";
import { requireUser } from "@/lib/require-user";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { listDiscoveryRuns, type DiscoveryRunSummary } from "@/lib/discovery-runs";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

type RunWithBrand = DiscoveryRunSummary & { brandName: string | null };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

async function fetchRuns(userId: string): Promise<{ runs: RunWithBrand[]; error: string | null }> {
  const result = await listDiscoveryRuns(userId);
  if (!result.ok) {
    return { runs: [], error: "Could not load discovery runs." };
  }
  const runs = result.runs;

  // Resolve brand names, double-scoped to this user (same pattern as /scored-creators).
  const brandIds = [...new Set(runs.map((r) => r.brandId))];
  const brandNameMap = new Map<string, string>();
  if (brandIds.length > 0) {
    const supabase = getSupabaseServerClient();
    const { data: brands } = await supabase
      .from("brands")
      .select("id, name")
      .in("id", brandIds)
      .eq("user_id", userId);
    for (const b of brands ?? []) {
      brandNameMap.set(b.id, b.name);
    }
  }

  return {
    runs: runs.map((r) => ({ ...r, brandName: brandNameMap.get(r.brandId) ?? null })),
    error: null,
  };
}

export default async function RunsPage() {
  const user = await requireUser();
  const { runs, error } = await fetchRuns(user.id);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Affiliate Commerce OS</p>
            <h1 className="text-lg font-semibold">Discovery runs</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/creator-score" className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100">
              Score a creator
            </Link>
            <Link href="/scored-creators" className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100">
              Scored creators
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100">
            <p className="font-medium">Could not load discovery runs</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 px-8 py-16 text-center dark:border-zinc-700">
            <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">No discovery runs yet</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Runs from the discovery pipeline will appear here, newest first.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {`${runs.length} run${runs.length === 1 ? "" : "s"} — newest first. Click any run to see its outreach plan.`}
            </p>
            <ul className="flex flex-col gap-3">
              {runs.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/runs/${run.id}`}
                    className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                  >
                    <div className="shrink-0 flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                      <span className="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{run.creatorCount}</span>
                      <span className="text-[10px] font-medium uppercase leading-none text-zinc-400 dark:text-zinc-500">picks</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">{run.brandName ?? "Saved brand"}</p>
                      <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                        {`Fetched ${run.pagesFetched} of ${run.maxPages} page${run.maxPages === 1 ? "" : "s"}`}
                        {run.stoppedEarly ? " · stopped early" : ""}
                      </p>
                      {run.stoppedEarly && run.stopReason && (
                        <p className="mt-0.5 truncate text-xs text-amber-600 dark:text-amber-400">
                          {`Stop reason: ${run.stopReason.message} (${run.stopReason.code})`}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">{relativeTime(run.createdAt)}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-zinc-400" aria-hidden>
                        <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
