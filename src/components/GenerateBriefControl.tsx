"use client";

import { useState } from "react";

type ContentBrief = {
  hook: string;
  talkingPoints: string[];
  approvedClaimsUsed: string[];
  disclosure: string;
  callToAction: string;
  notes: string | null;
};

type ComplianceFinding = {
  field: string;
  index: number | null;
  quote: string;
  category: string;
  severity: "high" | "medium" | "low";
  rationale: string;
};

type ComplianceScan = { verdict: "pass" | "flagged"; findings: ComplianceFinding[] };

type BriefResponse =
  | { ok: true; brief: ContentBrief; scan: ComplianceScan | null }
  | { ok: false; error: string };

const btn =
  "inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const inactiveBtn =
  "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
      <div className="mt-1 text-zinc-800 dark:text-zinc-200">{children}</div>
    </div>
  );
}

export default function GenerateBriefControl({
  runId,
  creatorOpenId,
}: {
  runId: string;
  creatorOpenId: string;
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [brief, setBrief] = useState<ContentBrief | null>(null);
  const [scan, setScan] = useState<ComplianceScan | null>(null);

  async function generate(): Promise<void> {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, creatorOpenId }),
      });
      const data = (await res.json()) as BriefResponse;
      if (!res.ok || data.ok !== true) {
        setError(true);
        return;
      }
      setBrief(data.brief);
      setScan(data.scan);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        {error && (
          <span className="mr-1 text-xs font-medium text-red-600 dark:text-red-400">Couldn&apos;t generate brief</span>
        )}
        <button type="button" onClick={generate} disabled={loading} className={`${btn} ${inactiveBtn}`}>
          {loading ? "Generating…" : brief ? "Regenerate brief" : "Generate brief"}
        </button>
      </div>

      {brief && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
          <Field label="Hook">
            <p>{brief.hook}</p>
          </Field>
          <Field label="Talking points">
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {brief.talkingPoints.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </Field>
          <Field label="Approved claims used">
            {brief.approvedClaimsUsed.length === 0 ? (
              <p className="text-zinc-500 dark:text-zinc-400">None referenced</p>
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {brief.approvedClaimsUsed.map((claim, i) => (
                  <li key={i}>{claim}</li>
                ))}
              </ul>
            )}
          </Field>
          <Field label="Call to action">
            <p>{brief.callToAction}</p>
          </Field>
          <Field label="Disclosure">
            <p className="font-medium">{brief.disclosure}</p>
          </Field>
          {brief.notes && (
            <Field label="Notes">
              <p className="text-zinc-600 dark:text-zinc-400">{brief.notes}</p>
            </Field>
          )}

          <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Compliance</p>
            {scan === null ? (
              <p className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                Compliance check unavailable — regenerate to retry.
              </p>
            ) : scan.verdict === "pass" ? (
              <p className="mt-1.5 inline-flex w-fit items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Passed — no issues flagged
              </p>
            ) : (
              <div className="mt-1.5 flex flex-col gap-2">
                <p className="inline-flex w-fit items-center rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-400">
                  {scan.findings.length} issue{scan.findings.length === 1 ? "" : "s"} flagged
                </p>
                <ul className="flex flex-col gap-2">
                  {[...scan.findings]
                    .sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3))
                    .map((f, i) => (
                      <li key={i} className="rounded-md border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
