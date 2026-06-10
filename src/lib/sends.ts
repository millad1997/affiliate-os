import "server-only";

// SECURITY: Reads/writes the `sends` AUDIT table via the service-role Supabase client, which
// bypasses RLS. Server-only (see import above) — never import into client/browser code.
// `sends` is an APPEND-ONLY audit trail of the (irreversible) outreach SEND: every attempt —
// success OR failure — is recorded as a new row and never mutated. RLS is enabled with NO
// policies, so the table is deny-all to anon/authenticated; only this service-role path reaches
// it. Contrast invite_decisions (upserts, latest-wins); sends NEVER upserts.
//
// Tenant isolation is enforced in TWO layers, both relying on userId originating from the
// server-validated session (caller's responsibility), NEVER client input:
//   1. WRITE: storeSend first re-reads the run double-scoped via getDiscoveryRun (id + user_id).
//      A run the caller does not own returns run_not_found and NO row is written. brand_id is
//      taken from the OWNED run, never the client, so the audit row is tenant-correct by
//      construction. A send is only recorded for a creator actually present in the run's plan
//      (creator_not_in_run otherwise).
//   2. READ: listSentCreatorOpenIds / listSendsForRun filter .eq("user_id", userId)
//      (service-role bypasses RLS).
//
// IDEMPOTENCY: a partial unique index on (run_id, creator_open_id) WHERE status='sent' makes a
// second SUCCESSFUL send to the same creator in the same run physically impossible. storeSend
// maps the resulting 23505 unique-violation to `already_sent` (distinct from store_failed) so a
// duplicate is never misreported as a transient failure. Failed attempts are unconstrained and
// stay retryable. Never logs row contents; fails closed.

import { getSupabaseServerClient } from "./supabase-server";
import { getDiscoveryRun } from "./discovery-runs";

export type SendStatus = "sent" | "failed";

export type StoredSend = {
  id: string;
  userId: string;
  runId: string;
  creatorOpenId: string;
  brandId: string;
  status: SendStatus;
  errorCode: string | null;
  createdAt: string;
};

type StoredSendRow = {
  id: string;
  user_id: string;
  run_id: string;
  creator_open_id: string;
  brand_id: string;
  status: SendStatus;
  error_code: string | null;
  created_at: string;
};

const SELECT_COLUMNS =
  "id, user_id, run_id, creator_open_id, brand_id, status, error_code, created_at";

function rowToStoredSend(row: StoredSendRow): StoredSend {
  return {
    id: row.id,
    userId: row.user_id,
    runId: row.run_id,
    creatorOpenId: row.creator_open_id,
    brandId: row.brand_id,
    status: row.status,
    errorCode: row.error_code,
    createdAt: row.created_at,
  };
}

export type StoreSendResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "run_not_found" | "creator_not_in_run" | "already_sent" | "store_failed";
    };

// Record one send attempt (success or failure) as a new audit row. userId MUST come from the
// server-validated session. Ownership is enforced by re-reading the run double-scoped before any
// write; a non-owned/unknown run yields run_not_found and writes nothing. Append-only (no upsert).
// A second status='sent' for the same (run, creator) returns already_sent (the partial unique
// index fires) — the storage-layer guarantee against double-send.
export async function storeSend(args: {
  runId: string;
  userId: string;
  creatorOpenId: string;
  status: SendStatus;
  errorCode?: string | null;
}): Promise<StoreSendResult> {
  const { runId, userId, creatorOpenId, status } = args;
  const errorCode = args.errorCode ?? null;

  const run = await getDiscoveryRun(runId, userId);
  if (!run.ok) {
    return run.reason === "not_found"
      ? { ok: false, reason: "run_not_found" }
      : { ok: false, reason: "store_failed" };
  }

  const inPlan = run.run.plan.invites.some((i) => i.creatorOpenId === creatorOpenId);
  if (!inPlan) {
    return { ok: false, reason: "creator_not_in_run" };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("sends")
      .insert({
        user_id: userId,
        run_id: runId,
        creator_open_id: creatorOpenId,
        brand_id: run.run.brandId,
        status,
        error_code: errorCode,
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      // 23505 = unique_violation on the partial index => a 'sent' row already exists.
      return error.code === "23505"
        ? { ok: false, reason: "already_sent" }
        : { ok: false, reason: "store_failed" };
    }
    if (!data) return { ok: false, reason: "store_failed" };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, reason: "store_failed" };
  }
}

export type ListSentCreatorOpenIdsResult =
  | { ok: true; creatorOpenIds: string[] }
  | { ok: false; reason: "query_failed" };

// The idempotency set: creators in one run with at least one SUCCESSFUL send (status='sent'),
// double-scoped run_id + user_id (the .eq enforces tenant isolation; service-role bypasses RLS).
// Feeds buildSendPlan's sentCreatorOpenIds. Deduped (the partial unique index already guarantees
// at most one 'sent' row per creator, so dedupe is defensive). userId MUST come from the session.
export async function listSentCreatorOpenIds(
  runId: string,
  userId: string,
): Promise<ListSentCreatorOpenIdsResult> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("sends")
      .select("creator_open_id")
      .eq("run_id", runId)
      .eq("user_id", userId)
      .eq("status", "sent")
      .returns<{ creator_open_id: string }[]>();
    if (error) return { ok: false, reason: "query_failed" };
    const unique = Array.from(new Set((data ?? []).map((r) => r.creator_open_id)));
    return { ok: true, creatorOpenIds: unique };
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}

export type ListSendsForRunResult =
  | { ok: true; sends: StoredSend[] }
  | { ok: false; reason: "query_failed" };

// Full audit of every send attempt for one run (sent AND failed), newest first, double-scoped by
// run_id + user_id (the .eq enforces tenant isolation; service-role bypasses RLS). userId MUST
// come from the server-validated session.
export async function listSendsForRun(
  runId: string,
  userId: string,
): Promise<ListSendsForRunResult> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("sends")
      .select(SELECT_COLUMNS)
      .eq("run_id", runId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .returns<StoredSendRow[]>();
    if (error) return { ok: false, reason: "query_failed" };
    return { ok: true, sends: (data ?? []).map(rowToStoredSend) };
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}
