"use client";

import Link from "next/link";
import { useState } from "react";
import LogoutButton from "@/components/LogoutButton";

const BRAND_CATEGORIES = [
  "Supplements & Wellness",
  "Beauty & Skincare",
  "Men's Grooming",
  "Sports Nutrition",
  "Food & Beverage",
  "Apparel",
  "Other",
] as const;

export type SavedBrand = {
  id: string;
  name: string;
  category: string;
  description: string | null;
};

type SuccessPayload = {
  username: string;
  score: number;
  rationale: string;
};

type ErrorPayload = {
  error: string;
  debugRaw?: string;
};

const fieldClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-normal text-zinc-900 outline-none ring-zinc-400 placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500";

const labelClass = "flex flex-col gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200";

export default function CreatorScoreForm({ savedBrands }: { savedBrands: SavedBrand[] }) {
  const [username, setUsername] = useState("");
  const [brandCategory, setBrandCategory] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [creatorBio, setCreatorBio] = useState("");
  const [followerCount, setFollowerCount] = useState("");
  const [recentCaptions, setRecentCaptions] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState("");

  // GMV
  const [totalGmv, setTotalGmv] = useState("");
  const [gmvLast30d, setGmvLast30d] = useState("");

  // Posting cadence
  const [postsLast30d, setPostsLast30d] = useState("");
  const [postsLast7d, setPostsLast7d] = useState("");
  const [avgPostsPerWeek12w, setAvgPostsPerWeek12w] = useState("");

  // Engagement
  const [likesLast30d, setLikesLast30d] = useState("");
  const [likesLast7d, setLikesLast7d] = useState("");
  const [viewsLast30d, setViewsLast30d] = useState("");
  const [viewsLast7d, setViewsLast7d] = useState("");
  const [commentsLast30d, setCommentsLast30d] = useState("");
  const [commentsLast7d, setCommentsLast7d] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SuccessPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugRaw, setDebugRaw] = useState<string | null>(null);

  const isManual = selectedBrandId === "";
  const selectedBrand = savedBrands.find((b) => b.id === selectedBrandId) ?? null;
  const canSubmit = !!(username.trim() && (isManual ? brandCategory : selectedBrandId) && !loading);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setDebugRaw(null);

    const followerParsed = followerCount.trim();

    let payload: Record<string, unknown>;

    if (isManual) {
      payload = {
        username: username.trim(),
        brandCategory,
        brandDescription: brandDescription.trim(),
        creatorBio: creatorBio.trim(),
        recentCaptions: recentCaptions.trim(),
      };
    } else {
      payload = {
        username: username.trim(),
        brand_id: selectedBrandId,
        creatorBio: creatorBio.trim(),
        recentCaptions: recentCaptions.trim(),
      };
    }

    if (followerParsed) {
      payload.followerCount = followerParsed;
    }

    if (totalGmv.trim()) payload.totalGmv = totalGmv.trim();
    if (gmvLast30d.trim()) payload.gmvLast30d = gmvLast30d.trim();
    if (postsLast30d.trim()) payload.postsLast30d = postsLast30d.trim();
    if (postsLast7d.trim()) payload.postsLast7d = postsLast7d.trim();
    if (avgPostsPerWeek12w.trim()) payload.avgPostsPerWeek12w = avgPostsPerWeek12w.trim();
    if (likesLast30d.trim()) payload.likesLast30d = likesLast30d.trim();
    if (likesLast7d.trim()) payload.likesLast7d = likesLast7d.trim();
    if (viewsLast30d.trim()) payload.viewsLast30d = viewsLast30d.trim();
    if (viewsLast7d.trim()) payload.viewsLast7d = viewsLast7d.trim();
    if (commentsLast30d.trim()) payload.commentsLast30d = commentsLast30d.trim();
    if (commentsLast7d.trim()) payload.commentsLast7d = commentsLast7d.trim();

    try {
      const res = await fetch("/api/creator-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as SuccessPayload | ErrorPayload;

      if (!res.ok) {
        const err = "error" in data ? data.error : "Request failed.";
        setError(err);
        if ("debugRaw" in data && data.debugRaw) setDebugRaw(data.debugRaw);
        return;
      }

      if ("score" in data && "rationale" in data) {
        setResult(data);
      } else {
        setError("Unexpected response from server.");
      }
    } catch {
      setError("Network error. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Affiliate Commerce OS</p>
            <h1 className="text-lg font-semibold">Creator score</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/scored-creators"
              className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Scored creators
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Describe your brand and paste what you know about a TikTok creator. The app sends that context to Claude and
          returns a 1–100 match score plus a short rationale for your affiliate recruiting workflow.
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <section className="flex flex-col gap-4">
            <h2 className="border-b border-zinc-200 pb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              About the brand
            </h2>

            {savedBrands.length > 0 && (
              <label className={labelClass}>
                Brand
                <select
                  value={selectedBrandId}
                  onChange={(e) => setSelectedBrandId(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                >
                  <option value="">— Enter brand details manually —</option>
                  {savedBrands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!isManual && selectedBrand && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/60">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{selectedBrand.name}</p>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{selectedBrand.category}</p>
                {selectedBrand.description && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {selectedBrand.description}
                  </p>
                )}
              </div>
            )}

            {isManual && (
              <>
                <label className={labelClass}>
                  Brand category
                  <span className="sr-only">(required)</span>
                  <select
                    name="brandCategory"
                    required
                    value={brandCategory}
                    onChange={(e) => setBrandCategory(e.target.value)}
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
                  Brand description{" "}
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                  <textarea
                    name="brandDescription"
                    rows={4}
                    placeholder="Products you sell and who you sell to…"
                    value={brandDescription}
                    onChange={(e) => setBrandDescription(e.target.value)}
                    className={`${fieldClass} min-h-[100px] resize-y`}
                    disabled={loading}
                  />
                </label>
              </>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="border-b border-zinc-200 pb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              About the creator
            </h2>
            <label className={labelClass}>
              TikTok username
              <input
                type="text"
                name="username"
                autoComplete="off"
                placeholder="@creator or creator"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={fieldClass}
                disabled={loading}
              />
            </label>
            <label className={labelClass}>
              Creator bio <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
              <textarea
                name="creatorBio"
                rows={3}
                placeholder="Paste their profile bio…"
                value={creatorBio}
                onChange={(e) => setCreatorBio(e.target.value)}
                className={`${fieldClass} min-h-[80px] resize-y`}
                disabled={loading}
              />
            </label>
            <label className={labelClass}>
              Follower count <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
              <input
                type="number"
                name="followerCount"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="e.g. 125000"
                value={followerCount}
                onChange={(e) => setFollowerCount(e.target.value)}
                className={fieldClass}
                disabled={loading}
              />
            </label>
            <label className={labelClass}>
              Recent post captions{" "}
              <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
              <textarea
                name="recentCaptions"
                rows={5}
                placeholder="Paste several captions; separate each with a blank line…"
                value={recentCaptions}
                onChange={(e) => setRecentCaptions(e.target.value)}
                className={`${fieldClass} min-h-[120px] resize-y font-mono text-sm`}
                disabled={loading}
              />
            </label>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="border-b border-zinc-200 pb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              GMV
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <label className={labelClass}>
                Total GMV (USD) <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="totalGmv"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 48500.00"
                  value={totalGmv}
                  onChange={(e) => setTotalGmv(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
              <label className={labelClass}>
                Last-30-day GMV (USD) <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="gmvLast30d"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 3200.50"
                  value={gmvLast30d}
                  onChange={(e) => setGmvLast30d(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="border-b border-zinc-200 pb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Posting cadence
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <label className={labelClass}>
                Posts (last 30 days) <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="postsLast30d"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 24"
                  value={postsLast30d}
                  onChange={(e) => setPostsLast30d(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
              <label className={labelClass}>
                Posts (last 7 days) <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="postsLast7d"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 5"
                  value={postsLast7d}
                  onChange={(e) => setPostsLast7d(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
              <label className={labelClass}>
                Avg posts/week (last 12 weeks){" "}
                <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="avgPostsPerWeek12w"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 5.5"
                  value={avgPostsPerWeek12w}
                  onChange={(e) => setAvgPostsPerWeek12w(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="border-b border-zinc-200 pb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Engagement
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <label className={labelClass}>
                Likes (last 30d) <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="likesLast30d"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 420000"
                  value={likesLast30d}
                  onChange={(e) => setLikesLast30d(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
              <label className={labelClass}>
                Likes (last 7d) <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="likesLast7d"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 95000"
                  value={likesLast7d}
                  onChange={(e) => setLikesLast7d(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
              <label className={labelClass}>
                Views (last 30d) <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="viewsLast30d"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 2100000"
                  value={viewsLast30d}
                  onChange={(e) => setViewsLast30d(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
              <label className={labelClass}>
                Views (last 7d) <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="viewsLast7d"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 480000"
                  value={viewsLast7d}
                  onChange={(e) => setViewsLast7d(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
              <label className={labelClass}>
                Comments (last 30d) <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="commentsLast30d"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 8400"
                  value={commentsLast30d}
                  onChange={(e) => setCommentsLast30d(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
              <label className={labelClass}>
                Comments (last 7d) <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                <input
                  type="number"
                  name="commentsLast7d"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 1900"
                  value={commentsLast7d}
                  onChange={(e) => setCommentsLast7d(e.target.value)}
                  className={fieldClass}
                  disabled={loading}
                />
              </label>
            </div>
          </section>

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Scoring…" : "Get creator score"}
          </button>
        </form>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
          >
            <p className="font-medium">Something went wrong</p>
            <p className="mt-1">{error}</p>
            {debugRaw && (
              <details className="mt-3 text-xs text-red-800/90 dark:text-red-200/90">
                <summary className="cursor-pointer font-medium">Technical detail</summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-red-100/80 p-2 dark:bg-red-900/40">
                  {debugRaw}
                </pre>
              </details>
            )}
          </div>
        )}

        {result && (
          <section
            aria-live="polite"
            className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-6 dark:border-emerald-900/50 dark:bg-emerald-950/30"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300/90">
              @{result.username}
            </p>
            <p className="mt-2 text-4xl font-bold tabular-nums text-emerald-950 dark:text-emerald-50">{result.score}</p>
            <p className="text-sm font-medium text-emerald-900/80 dark:text-emerald-200/90">Brand–creator match score</p>
            <p className="mt-4 text-sm leading-relaxed text-emerald-950/90 dark:text-emerald-100/90">{result.rationale}</p>
          </section>
        )}
      </main>
    </div>
  );
}
