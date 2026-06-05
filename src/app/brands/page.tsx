import Link from "next/link";
import { requireUser } from "@/lib/require-user";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import BrandList, { type Brand } from "./BrandList";
import BrandForm from "./BrandForm";
import LogoutButton from "@/components/LogoutButton";

// cookies() and getUser() are request-time operations — force dynamic rendering
// so the list is always fresh and the auth check always runs.
export const dynamic = "force-dynamic";

async function fetchBrands(userId: string): Promise<{ brands: Brand[]; error: string | null }> {
  try {
    // Data fetching uses the service-role client (bypasses RLS) but we MUST
    // constrain the query to the current user's rows. The service-role key
    // can read every row in the table, so the .eq("user_id", userId) filter
    // below is what enforces per-user isolation in this code path.
    //
    // SECURITY: userId comes from requireUser() — a server-side check of the
    // Supabase auth cookies via the anon-key client. It is never read from
    // the URL, request body, or any client-controlled input, so a user cannot
    // ask to see someone else's rows.
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .select("id, name, category, description, commission_context, exclusion_list, approved_claims, created_at, target_category_ids, target_regions, min_followers, gate_region, gate_followers, gate_category, max_invites, commission_rate, min_gmv_floor")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[brands] Supabase fetch error:", error);
      return { brands: [], error: error.message };
    }

    return { brands: (data ?? []) as Brand[], error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[brands] Unexpected fetch error:", err);
    return { brands: [], error: msg };
  }
}

export default async function BrandsPage() {
  const user = await requireUser();
  const { brands, error } = await fetchBrands(user.id);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Affiliate Commerce OS</p>
            <h1 className="text-lg font-semibold">Brands</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/creator-score"
              className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Score a creator
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
        <BrandForm />

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
          >
            <p className="font-medium">Could not load brands</p>
            <p className="mt-1 font-mono text-xs">{error}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {brands.length === 0
                ? "No brands yet. Add your first brand above."
                : `${brands.length} brand${brands.length === 1 ? "" : "s"} — newest first. Click any row to expand.`}
            </p>
            <BrandList brands={brands} />
          </>
        )}
      </main>
    </div>
  );
}
