import "server-only";
// SECURITY: This module reads a brand's descriptive/content fields (name, category,
// description, approved_claims) via the service-role Supabase client, which bypasses RLS.
// It is server-only (see the import above) and must NEVER be imported into client/browser
// code. Per-user isolation is enforced by the .eq("user_id", userId) filter, NOT by the
// database — userId must come from the server-validated session. It never logs row
// contents and fails closed. Mirrors brand-config-read.ts (same isolation discipline).
import { getSupabaseServerClient } from "./supabase-server";

// snake_case DB row. name/category are NOT NULL in the table; description/approved_claims
// are nullable. approved_claims is stored as free text (one claim per line by convention)
// and structured into a string[] at this boundary.
export type BrandContentRow = {
  name: string;
  category: string;
  description: string | null;
  approved_claims: string | null;
};

// camelCase shape the brief layer consumes. approvedClaims is ALWAYS an array (empty when
// the column is null/blank) so downstream code never branches on null for claims.
export type BrandBriefContext = {
  name: string;
  category: string;
  description: string | null;
  approvedClaims: string[];
};

export type GetBrandContentResult =
  | { ok: true; content: BrandBriefContext }
  | { ok: false; reason: "not_found" | "query_failed" | "malformed" };

// Injected row fetcher (DI seam for tests). Default does the real service-role read.
export type FetchBrandContentRow = (
  brandId: string,
  userId: string,
) => Promise<{ ok: true; row: BrandContentRow | null } | { ok: false }>;

const SELECT_COLUMNS = "name, category, description, approved_claims";

// SECURITY: service-role client bypasses RLS, so the .eq("user_id", userId) filter below
// is what enforces per-user isolation. userId MUST come from the server-validated session
// (caller's responsibility), never from client input. Never logs row contents.
const defaultFetchBrandContentRow: FetchBrandContentRow = async (brandId, userId) => {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .select(SELECT_COLUMNS)
      .eq("id", brandId)
      .eq("user_id", userId)
      .maybeSingle<BrandContentRow>();
    if (error) return { ok: false };
    return { ok: true, row: data ?? null };
  } catch {
    return { ok: false };
  }
};

// Structure the free-text approved_claims column into individual claim strings.
// Convention: one claim per line. Splits on CR/LF/CRLF, trims each line, drops blanks.
// null/blank => [] (no claims on file).
export function parseApprovedClaims(raw: string | null): string[] {
  if (raw === null) return [];
  return raw
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// Map the snake_case row into BrandBriefContext. Fails closed (null) if a NOT NULL text
// field somehow arrives blank — shouldn't happen given the schema, but we don't trust the
// row blindly.
function rowToContext(row: BrandContentRow): BrandBriefContext | null {
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const category = typeof row.category === "string" ? row.category.trim() : "";
  if (name.length === 0 || category.length === 0) return null;
  const descRaw = row.description;
  const description = descRaw !== null && descRaw.trim().length > 0 ? descRaw : null;
  return {
    name,
    category,
    description,
    approvedClaims: parseApprovedClaims(row.approved_claims),
  };
}

export async function getBrandContent(
  brandId: string,
  userId: string,
  fetchRow: FetchBrandContentRow = defaultFetchBrandContentRow,
): Promise<GetBrandContentResult> {
  const res = await fetchRow(brandId, userId);
  if (!res.ok) return { ok: false, reason: "query_failed" };
  if (res.row === null) return { ok: false, reason: "not_found" };
  const content = rowToContext(res.row);
  if (content === null) return { ok: false, reason: "malformed" };
  return { ok: true, content };
}
