import Link from "next/link";
import { requireUser } from "@/lib/require-user";
import { getTikTokConnectionStatus } from "@/lib/tiktok-credentials";
import LogoutButton from "@/components/LogoutButton";

// cookies() and getUser() are request-time operations — force dynamic rendering
// so the auth check and connection status are always fresh.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const status = await getTikTokConnectionStatus(user.id);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Affiliate Commerce OS</p>
            <h1 className="text-lg font-semibold">Settings</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/brands"
              className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Brands
            </Link>
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
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">TikTok Shop</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Connect your TikTok Shop account to import affiliate data.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            {status.connected ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Connected</p>
                </div>
                <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {status.sellerName ?? "Your TikTok Shop"}
                </p>
                {status.sellerBaseRegion && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Region: {status.sellerBaseRegion}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Connect your TikTok Shop to import affiliate data.
                </p>
                <a
                  href="/api/tiktok/authorize"
                  className="inline-flex h-11 w-fit items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Connect TikTok Shop
                </a>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
