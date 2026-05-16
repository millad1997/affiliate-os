import Link from "next/link";
import { getOptionalUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getOptionalUser();

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="flex w-full max-w-md flex-col items-center gap-8 px-8 py-24 text-center">
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Affiliate Commerce OS</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            TikTok affiliate scoring
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            AI-assisted creator evaluation for DTC brands.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          {user ? (
            <>
              <Link
                href="/creator-score"
                className="flex h-12 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Score a creator
              </Link>
              <Link
                href="/scored-creators"
                className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                View scored creators
              </Link>
              <Link
                href="/brands"
                className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                Brands
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="flex h-12 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
