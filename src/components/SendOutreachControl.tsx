"use client";

// Operator control for the outreach SEND. Two-step confirm (the button arms, then fires) —
// this rehearses an irreversible action even while the stub adapter is behind the route, so
// the interaction model is already correct at TikTok scope activation. The response renders
// as a grouped, NAMED outcome panel: refusals (compliance skips) are the product behavior,
// so each skipped creator is listed with its reason, never summarized away. The panel is
// component-local state and intentionally survives the router.refresh().

import { useState } from "react";
import { useRouter } from "next/navigation";

type SendCreatorStatus =
  | "sent"
  | "sent_unrecorded"
  | "failed"
  | "skipped_no_brief"
  | "skipped_not_compliant"
  | "lookup_failed";

type SendCreatorResult = { creatorOpenId: string; status: SendCreatorStatus };

type OutreachMissingField = "tiktok_product_ids" | "seller_contact_email";

type SendResponse =
  | { ok: true; results: SendCreatorResult[]; alreadySent: string[] }
  | { ok: false; error: string; missing?: OutreachMissingField[] };

const primaryBtn =
  "inline-flex h-7 items-center justify-center rounded-md bg-zinc-900 px-2.5 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200";
const armedBtn =
  "inline-flex h-7 items-center justify-center rounded-md border border-amber-400 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60";
const cancelBtn =
  "inline-flex h-7 items-center justify-center rounded-md border border-zinc-300 px-2.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";

const GROUPS: Array<{ status: SendCreatorStatus; label: string; tone: "good" | "bad" | "warn" }> = [
  { status: "sent", label: "Sent", tone: "good" },
  { status: "skipped_not_compliant", label: "Skipped — brief not compliant", tone: "warn" },
  { status: "skipped_no_brief", label: "Skipped — no brief generated", tone: "warn" },
  { status: "failed", label: "Failed — retryable", tone: "bad" },
  { status: "sent_unrecorded", label: "Sent but not recorded — do not resend blindly", tone: "bad" },
  { status: "lookup_failed", label: "Skipped — lookup failed", tone: "bad" },
];

function toneClasses(tone: "good" | "bad" | "warn"): string {
  if (tone === "good") return "text-emerald-700 dark:text-emerald-400";
  if (tone === "warn") return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

export default function SendOutreachControl({
  runId,
  approvedCount,
}: {
  runId: string;
  approvedCount: number;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<{ results: SendCreatorResult[]; alreadySent: string[] } | null>(null);
  const [configMissing, setConfigMissing] = useState<OutreachMissingField[] | null>(null);

  async function send(): Promise<void> {
    if (loading) return;
    setLoading(true);
    setError(false);
    setConfigMissing(null);
    try {
      const res = await fetch("/api/sends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = (await res.json()) as SendResponse;
      if (!res.ok || data.ok !== true) {
        if (data.ok === false && data.error === "outreach_config_incomplete" && Array.isArray(data.missing)) {
          setConfigMissing(data.missing);
          setArmed(false);
          return;
        }
        setError(true);
        return;
      }
      setOutcome({ results: data.results, alreadySent: data.alreadySent });
      setArmed(false);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (approvedCount === 0 && outcome === null) return null;

  const sentCount = outcome?.results.filter((r) => r.status === "sent").length ?? 0;
  const skippedCount = outcome ? outcome.results.length - sentCount : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        {error && (
          <span className="text-xs font-medium text-red-600 dark:text-red-400">Couldn&apos;t send</span>
        )}
        {!armed ? (
          <button
            type="button"
            onClick={() => setArmed(true)}
            disabled={loading || approvedCount === 0}
            className={primaryBtn}
          >
            {`Send outreach (${approvedCount} approved)`}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setArmed(false)} disabled={loading} className={cancelBtn}>
              Cancel
            </button>
            <button type="button" onClick={send} disabled={loading} className={armedBtn}>
              {loading ? "Sending…" : `Confirm send (${approvedCount})`}
            </button>
          </>
        )}
      </div>

      {configMissing && (
        <p className="text-right text-xs font-medium text-amber-700 dark:text-amber-400">
          {`Outreach config incomplete — set ${configMissing
            .map((f) => (f === "tiktok_product_ids" ? "TikTok product IDs" : "a seller contact email"))
            .join(" and ")} on the brand's Discovery & outreach config.`}
        </p>
      )}

      {outcome && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/40">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            {`Send result: ${sentCount} sent · ${skippedCount} skipped or failed · ${outcome.alreadySent.length} already sent`}
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {GROUPS.map((g) => {
              const members = outcome.results.filter((r) => r.status === g.status);
              if (members.length === 0) return null;
              return (
                <div key={g.status}>
                  <p className={`font-semibold ${toneClasses(g.tone)}`}>{g.label}</p>
                  <ul className="mt-0.5 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
                    {members.map((m) => (
                      <li key={m.creatorOpenId}>{m.creatorOpenId}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {outcome.alreadySent.length > 0 && (
              <div>
                <p className="font-semibold text-zinc-500 dark:text-zinc-400">Already sent (skipped)</p>
                <ul className="mt-0.5 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
                  {outcome.alreadySent.map((c) => (
                    <li key={c}>{c}</li>
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
