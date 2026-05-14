"use client";

import Link from "next/link";
import { useState } from "react";

type SuccessPayload = {
  username: string;
  score: number;
  rationale: string;
};

type ErrorPayload = {
  error: string;
  debugRaw?: string;
};

export default function CreatorScorePage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SuccessPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugRaw, setDebugRaw] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setDebugRaw(null);

    try {
      const res = await fetch("/api/creator-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username }),
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
            <h1 className="text-lg font-semibold">Creator score (demo)</h1>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Paste a TikTok username. The app sends it to Claude with a placeholder prompt (no real TikTok data yet) and
          shows a hypothetical score from 1–100.
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            TikTok username
            <input
              type="text"
              name="username"
              autoComplete="off"
              placeholder="@creator or creator"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-normal text-zinc-900 outline-none ring-zinc-400 placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500"
              disabled={loading}
            />
          </label>
          <button
            type="submit"
            disabled={loading || !username.trim()}
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
            <p className="text-sm font-medium text-emerald-900/80 dark:text-emerald-200/90">Creator score (placeholder)</p>
            <p className="mt-4 text-sm leading-relaxed text-emerald-950/90 dark:text-emerald-100/90">{result.rationale}</p>
          </section>
        )}
      </main>
    </div>
  );
}
