import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/require-user";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getDiscoveryRun } from "@/lib/discovery-runs";
import { listInviteDecisions } from "@/lib/invite-decisions";
import LogoutButton from "@/components/LogoutButton";
import InviteDecisionControls from "@/components/InviteDecisionControls";
import GenerateBriefControl from "@/components/GenerateBriefControl";

export const dynamic = "force-dynamic";

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

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-700 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-50 dark:bg-emerald-950/40";
  if (score >= 40) return "bg-amber-50 dark:bg-amber-950/40";
  return "bg-red-50 dark:bg-red-950/40";
}

function formatGmv(v: number | null): string {
  if (v === null) return "—";
  return `$${v.toLocaleString()}`;
}

async function resolveBrandName(userId: string, brandId: string): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("brands")
    .select("name")
    .eq("id", brandId)
    .eq("user_id", userId)
    .maybeSingle<{ name: string }>();
  return data?.name ?? null;
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const result = await getDiscoveryRun(id, user.id);
  if (!result.ok) {
    // not_found (incl. another user's run — the read is double-scoped by user_id) or query_failed
    notFound();
  }
  const run = result.run;
  const brandName = await resolveBrandName(user.id, run.brandId);
  const plan = run.plan;

  const decisionsResult = await listInviteDecisions(run.id, user.id);
  const decisionMap = new Map<string, "approved" | "rejected">();
  if (decisionsResult.ok) {
    for (const d of decisionsResult.decisions) {
      decisionMap.set(d.creatorOpenId, d.decision);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Affiliate Commerce OS</p>
            <h1 className="text-lg font-semibold">Outreach plan</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/runs" className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100">
              All runs
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{brandName ?? "Saved brand"}</p>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{relativeTime(run.createdAt)}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{plan.selectedCount}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">invites</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Eligible</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{plan.eligibleCount}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Selected</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{plan.selectedCount}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Capped out</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{plan.cappedOutCount}</p>
            </div>
          </div>

          <div className="mt-4 border-t border-zinc-100 pt-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <p>{`Fetched ${run.pagesFetched} of ${run.maxPages} page${run.maxPages === 1 ? "" : "s"}`}{run.stoppedEarly ? " · stopped early" : ""}</p>
            {run.stoppedEarly && run.stopReason && (
              <p className="mt-1 text-amber-600 dark:text-amber-400">{`Stop reason: ${run.stopReason.message} (${run.stopReason.code})`}</p>
            )}
            <p className="mt-1">{run.overrides ? "Search: operator overrides applied" : "Search: default (broadest net)"}</p>
          </div>
        </section>

        {plan.invites.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-8 py-12 text-center dark:border-zinc-700">
            <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">No invites in this plan</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">The run produced no eligible creators to invite.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Ranked invite plan, highest composite first.</p>
            <ul className="flex flex-col gap-2">
              {plan.invites.map((invite, i) => (
                <li
                  key={invite.creatorOpenId}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center gap-4">
                    <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-zinc-400 dark:text-zinc-500">{i + 1}</span>
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg font-bold tabular-nums ${scoreBg(invite.composite)} ${scoreColor(invite.composite)}`}>
                      {invite.composite}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{invite.creatorOpenId}</p>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{`Commission ${invite.commissionRate}%`}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatGmv(invite.effectiveGmv)}</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">Effective GMV</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <InviteDecisionControls
                      runId={run.id}
                      creatorOpenId={invite.creatorOpenId}
                      initialDecision={decisionMap.get(invite.creatorOpenId) ?? null}
                    />
                  </div>
                  {decisionMap.get(invite.creatorOpenId) === "approved" && (
                    <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                      <GenerateBriefControl
                        runId={run.id}
                        creatorOpenId={invite.creatorOpenId}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
