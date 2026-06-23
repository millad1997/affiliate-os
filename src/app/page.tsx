import Link from "next/link";
import { getOptionalUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const features = [
  {
    title: "Discovery & scoring",
    body: "Find TikTok Shop affiliate creators and rank them with a composite score weighted toward recent performance — not vanity follower counts.",
  },
  {
    title: "Compliant briefs",
    body: "Generate content briefs aligned with FTC disclosure and FDA advertising standards, with automatic compliance scanning before anything ships.",
  },
  {
    title: "Audit trail",
    body: "Every approval, brief, and outreach decision is recorded in an append-only log, so your program stays accountable as it grows.",
  },
];

export default async function Home() {
  const user = await getOptionalUser();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white dark:bg-zinc-950">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Drover
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <Link
              href="/creator-score"
              className="flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Open app
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        <section className="max-w-2xl py-16 sm:py-24">
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            TikTok Shop affiliate operations
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
            Run affiliate creator programs that actually scale.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-lg">
            Drover helps direct-to-consumer brands find and score the right TikTok Shop affiliate
            creators, generate compliance-conscious content briefs, and keep a complete record of
            every outreach decision — built from real affiliate operations, not guesswork.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {user ? (
              <Link
                href="/creator-score"
                className="flex h-12 items-center justify-center rounded-xl bg-zinc-900 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Open app
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="flex h-12 items-center justify-center rounded-xl bg-zinc-900 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="flex h-12 items-center justify-center rounded-xl border border-zinc-200 bg-white px-6 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </section>

        <section className="grid gap-10 border-t border-zinc-100 py-16 dark:border-zinc-900 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{f.title}</h2>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-zinc-100 dark:border-zinc-900">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-3 px-6 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Drover</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">
              Privacy
            </Link>
            <a
              href="mailto:milliafshar@gmail.com"
              className="transition hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
