// SECURITY: Pure orchestration for the outreach SEND endpoint — no `import "server-only"`,
// safe under plain npx tsx. POST /api/sends triggers IRREVERSIBLE outreach to real creators,
// so this core upholds the brief-route guard ladder and adds the send-specific invariants:
//   • Same-origin guard (CSRF) via shared isSameOrigin — rejected before any work.
//   • userId comes ONLY from deps (server-validated session), NEVER the request body.
//   • Ownership: the run is re-read double-scoped; non-owned => run_not_found, nothing runs.
//   • Eligibility is decided EXCLUSIVELY by buildSendPlan (only approved; never twice per
//     run) — this core never constructs its own eligibility logic.
//   • OUTREACH-CONFIG PREFLIGHT: the brand's outreach config (read via injected
//     getOutreachConfig) must be attemptable — assessOutreachReadiness is the single source
//     of truth. Incomplete config => 409 outreach_config_incomplete with the controlled-
//     vocabulary missing list (operator-actionable, never secret); NOTHING else runs.
//   • COMPLIANCE GATE (strict, by product decision): outreach only goes out for a creator
//     whose LATEST stored brief has verdict "pass". No brief => skipped_no_brief; verdict
//     "flagged" or "unavailable" => skipped_not_compliant. Skips are reported, never silent.
//   • Audit honesty: persistSend failures are NOT swallowed (contrast brief-route-core's
//     best-effort persist). For an irreversible action the audit row IS the safety record —
//     an adapter success whose audit write fails is surfaced as sent_unrecorded so the
//     operator knows that creator must NOT be retried blindly. A persist returning
//     already_sent (lost race; a sent row exists from a concurrent writer) maps to "sent".
//   • RACE NOTE: the provider call necessarily precedes the audit write; the partial unique
//     index makes a second 'sent' ROW impossible, but provider-level idempotency (slice 5)
//     is the only complete fix. The stub era is unaffected.
//   • All error strings are fixed constants; no id, header, body value, brief content, or
//     adapter message ever appears in a response. The composed message is passed only to the
//     adapter, never echoed back.
// All IO is injected; every cross-module import is `import type` (erased) EXCEPT isSameOrigin,
// buildSendPlan, and assessOutreachReadiness, all pure — so this core stays pure (plain `npx tsx`).

import { isSameOrigin, type SameOriginHeaders } from "./same-origin-guard";
import { buildSendPlan } from "./outreach-send-plan";
import { assessOutreachReadiness, type OutreachMissingField } from "./outreach-readiness";
import type { GetDiscoveryRunResult } from "./discovery-runs";
import type { GetBrandOutreachConfigResult } from "./brand-outreach-config-read";
import type { ListInviteDecisionsResult } from "./invite-decisions";
import type { GetLatestBriefResult } from "./briefs";
import type { ListSentCreatorOpenIdsResult, StoreSendResult, SendStatus } from "./sends";
import type { ContentBrief } from "./content-brief";
import type { OutreachSendAdapter } from "./outreach-send-adapter";

export type SendRouteDeps = {
  userId: string; // MUST originate from the server-validated session
  getRun: (runId: string, userId: string) => Promise<GetDiscoveryRunResult>;
  // Reads the run's brand outreach config (server-only impl; injected). Preflight only.
  getOutreachConfig: (brandId: string, userId: string) => Promise<GetBrandOutreachConfigResult>;
  getDecisions: (runId: string, userId: string) => Promise<ListInviteDecisionsResult>;
  getSentCreatorOpenIds: (runId: string, userId: string) => Promise<ListSentCreatorOpenIdsResult>;
  getLatestBrief: (runId: string, creatorOpenId: string, userId: string) => Promise<GetLatestBriefResult>;
  // Pure serializer: stored brief -> outbound plain-text message.
  composeMessage: (brief: ContentBrief) => string;
  // The adapter seam (stub now, live TikTok at scope activation). Returns a result union.
  sendOutreach: OutreachSendAdapter;
  // Audit persistence. Receives validated ids; failures are NOT swallowed (see header).
  persistSend: (args: {
    runId: string;
    creatorOpenId: string;
    status: SendStatus;
    errorCode?: string | null;
  }) => Promise<StoreSendResult>;
};

export type SendCreatorStatus =
  | "sent"
  | "sent_unrecorded"
  | "failed"
  | "skipped_no_brief"
  | "skipped_not_compliant"
  | "lookup_failed";

export type SendCreatorResult = { creatorOpenId: string; status: SendCreatorStatus };

export type SendResponseBody =
  | { ok: true; results: SendCreatorResult[]; alreadySent: string[] }
  | { ok: false; error: string; missing?: OutreachMissingField[] };

export type SendRouteResult = {
  status: number;
  body: SendResponseBody;
};

