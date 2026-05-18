"use client";

import { useState } from "react";

export type ScoredCreator = {
  id: string;
  username: string;
  brand_category: string;
  brand_description: string | null;
  creator_bio: string | null;
  follower_count: number | null;
  recent_captions: string | null;
  score: number;
  rationale: string;
  created_at: string;
  brand_id: string | null;
  brand_name: string | null;
  total_gmv: number | null;
  gmv_last_30d: number | null;
  posts_last_30d: number | null;
  posts_last_7d: number | null;
  likes_last_30d: number | null;
  likes_last_7d: number | null;
  views_last_30d: number | null;
  views_last_7d: number | null;
  comments_last_30d: number | null;
  comments_last_7d: number | null;
  avg_posts_per_week_12w: number | null;
};

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

function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

function CreatorRow({ creator }: { creator: ScoredCreator }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
        aria-expanded={open}
      >
        {/* Score badge */}
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-xl font-bold tabular-nums ${scoreBg(creator.score)} ${scoreColor(creator.score)}`}
        >
          {creator.score}
        </span>

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">@{creator.username}</p>
          <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">{creator.brand_category}</p>
          <p className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-500">
            {creator.brand_id ? (creator.brand_name ? `Scored against: ${creator.brand_name}` : "Scored against a saved brand") : "Scored manually"}
          </p>
        </div>

        {/* Timestamp + chevron */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{relativeTime(creator.created_at)}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-5 border-t border-zinc-100 px-5 py-5 dark:border-zinc-800">
          <DetailRow label="Rationale" value={creator.rationale} />
          <DetailRow label="Brand description" value={creator.brand_description} />
          <DetailRow label="Creator bio" value={creator.creator_bio} />
          <DetailRow label="Follower count" value={creator.follower_count} />
          <DetailRow label="Recent captions" value={creator.recent_captions} />
          {(creator.total_gmv !== null || creator.gmv_last_30d !== null) && (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">GMV</span>
              <div className="flex flex-col gap-2 pl-1">
                <DetailRow label="Total GMV (USD)" value={creator.total_gmv} />
                <DetailRow label="Last-30-day GMV (USD)" value={creator.gmv_last_30d} />
              </div>
            </div>
          )}
          {(creator.posts_last_30d !== null || creator.posts_last_7d !== null || creator.avg_posts_per_week_12w !== null) && (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Posting cadence</span>
              <div className="flex flex-col gap-2 pl-1">
                <DetailRow label="Posts (last 30 days)" value={creator.posts_last_30d} />
                <DetailRow label="Posts (last 7 days)" value={creator.posts_last_7d} />
                <DetailRow label="Avg posts/week (last 12 weeks)" value={creator.avg_posts_per_week_12w} />
              </div>
            </div>
          )}
          {(creator.likes_last_30d !== null || creator.likes_last_7d !== null || creator.views_last_30d !== null || creator.views_last_7d !== null || creator.comments_last_30d !== null || creator.comments_last_7d !== null) && (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Engagement</span>
              <div className="flex flex-col gap-2 pl-1">
                <DetailRow label="Likes (last 30d)" value={creator.likes_last_30d} />
                <DetailRow label="Likes (last 7d)" value={creator.likes_last_7d} />
                <DetailRow label="Views (last 30d)" value={creator.views_last_30d} />
                <DetailRow label="Views (last 7d)" value={creator.views_last_7d} />
                <DetailRow label="Comments (last 30d)" value={creator.comments_last_30d} />
                <DetailRow label="Comments (last 7d)" value={creator.comments_last_7d} />
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function CreatorList({ creators }: { creators: ScoredCreator[] }) {
  if (creators.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-300 px-8 py-16 text-center dark:border-zinc-700">
        <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">No creators scored yet</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Score your first creator and it will appear here automatically.
        </p>
        <a
          href="/creator-score"
          className="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Score a creator
        </a>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {creators.map((c) => (
        <CreatorRow key={c.id} creator={c} />
      ))}
    </ul>
  );
}
