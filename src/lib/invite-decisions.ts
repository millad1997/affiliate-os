import "server-only";

// SECURITY: Reads/writes invite_decisions via the service-role Supabase client, which
// bypasses RLS. Server-only (see import above) — never import into client/browser code.
// Records per-(run, creator) operator decisions on a discovery run's outreach plan.
//
// Tenant isolation is enforced in TWO layers, both relying on userId originating from the
// server-validated session (caller's responsibility), NEVER client input:
//   1. WRITE: storeInviteDecision first re-reads the run double-scoped via getDiscoveryRun
//      (id + user_id). A run the caller does not own returns run_not_found and NO row is
//      written — a caller can never record a decision against another tenant's run.
//   2. READ: listInviteDecisions filters .eq("user_id", userId) (service-role bypasses RLS).
// A decision is additionally only accepted for a creator that actually appears in the run's
// plan (creator_not_in_run otherwise). Never logs row contents; fails closed.

import { getSupabaseServerClient } from "./supabase-server";
import { getDiscoveryRun } from "./discovery-runs";

export type InviteDecisionValue = "approved" | "rejected";

function isInviteDecisionValue(v: string): v is InviteDecisionValue {
  return v === "approved" || v === "rejected";
}

export type InviteDecision = {
  id: string;
  userId: string;
  runId: string;
  creatorOpenId: string;
  decision: InviteDecisionValue;
  createdAt: string;
  updatedAt: string;
};

type InviteDecisionRow = {
  id: string;
  user_id: string;
  run_id: string;
  creator_open_id: string;
  decision: InviteDecisionValue;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS =
  "id, user_id, run_id, creator_open_id, decision, created_at, updated_at";

function rowToDecision(row: InviteDecisionRow): InviteDecision {
  return {
    id: row.id,
    userId: row.user_id,
    runId: row.run_id,
    creatorOpenId: row.creator_open_id,
    decision: row.decision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type StoreInviteDecisionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason:
        | "run_not_found"
        | "creator_not_in_run"
        | "invalid_decision"
        | "store_failed";
    };

// Record (or change) the operator's decision for one creator in one run's plan.
// userId MUST come from the server-validated session. Ownership is enforced by re-reading
// the run double-scoped (getDiscoveryRun) before any write; a non-owned/unknown run yields
// run_not_found and writes nothing. Upserts on (run_id, creator_open_id) so a later decision
// overwrites an earlier one (e.g. approved -> rejected). Returns value-free reasons.
export async function storeInviteDecision(args: {
  runId: string;
  userId: string;
  creatorOpenId: string;
  decision: string;
}): Promise<StoreInviteDecisionResult> {
  const { runId, userId, creatorOpenId, decision } = args;

  if (!isInviteDecisionValue(decision)) {
    return { ok: false, reason: "invalid_decision" };
  }

  // Ownership gate: re-read the run double-scoped (id + user_id). This is the write-side
  // isolation boundary — a run the caller does not own is indistinguishable from a missing
  // run, and nothing is written. A genuine query failure is transient -> store_failed.
  const run = await getDiscoveryRun(runId, userId);
  if (!run.ok) {
    return run.reason === "not_found"
      ? { ok: false, reason: "run_not_found" }
      : { ok: false, reason: "store_failed" };
  }

  // Integrity gate: only allow decisions on creators actually present in the run's plan.
  const inPlan = run.run.plan.invites.some(
    (i) => i.creatorOpenId === creatorOpenId,
  );
  if (!inPlan) {
    return { ok: false, reason: "creator_not_in_run" };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("invite_decisions")
      .upsert(
        {
          user_id: userId,
          run_id: runId,
          creator_open_id: creatorOpenId,
          decision,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "run_id,creator_open_id" },
      )
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !data) return { ok: false, reason: "store_failed" };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, reason: "store_failed" };
  }
}

export type ListInviteDecisionsResult =
  | { ok: true; decisions: InviteDecision[] }
  | { ok: false; reason: "query_failed" };

// List all decisions for one run, double-scoped by run_id + user_id. The .eq("user_id", …)
// filter is what enforces tenant isolation (service-role bypasses RLS). userId MUST come
// from the server-validated session.
export async function listInviteDecisions(
  runId: string,
  userId: string,
): Promise<ListInviteDecisionsResult> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("invite_decisions")
      .select(SELECT_COLUMNS)
      .eq("run_id", runId)
      .eq("user_id", userId)
      .returns<InviteDecisionRow[]>();
    if (error) return { ok: false, reason: "query_failed" };
    return { ok: true, decisions: (data ?? []).map(rowToDecision) };
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}

export type DeleteInviteDecisionResult =
  | { ok: true }
  | { ok: false; reason: "run_not_found" | "delete_failed" };

// Clear (delete) the operator's decision for one creator in one run's plan, returning that
// creator to the implicit "pending" state. userId MUST come from the server-validated
// session. Ownership is enforced by re-reading the run double-scoped (getDiscoveryRun)
// before any delete — the write-side isolation boundary, identical to storeInviteDecision:
// a run the caller does not own is indistinguishable from a missing run and nothing is
// deleted (run_not_found). The delete itself is additionally triple-scoped
// (run_id + creator_open_id + user_id) as defense-in-depth, so even a logic slip cannot
// reach another tenant's row. Idempotent: clearing when no decision exists still succeeds —
// the desired end state (no decision) holds either way. Never logs row contents; fails closed.
export async function deleteInviteDecision(args: {
  runId: string;
  userId: string;
  creatorOpenId: string;
}): Promise<DeleteInviteDecisionResult> {
  const { runId, userId, creatorOpenId } = args;

  const run = await getDiscoveryRun(runId, userId);
  if (!run.ok) {
    return run.reason === "not_found"
      ? { ok: false, reason: "run_not_found" }
      : { ok: false, reason: "delete_failed" };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("invite_decisions")
      .delete()
      .eq("run_id", runId)
      .eq("creator_open_id", creatorOpenId)
      .eq("user_id", userId);
    if (error) return { ok: false, reason: "delete_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "delete_failed" };
  }
}
