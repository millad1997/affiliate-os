"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Decision = "approved" | "rejected";

const baseBtn =
  "inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const inactiveBtn =
  "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";

export default function InviteDecisionControls({
  runId,
  creatorOpenId,
  initialDecision,
}: {
  runId: string;
  creatorOpenId: string;
  initialDecision: Decision | null;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(initialDecision);
  const [loading, setLoading] = useState<Decision | "clear" | null>(null);
  const [error, setError] = useState<boolean>(false);

  async function submit(next: Decision): Promise<void> {
    if (loading !== null) return;
    setLoading(next);
    setError(false);
    try {
      const res = await fetch("/api/invite-decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, creatorOpenId, decision: next }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || data.ok !== true) {
        setError(true);
        return;
      }
      setDecision(next);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setLoading(null);
    }
  }

  async function clear(): Promise<void> {
    if (loading !== null) return;
    setLoading("clear");
    setError(false);
    try {
      const res = await fetch("/api/invite-decisions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, creatorOpenId }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || data.ok !== true) {
        setError(true);
        return;
      }
      setDecision(null);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {decision === null && !error && (
        <span className="mr-1 text-xs font-medium text-zinc-400 dark:text-zinc-500">Pending</span>
      )}
      {error && (
        <span className="mr-1 text-xs font-medium text-red-600 dark:text-red-400">Couldn't save</span>
      )}
      <button
        type="button"
        onClick={() => submit("approved")}
        disabled={loading !== null}
        aria-pressed={decision === "approved"}
        className={`${baseBtn} ${
          decision === "approved"
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : inactiveBtn
        }`}
      >
        {loading === "approved" ? "…" : "Approve"}
      </button>
      <button
        type="button"
        onClick={() => submit("rejected")}
        disabled={loading !== null}
        aria-pressed={decision === "rejected"}
        className={`${baseBtn} ${
          decision === "rejected"
            ? "bg-red-600 text-white hover:bg-red-700"
            : inactiveBtn
        }`}
      >
        {loading === "rejected" ? "…" : "Reject"}
      </button>
      {decision !== null && (
        <button
          type="button"
          onClick={clear}
          disabled={loading !== null}
          className={`${baseBtn} ${inactiveBtn}`}
        >
          {loading === "clear" ? "…" : "Clear"}
        </button>
      )}
    </div>
  );
}
