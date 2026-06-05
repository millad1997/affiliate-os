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

  // Discovery & outreach config — defaults match the server-side validator defaults
  const [targetCategoryIds, setTargetCategoryIds] = useState("");
  const [targetRegions, setTargetRegions] = useState("");
  const [minFollowers, setMinFollowers] = useState("");
  const [gateRegion, setGateRegion] = useState(true);
  const [gateFollowers, setGateFollowers] = useState(false);
  const [gateCategory, setGateCategory] = useState(false);
  const [maxInvites, setMaxInvites] = useState("50");
  const [commissionRate, setCommissionRate] = useState("10");
  const [minGmvFloor, setMinGmvFloor] = useState("");

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
          target_category_ids: targetCategoryIds,
          target_regions: targetRegions,
          min_followers: minFollowers,
          gate_region: gateRegion,
          gate_followers: gateFollowers,
          gate_category: gateCategory,
          max_invites: maxInvites,
          commission_rate: commissionRate,
          min_gmv_floor: minGmvFloor,
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
      setTargetCategoryIds("");
      setTargetRegions("");
      setMinFollowers("");
      setGateRegion(true);
      setGateFollowers(false);
      setGateCategory(false);
      setMaxInvites("50");
      setCommissionRate("10");
      setMinGmvFloor("");
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

        {/* Discovery & outreach config */}
        <div className="flex flex-col gap-6">
          <h3 className="border-b border-zinc-200 pb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Discovery &amp; outreach config
          </h3>

          <label className={labelClass}>
            Target categories <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
            <input
              type="text"
              name="target_category_ids"
              placeholder="60001, 60002"
              value={targetCategoryIds}
              onChange={(e) => setTargetCategoryIds(e.target.value)}
              className={fieldClass}
              disabled={loading}
            />
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              Comma-separated TikTok category IDs
            </span>
          </label>

          <label className={labelClass}>
            Target regions <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
            <input
              type="text"
              name="target_regions"
              placeholder="US"
              value={targetRegions}
              onChange={(e) => setTargetRegions(e.target.value)}
              className={fieldClass}
              disabled={loading}
            />
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              Comma-separated region codes
            </span>
          </label>

          <label className={labelClass}>
            Minimum followers <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
            <input
              type="number"
              name="min_followers"
              min={0}
              step={1}
              value={minFollowers}
              onChange={(e) => setMinFollowers(e.target.value)}
              className={fieldClass}
              disabled={loading}
            />
          </label>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Hard filters
            </legend>

            <label className="flex cursor-pointer items-center gap-3 text-sm font-normal text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                name="gate_region"
                checked={gateRegion}
                onChange={(e) => setGateRegion(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-100"
              />
              Region is a hard filter
            </label>

            <label className="flex cursor-pointer items-center gap-3 text-sm font-normal text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                name="gate_followers"
                checked={gateFollowers}
                onChange={(e) => setGateFollowers(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-100"
              />
              Followers is a hard filter
            </label>

            <label className="flex cursor-pointer items-center gap-3 text-sm font-normal text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                name="gate_category"
                checked={gateCategory}
                onChange={(e) => setGateCategory(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-100"
              />
              Category is a hard filter
            </label>
          </fieldset>

          <label className={labelClass}>
            Max invites
            <input
              type="number"
              name="max_invites"
              min={0}
              step={1}
              value={maxInvites}
              onChange={(e) => setMaxInvites(e.target.value)}
              className={fieldClass}
              disabled={loading}
            />
          </label>

          <label className={labelClass}>
            Commission rate
            <input
              type="number"
              name="commission_rate"
              min={0}
              step="any"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              className={fieldClass}
              disabled={loading}
            />
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              Flat %, e.g. 15
            </span>
          </label>

          <label className={labelClass}>
            Minimum GMV floor <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
            <input
              type="number"
              name="min_gmv_floor"
              min={0}
              step="any"
              value={minGmvFloor}
              onChange={(e) => setMinGmvFloor(e.target.value)}
              className={fieldClass}
              disabled={loading}
            />
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              Blank = no floor
            </span>
          </label>
        </div>

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
