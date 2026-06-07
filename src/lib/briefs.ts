import "server-only";

// SECURITY: Reads/writes the `briefs` AUDIT table via the service-role Supabase client, which
// bypasses RLS. Server-only (see import above) — never import into client/browser code.
// `briefs` is an APPEND-ONLY audit trail: every brief generation (and its §3.7 compliance scan
// outcome) is recorded as a new row and never mutated, so the full history of what was generated
// and how it scored is preserved. Contrast invite_decisions, which upserts (latest-wins); briefs
// NEVER upserts.
//
// Tenant isolation is enforced in TWO layers, both relying on userId originating from the
// server-validated session (caller's responsibility), NEVER client input:
//   1. WRITE: storeBrief first re-reads the run double-scoped via getDiscoveryRun (id + user_id).
//      A run the caller does not own returns run_not_found and NO row is written — a caller can
//      never persist a brief against another tenant's run. brand_id is taken from the OWNED run,
//      never the client, so the audit row is tenant-correct by construction.
//   2. READ: getLatestBrief / listBriefsForRun filter .eq("user_id", userId) (service-role
//      bypasses RLS). A brief is additionally only persisted for a creator actually present in
//      the run's plan (creator_not_in_run otherwise). Approval is enforced UPSTREAM by the brief
//      route's cost guard; this module does not re-check it. Never logs row contents; fails closed.

import { getSupabaseServerClient } from "./supabase-server";
import { getDiscoveryRun } from "./discovery-runs";
import type { ContentBrief } from "./content-brief";
import type { ComplianceScan } from "./compliance-scan";

export type BriefVerdict = "pass" | "flagged" | "unavailable";

export type StoredBrief = {
  id: string;
  userId: string;
  runId: string;
  creatorOpenId: string;
  brandId: string;
  brief: ContentBrief;
  scan: ComplianceScan | null;
  verdict: BriefVerdict;
  createdAt: string;
};

type StoredBriefRow = {
  id: string;
  user_id: string;
  run_id: string;
  creator_open_id: string;
  brand_id: string;
  brief: ContentBrief;
  scan: ComplianceScan | null;
  verdict: BriefVerdict;
  created_at: string;
};

const SELECT_COLUMNS =
  "id, user_id, run_id, creator_open_id, brand_id, brief, scan, verdict, created_at";

function rowToStoredBrief(row: StoredBriefRow): StoredBrief {
  return {
    id: row.id,
    userId: row.user_id,
    runId: row.run_id,
    creatorOpenId: row.creator_open_id,
    brandId: row.brand_id,
    brief: row.brief,
    scan: row.scan,
    verdict: row.verdict,
    createdAt: row.created_at,
  };
}

// scan === null (compliance check unavailable) is recorded explicitly as "unavailable" so the
// audit can distinguish "passed" from "never scanned".
function deriveVerdict(scan: ComplianceScan | null): BriefVerdict {
  return scan === null ? "unavailable" : scan.verdict;
}

export type StoreBriefResult =
  | { ok: true; id: string }
  | { ok: false; reason: "run_not_found" | "creator_not_in_run" | "store_failed" };

// Persist one generated brief + its scan outcome as a new audit row. userId MUST come from the
// server-validated session. Ownership is enforced by re-reading the run double-scoped before any
// write; a non-owned/unknown run yields run_not_found and writes nothing. Append-only (no upsert).
export async function storeBrief(args: {
  runId: string;
  userId: string;
  creatorOpenId: string;
  brief: ContentBrief;
  scan: ComplianceScan | null;
}): Promise<StoreBriefResult> {
  const { runId, userId, creatorOpenId, brief, scan } = args;

  // Ownership gate (write-side isolation): re-read the run double-scoped (id + user_id). A run
  // the caller does not own is indistinguishable from a missing run; nothing is written. A
  // genuine query failure is transient -> store_failed.
  const run = await getDiscoveryRun(runId, userId);
  if (!run.ok) {
    return run.reason === "not_found"
      ? { ok: false, reason: "run_not_found" }
      : { ok: false, reason: "store_failed" };
  }

  // Integrity gate: only persist a brief for a creator actually present in the run's plan.
  const inPlan = run.run.plan.invites.some((i) => i.creatorOpenId === creatorOpenId);
  if (!inPlan) {
    return { ok: false, reason: "creator_not_in_run" };
  }

  // Append-only insert (NOT an upsert) — each generation is a distinct audit row. brand_id is
  // taken from the OWNED run, never the client.
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("briefs")
      .insert({
        user_id: userId,
        run_id: runId,
        creator_open_id: creatorOpenId,
        brand_id: run.run.brandId,
        brief,
        scan,
        verdict: deriveVerdict(scan),
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !data) return { ok: false, reason: "store_failed" };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, reason: "store_failed" };
  }
}

export type GetLatestBriefResult =
  | { ok: true; brief: StoredBrief | null }
  | { ok: false; reason: "query_failed" };

// Most-recent stored brief for one (run, creator), triple-scoped by run_id + creator_open_id +
// user_id. The .eq("user_id", …) filter enforces tenant isolation (service-role bypasses RLS).
// userId MUST come from the server-validated session. null => none on file.
export async function getLatestBrief(
  runId: string,
  creatorOpenId: string,
  userId: string,
): Promise<GetLatestBriefResult> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("briefs")
      .select(SELECT_COLUMNS)
      .eq("run_id", runId)
      .eq("creator_open_id", creatorOpenId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<StoredBriefRow>();
    if (error) return { ok: false, reason: "query_failed" };
    return { ok: true, brief: data ? rowToStoredBrief(data) : null };
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}

export type ListBriefsForRunResult =
  | { ok: true; briefs: StoredBrief[] }
  | { ok: false; reason: "query_failed" };

// All stored briefs for one run (the audit trail), newest first, double-scoped by run_id +
// user_id (the .eq is what enforces tenant isolation; service-role bypasses RLS). userId MUST
// come from the server-validated session.
export async function listBriefsForRun(
  runId: string,
  userId: string,
): Promise<ListBriefsForRunResult> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("briefs")
      .select(SELECT_COLUMNS)
      .eq("run_id", runId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .returns<StoredBriefRow[]>();
    if (error) return { ok: false, reason: "query_failed" };
    return { ok: true, briefs: (data ?? []).map(rowToStoredBrief) };
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}
