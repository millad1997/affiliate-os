"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BRAND_CATEGORIES = [
  "Supplements & Wellness",
  "Beauty & Skincare",
  "Men's Grooming",
  "Sports Nutrition",
  "Food & Beverage",
  "Apparel",
  "Other",
] as const;

type ApiError = { error: string };
type ApiSuccess = { id: string; name: string };

const fieldClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-normal text-zinc-900 outline-none ring-zinc-400 placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500";

const labelClass = "flex flex-col gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200";

export default function BrandForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [commissionContext, setCommissionContext] = useState("");
  const [exclusionList, setExclusionList] = useState("");
  const [approvedClaims, setApprovedClaims] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successName, setSuccessName] = useState<string | null>(null);

  const canSubmit = name.trim() && category && !loading;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessName(null);

    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          description: description.trim(),
          commission_context: commissionContext.trim(),
          exclusion_list: exclusionList.trim(),
          approved_claims: approvedClaims.trim(),
        }),
      });

      const data = (await res.json()) as ApiSuccess | ApiError;

      if (!res.ok) {
        setError("error" in data ? data.error : "Request failed.");
        return;
      }

      const saved = "name" in data ? data.name : name.trim();
      setSuccessName(saved);
      setName("");
      setCategory("");
      setDescription("");
      setCommissionContext("");
      setExclusionList("");
      setApprovedClaims("");
      // Refresh server-component data so the new brand appears in the list
      // without a full page reload.
      router.refresh();
    } catch {
      setError("Network error. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="border-b border-zinc-200 pb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Add a brand
        </h2>

        <label className={labelClass}>
          Brand name
          <span className="sr-only">(required)</span>
          <input
            type="text"
            name="name"
            autoComplete="off"
            placeholder="Acme Supplements"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
            disabled={loading}
            required
          />
        </label>

        <label className={labelClass}>
          Category
          <span className="sr-only">(required)</span>
          <select
            name="category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={fieldClass}
            disabled={loading}
          >
            <option value="">Select a category…</option>
            {BRAND_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Description <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
          <textarea
            name="description"
            rows={3}
            placeholder="Products you sell and who you sell to…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${fieldClass} min-h-[80px] resize-y`}
            disabled={loading}
          />
        </label>

        <label className={labelClass}>
          Commission context <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
          <textarea
            name="commission_context"
            rows={3}
            placeholder="Commission rates, payment terms, bonuses…"
            value={commissionContext}
            onChange={(e) => setCommissionContext(e.target.value)}
            className={`${fieldClass} min-h-[80px] resize-y`}
            disabled={loading}
          />
        </label>

        <label className={labelClass}>
          Exclusion list <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
          <textarea
            name="exclusion_list"
            rows={3}
            placeholder="Topics, competitors, or claims to avoid…"
            value={exclusionList}
            onChange={(e) => setExclusionList(e.target.value)}
            className={`${fieldClass} min-h-[80px] resize-y`}
            disabled={loading}
          />
        </label>

        <label className={labelClass}>
          Approved claims <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
          <textarea
            name="approved_claims"
            rows={3}
            placeholder="Pre-approved marketing claims or messaging guidelines…"
            value={approvedClaims}
            onChange={(e) => setApprovedClaims(e.target.value)}
            className={`${fieldClass} min-h-[80px] resize-y`}
            disabled={loading}
          />
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? "Saving…" : "Save brand"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
        >
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {successName && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
        >
          <p className="font-medium">&ldquo;{successName}&rdquo; saved successfully.</p>
        </div>
      )}
    </div>
  );
}
