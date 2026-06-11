import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/require-user";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getDiscoveryRun } from "@/lib/discovery-runs";
import { listBriefsForRun, type StoredBrief, type BriefVerdict } from "@/lib/briefs";
import { listSendsForRun, type StoredSend } from "@/lib/sends";
import LogoutButton from "@/components/LogoutButton";

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

const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };

function severityClasses(sev: string): string {
  if (sev === "high") return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  if (sev === "medium") return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function fieldLabel(field: string, index: number | null): string {
  if (field === "talkingPoint") return `Talking point${index !== null ? ` #${index + 1}` : ""}`;
  if (field === "callToAction") return "Call to action";
  if (field === "hook") return "Hook";
  if (field === "notes") return "Notes";
  return field;
}

function humanizeCategory(cat: string): string {
  return cat.replace(/_/g, " ");
}

function verdictBadge(verdict: BriefVerdict): { label: string; classes: string } {
  if (verdict === "pass") {
    return { label: "Passed", classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" };
  }
  if (verdict === "flagged") {
    return { label: "Flagged", classes: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400" };
  }
  return { label: "Not scanned", classes: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" };
}

function sendStatusBadge(s: StoredSend): { label: string; classes: string } {
  if (s.status === "sent") {
    return { label: "Sent", classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" };
  }
  return {
    label: s.errorCode ? `Failed · ${s.errorCode}` : "Failed",
    classes: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  };
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

export default async function RunAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const result = await getDiscoveryRun(id, user.id);
  if (!result.ok) {
    // not_found (incl. another user's run — the read is double-scoped by user_id) or query_failed
    notFound();
  }
  const run = result.run;
  const brandName = await resolveBrandName(user.id, run.brandId);

  // The audit trail: every persisted brief for this run, newest first (tenant-scoped by user_id).
  const briefsResult = await listBriefsForRun(run.id, user.id);
  const briefs: StoredBrief[] = briefsResult.ok ? briefsResult.briefs : [];

  // Outreach send history: every attempt (sent AND failed), newest first, tenant-scoped.
  // Soft-fails to empty: a read failure must never block rendering the brief trail.
  const sendsResult = await listSendsForRun(run.id, user.id);
  const sends: StoredSend[] = sendsResult.ok ? sendsResult.sends : [];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Affiliate Commerce OS</p>
            <h1 className="text-lg font-semibold">Audit trail</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link href={`/runs/${run.id}`} className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100">
              ← Outreach plan
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{brandName ?? "Saved brand"}</p>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {briefs.length === 0
              ? "No briefs generated yet"
              : `${briefs.length} brief${briefs.length === 1 ? "" : "s"} generated · newest first`}
          </p>
        </div>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Outreach sends</h2>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {sends.length === 0
                  ? "No outreach sent yet"
                  : `${sends.length} attempt${sends.length === 1 ? "" : "s"} recorded · newest first`}
              </p>
            </div>
            {sends.length > 0 && (
              <ul className="flex flex-col gap-2">
                {sends.map((s) => {
                  const badge = sendStatusBadge(s);
                  return (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{s.creatorOpenId}</p>
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{relativeTime(s.createdAt)}</p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold ${badge.classes}`}>
                        {badge.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="border-t border-zinc-200 dark:border-zinc-800" />

        {briefs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-8 py-12 text-center dark:border-zinc-700">
            <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">No briefs yet</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Generate a brief for an approved creator on the outreach plan — every generation is recorded here.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {briefs.map((b) => {
              const badge = verdictBadge(b.verdict);
              const findings = b.scan ? b.scan.findings : [];
              return (
                <li
                  key={b.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{b.creatorOpenId}</p>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{relativeTime(b.createdAt)}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold ${badge.classes}`}>
                      {badge.label}
                      {b.verdict === "flagged" ? ` · ${findings.length}` : ""}
                    </span>
                  </div>

                  <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Hook</p>
                    <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">{b.brief.hook}</p>
                  </div>

                  {findings.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {[...findings]
                        .sort((x, y) => (severityRank[x.severity] ?? 3) - (severityRank[y.severity] ?? 3))
                        .map((f, i) => (
                          <li key={i} className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${severityClasses(f.severity)}`}>
                                {f.severity}
                              </span>
                              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                {fieldLabel(f.field, f.index)} · {humanizeCategory(f.category)}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm italic text-zinc-800 dark:text-zinc-200">&ldquo;{f.quote}&rdquo;</p>
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{f.rationale}</p>
                          </li>
                        ))}
                    </ul>
                  )}

                  <details className="group">
                    <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
                      Full brief
                    </summary>
                    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Talking points</p>
                        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-zinc-800 dark:text-zinc-200">
                          {b.brief.talkingPoints.map((point, i) => (
                            <li key={i}>{point}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Approved claims used</p>
                        {b.brief.approvedClaimsUsed.length === 0 ? (
                          <p className="mt-1 text-zinc-500 dark:text-zinc-400">None referenced</p>
                        ) : (
                          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-zinc-800 dark:text-zinc-200">
                            {b.brief.approvedClaimsUsed.map((claim, i) => (
                              <li key={i}>{claim}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Call to action</p>
                        <p className="mt-1 text-zinc-800 dark:text-zinc-200">{b.brief.callToAction}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Disclosure</p>
                        <p className="mt-1 font-medium text-zinc-800 dark:text-zinc-200">{b.brief.disclosure}</p>
                      </div>
                      {b.brief.notes && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Notes</p>
                          <p className="mt-1 text-zinc-600 dark:text-zinc-400">{b.brief.notes}</p>
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