export async function handleSendRequest(
  headers: SameOriginHeaders,
  rawBody: unknown,
  deps: SendRouteDeps,
): Promise<SendRouteResult> {
  // 1. Same-origin guard (CSRF) — before any work.
  if (!isSameOrigin(headers)) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }

  // 2. Validate body shape.
  if (typeof rawBody !== "object" || rawBody === null) {
    return { status: 400, body: { ok: false, error: "invalid_request" } };
  }
  const raw = rawBody as Record<string, unknown>;
  const runId = raw["runId"];
  if (typeof runId !== "string" || runId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_run_id" } };
  }
  const trimmedRunId = runId.trim();

  // 3. Ownership gate: re-read the run double-scoped (id + user_id). userId from deps.
  const runResult = await deps.getRun(trimmedRunId, deps.userId);
  if (!runResult.ok) {
    return runResult.reason === "not_found"
      ? { status: 404, body: { ok: false, error: "run_not_found" } }
      : { status: 500, body: { ok: false, error: "lookup_failed" } };
  }
  const run = runResult.run;

  // 3.5 Outreach-config preflight: the brand must have the fields without which a send
  //     cannot even be attempted. Runs before any other lookups — fix config first.
  const configResult = await deps.getOutreachConfig(run.brandId, deps.userId);
  if (!configResult.ok) {
    return { status: 500, body: { ok: false, error: "lookup_failed" } };
  }
  const readiness = assessOutreachReadiness(configResult.config);
  if (!readiness.ready) {
    return {
      status: 409,
      body: { ok: false, error: "outreach_config_incomplete", missing: readiness.missing },
    };
  }

  // 4. Resolve decisions and the already-sent set; eligibility is buildSendPlan's alone.
  const decisionsResult = await deps.getDecisions(trimmedRunId, deps.userId);
  if (!decisionsResult.ok) {
    return { status: 500, body: { ok: false, error: "lookup_failed" } };
  }
  const sentResult = await deps.getSentCreatorOpenIds(trimmedRunId, deps.userId);
  if (!sentResult.ok) {
    return { status: 500, body: { ok: false, error: "lookup_failed" } };
  }

  const plan = buildSendPlan({
    planCreatorOpenIds: run.plan.invites.map((i) => i.creatorOpenId),
    decisions: decisionsResult.decisions.map((d) => ({
      creatorOpenId: d.creatorOpenId,
      decision: d.decision,
    })),
    sentCreatorOpenIds: sentResult.creatorOpenIds,
  });

  // 5. Per-creator loop over toSend (plan-rank order). Creators are independent: one
  //    failure never aborts the rest.
  const results: SendCreatorResult[] = [];
  for (const creatorOpenId of plan.toSend) {
    // 5a. Compliance gate: latest stored brief must exist and carry verdict "pass".
    let briefResult: GetLatestBriefResult;
    try {
      briefResult = await deps.getLatestBrief(trimmedRunId, creatorOpenId, deps.userId);
    } catch {
      results.push({ creatorOpenId, status: "lookup_failed" });
      continue;
    }
    if (!briefResult.ok) {
      results.push({ creatorOpenId, status: "lookup_failed" });
      continue;
    }
    if (briefResult.brief === null) {
      results.push({ creatorOpenId, status: "skipped_no_brief" });
      continue;
    }
    if (briefResult.brief.verdict !== "pass") {
      results.push({ creatorOpenId, status: "skipped_not_compliant" });
      continue;
    }

    // 5b. Send via the adapter seam. The adapter returns a result union; a throw is
    //     treated as a failure outcome (defensive — adapters shouldn't throw).
    const message = deps.composeMessage(briefResult.brief.brief);
    let sendOk: boolean;
    let errorCode: string | null = null;
    let providerRefUnused: string | null = null;
    try {
      const sendResult = await deps.sendOutreach({ creatorOpenId, message });
      if (sendResult.ok) {
        sendOk = true;
        providerRefUnused = sendResult.providerRef;
      } else {
        sendOk = false;
        errorCode = sendResult.errorCode;
      }
    } catch {
      sendOk = false;
      errorCode = "adapter_threw";
    }
    void providerRefUnused;

    // 5c. Persist the outcome — NOT best-effort (see header).
    let persisted: StoreSendResult;
    try {
      persisted = await deps.persistSend({
        runId: trimmedRunId,
        creatorOpenId,
        status: sendOk ? "sent" : "failed",
        errorCode,
      });
    } catch {
      persisted = { ok: false, reason: "store_failed" };
    }

    if (sendOk) {
      if (persisted.ok) {
        results.push({ creatorOpenId, status: "sent" });
      } else if (persisted.reason === "already_sent") {
        // Lost race: a 'sent' row already exists — the audit is covered.
        results.push({ creatorOpenId, status: "sent" });
      } else {
        // Outreach went out but the audit write failed — surfaced, never swallowed.
        results.push({ creatorOpenId, status: "sent_unrecorded" });
      }
    } else {
      // Adapter failure. The 'failed' audit row keeps the creator retryable; if even that
      // write failed the creator is still reported failed (nothing irreversible happened).
      results.push({ creatorOpenId, status: "failed" });
    }
  }

  return { status: 200, body: { ok: true, results, alreadySent: plan.alreadySent } };
}
