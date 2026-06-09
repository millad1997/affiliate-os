"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandTextField } from "@/lib/brand-text-fields";

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

function ApprovedClaimsEditor({ brandId, initial }: { brandId: string; initial: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/brands/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId, approvedClaims: value }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || data.ok !== true) {
        setError(true);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const hasClaims = initial !== null && initial.trim().length > 0;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Approved claims</span>
          <button
            type="button"
            onClick={() => {
              setValue(initial ?? "");
              setError(false);
              setEditing(true);
            }}
            className="text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Edit
          </button>
        </div>
        {hasClaims ? (
          <span className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{initial}</span>
        ) : (
          <span className="text-sm leading-relaxed text-zinc-400 dark:text-zinc-500">None on file</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Approved claims</span>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        placeholder="One approved claim per line…"
        className="min-h-[96px] resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
      />
      {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">Couldn&apos;t save claims</span>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saving ? "Saving…" : "Save claims"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(false);
          }}
          disabled={saving}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function BrandTextFieldEditor({
  brandId,
  field,
  label,
  initial,
  placeholder,
}: {
  brandId: string;
  field: BrandTextField;
  label: string;
  initial: string | null;
  placeholder?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/brands/fields", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId, field, value }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || data.ok !== true) {
        setError(true);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const hasValue = initial !== null && initial.trim().length > 0;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
          <button
            type="button"
            onClick={() => {
              setValue(initial ?? "");
              setError(false);
              setEditing(true);
            }}
            className="text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Edit
          </button>
        </div>
        {hasValue ? (
          <span className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{initial}</span>
        ) : (
          <span className="text-sm leading-relaxed text-zinc-400 dark:text-zinc-500">None on file</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        placeholder={placeholder}
        className="min-h-[96px] resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
      />
      {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">Couldn&apos;t save</span>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(false);
          }}
          disabled={saving}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
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
          <BrandTextFieldEditor
            brandId={brand.id}
            field="description"
            label="Description"
            initial={brand.description}
            placeholder="Products you sell and who you sell to…"
          />
          <BrandTextFieldEditor
            brandId={brand.id}
            field="commission_context"
            label="Commission context"
            initial={brand.commission_context}
            placeholder="Commission rates, payment terms, bonuses…"
          />
          <BrandTextFieldEditor
            brandId={brand.id}
            field="exclusion_list"
            label="Exclusion list"
            initial={brand.exclusion_list}
            placeholder="Topics, competitors, or claims to avoid…"
          />
          <ApprovedClaimsEditor brandId={brand.id} initial={brand.approved_claims} />

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
