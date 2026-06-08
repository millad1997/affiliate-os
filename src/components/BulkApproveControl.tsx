"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const btn =
  "inline-flex h-7 items-center justify-center rounded-md border border-emerald-300 px-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40";

export default function BulkApproveControl({
  runId,
  pendingCount,
}: {
  runId: string;
  pendingCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  async function approveAll(): Promise<void> {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/invite-decisions/approve-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || data.ok !== true) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (pendingCount === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-xs font-medium text-red-600 dark:text-red-400">Couldn&apos;t approve</span>
      )}
      <button type="button" onClick={approveAll} disabled={loading} className={btn}>
        {loading ? "Approving…" : `Approve all pending (${pendingCount})`}
      </button>
    </div>
  );
}
