"use client";

import { useState, type ReactNode } from "react";

type Decision = "approved" | "pending" | "rejected";
type Filter = "all" | Decision;

type QueueFilterProps = {
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  bulkControls: ReactNode;
  children: ReactNode;
};

const PILL: Record<Decision, { label: string; idle: string; ring: string }> = {
  approved: {
    label: "approved",
    idle: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    ring: "ring-emerald-500",
  },
  pending: {
    label: "pending",
    idle: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    ring: "ring-zinc-400 dark:ring-zinc-500",
  },
  rejected: {
    label: "rejected",
    idle: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    ring: "ring-red-500",
  },
};

export default function QueueFilter({
  approvedCount,
  pendingCount,
  rejectedCount,
  bulkControls,
  children,
}: QueueFilterProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts: Record<Decision, number> = {
    approved: approvedCount,
    pending: pendingCount,
    rejected: rejectedCount,
  };

  function toggle(next: Decision) {
    setFilter((cur) => (cur === next ? "all" : next));
  }

  const emptyForFilter = filter !== "all" && counts[filter] === 0;

  return (
    <>
      <style>{`
        [data-queue][data-filter="approved"] [data-decision="pending"],
        [data-queue][data-filter="approved"] [data-decision="rejected"],
        [data-queue][data-filter="pending"] [data-decision="approved"],
        [data-queue][data-filter="pending"] [data-decision="rejected"],
        [data-queue][data-filter="rejected"] [data-decision="approved"],
        [data-queue][data-filter="rejected"] [data-decision="pending"] {
          display: none;
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Ranked invite plan, highest composite first.</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {(Object.keys(PILL) as Decision[]).map((d) => {
              const active = filter === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(d)}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 transition focus:outline-none ${PILL[d].idle} ${active ? `ring-2 ${PILL[d].ring}` : "opacity-90 hover:opacity-100"}`}
                >
                  <span className="font-semibold tabular-nums">{counts[d]}</span> {PILL[d].label}
                </button>
              );
            })}
          </div>
          {bulkControls}
        </div>
      </div>

      <div data-queue data-filter={filter}>
        {emptyForFilter ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-zinc-300 px-8 py-10 text-center dark:border-zinc-700">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{`No ${filter} creators`}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Adjust the filter to see the rest of the queue.</p>
          </div>
        ) : (
          children
        )}
      </div>
    </>
  );
}
