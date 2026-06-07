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

type BriefResponse = { ok: true; brief: ContentBrief } | { ok: false; error: string };

const btn =
  "inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const inactiveBtn =
  "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";

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
        </div>
      )}
    </div>
  );
}
