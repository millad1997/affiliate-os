"use client";

import { useState } from "react";

export type Brand = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  commission_context: string | null;
  exclusion_list: string | null;
  approved_claims: string | null;
  created_at: string;
  target_category_ids: string[];
  target_regions: string[];
  min_followers: number | null;
  gate_region: boolean;
  gate_followers: boolean;
  gate_category: boolean;
  max_invites: number;
  commission_rate: number | string;
  min_gmv_floor: number | string | null;
};

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

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{value}</span>
    </div>
  );
}

function BrandRow({ brand }: { brand: Brand }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">{brand.name}</p>
          <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">{brand.category}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{relativeTime(brand.created_at)}</span>
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
          <DetailRow label="Description" value={brand.description} />
          <DetailRow label="Commission context" value={brand.commission_context} />
          <DetailRow label="Exclusion list" value={brand.exclusion_list} />
          <DetailRow label="Approved claims" value={brand.approved_claims} />

          <div className="flex flex-col gap-5 border-t border-zinc-100 pt-5 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Discovery &amp; outreach config
            </p>
            <DetailRow
              label="Target categories"
              value={brand.target_category_ids.length ? brand.target_category_ids.join(", ") : "None"}
            />
            <DetailRow
              label="Target regions"
              value={brand.target_regions.length ? brand.target_regions.join(", ") : "None"}
            />
            <DetailRow
              label="Minimum followers"
              value={brand.min_followers === null ? "Any" : brand.min_followers.toLocaleString()}
            />
            <DetailRow
              label="Hard filters"
              value={(() => {
                const filters: string[] = [];
                if (brand.gate_region) filters.push("Region");
                if (brand.gate_followers) filters.push("Followers");
                if (brand.gate_category) filters.push("Category");
                return filters.length === 0 ? "None" : filters.join(", ");
              })()}
            />
            <DetailRow label="Max invites" value={String(brand.max_invites)} />
            <DetailRow label="Commission rate" value={`${brand.commission_rate}%`} />
            <DetailRow
              label="Minimum GMV floor"
              value={brand.min_gmv_floor === null ? "None" : Number(brand.min_gmv_floor).toLocaleString()}
            />
          </div>
        </div>
      )}
    </li>
  );
}

export default function BrandList({ brands }: { brands: Brand[] }) {
  if (brands.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-300 px-8 py-16 text-center dark:border-zinc-700">
        <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">No brands yet</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Add your first brand using the form above.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {brands.map((b) => (
        <BrandRow key={b.id} brand={b} />
      ))}
    </ul>
  );
}
