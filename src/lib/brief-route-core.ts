// src/lib/brief-route-core.ts
//
// SECURITY: Pure orchestration for the content-brief generation endpoint — no
// `import "server-only"`, safe under plain npx tsx. POST /api/briefs triggers a PAID
// LLM call on the user's behalf, so this core upholds:
//   • Same-origin guard (CSRF) via the shared isSameOrigin — rejected before any work.
//   • userId comes ONLY from deps (the server-validated session), NEVER the request body.
//   • Ownership: the run is re-read double-scoped (getRun is getDiscoveryRun, id + user_id);
//     a run the caller does not own is run_not_found and nothing downstream runs.
//   • Cost guard: the creator must be in the run's plan AND carry an "approved" decision
//     before a paid LLM call fires — a client cannot burn spend on arbitrary/unapproved ids.
//   • All error strings are fixed constants; no id, header, body value, brand field, or
//     thrown adapter message (which may carry an HTTP status) ever appears in a response.
//
// All IO is injected so the core is fully fixture-testable with no network/DB. Every cross-
// module import is `import type` (erased) EXCEPT isSameOrigin, which lives in the pure
// same-origin-guard module — so this core stays pure (plain `npx tsx`).
import { isSameOrigin, type SameOriginHeaders } from "./same-origin-guard";
import type { GetDiscoveryRunResult } from "./discovery-runs";
import type { ListInviteDecisionsResult } from "./invite-decisions";
import type { GetBrandContentResult, BrandBriefContext } from "./brand-content-read";
import type { BuildBriefResult, ContentBrief } from "./content-brief";
import type { ScanComplianceResult, ComplianceScan } from "./compliance-scan";

export type BriefRouteDeps = {
  userId: string; // MUST originate from the server-validated session
  getRun: (runId: string, userId: string) => Promise<GetDiscoveryRunResult>;
  getDecisions: (runId: string, userId: string) => Promise<ListInviteDecisionsResult>;
  getBrandContent: (brandId: string, userId: string) => Promise<GetBrandContentResult>;
  // Throws on adapter/transport failure (api key / non-2xx / no text); the core catches it.
  buildBrief: (brand: BrandBriefContext) => Promise<BuildBriefResult>;
  // §3.7 compliance scan over the built brief's free prose. Like buildBrief, the injected
  // generate throws on adapter failure; the core catches it and soft-fails to scan: null.
  scanBrief: (brand: BrandBriefContext, brief: ContentBrief) => Promise<ScanComplianceResult>;
  // §3.7 audit persistence. Best-effort side-effect: the core awaits it but swallows failures
  // so an audit-write hiccup never discards a brief the user already paid for. Receives the
  // VALIDATED, in-plan ids (never the raw body); userId is captured by the shell's closure.
  persistBrief: (args: {
    runId: string;
    creatorOpenId: string;
    brief: ContentBrief;
    scan: ComplianceScan | null;
  }) => Promise<void>;
};

export type BriefResponseBody =
  | { ok: true; brief: ContentBrief; scan: ComplianceScan | null }
  | { ok: false; error: string };

export type BriefRouteResult = {
  status: number;
  body: BriefResponseBody;
};

export async function handleBriefRequest(
  headers: SameOriginHeaders,
  rawBody: unknown,
  deps: BriefRouteDeps,
): Promise<BriefRouteResult> {
  // 1. Same-origin guard (CSRF) — before any work or paid call.
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
  const creatorOpenId = raw["creatorOpenId"];
  if (typeof creatorOpenId !== "string" || creatorOpenId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_creator_open_id" } };
  }
  const trimmedRunId = runId.trim();
  const trimmedCreatorOpenId = creatorOpenId.trim();

  // 3. Ownership gate: re-read the run double-scoped (id + user_id). userId from deps.
  const runResult = await deps.getRun(trimmedRunId, deps.userId);
  if (!runResult.ok) {
    return runResult.reason === "not_found"
      ? { status: 404, body: { ok: false, error: "run_not_found" } }
      : { status: 500, body: { ok: false, error: "lookup_failed" } };
  }
  const run = runResult.run;

  // 4. Integrity gate: the creator must actually be in this run's plan.
  const inPlan = run.plan.invites.some((i) => i.creatorOpenId === trimmedCreatorOpenId);
  if (!inPlan) {
    return { status: 404, body: { ok: false, error: "creator_not_in_run" } };
  }

  // 5. Cost guard: a paid LLM call only fires for an APPROVED creator. No decision or a
  //    "rejected" decision => not_approved, before any spend.
  const decisionsResult = await deps.getDecisions(trimmedRunId, deps.userId);
  if (!decisionsResult.ok) {
    return { status: 500, body: { ok: false, error: "lookup_failed" } };
  }
  const approved = decisionsResult.decisions.some(
    (d) => d.creatorOpenId === trimmedCreatorOpenId && d.decision === "approved",
  );
  if (!approved) {
    return { status: 409, body: { ok: false, error: "not_approved" } };
  }

  // 6. Resolve the brand's content/claim context (double-scoped by user_id inside).
  const brandResult = await deps.getBrandContent(run.brandId, deps.userId);
  if (!brandResult.ok) {
    if (brandResult.reason === "not_found") {
      return { status: 404, body: { ok: false, error: "brand_not_found" } };
    }
    if (brandResult.reason === "malformed") {
      return { status: 500, body: { ok: false, error: "brand_malformed" } };
    }
    return { status: 500, body: { ok: false, error: "lookup_failed" } }; // query_failed
  }
  const brand = brandResult.content;

  // 7. Generate the brief. buildBrief THROWS on adapter/transport failure — catch it and
  //    return a generic upstream error (never leak the thrown message / status).
  let briefResult: BuildBriefResult;
  try {
    briefResult = await deps.buildBrief(brand);
  } catch {
    return { status: 502, body: { ok: false, error: "brief_generation_failed" } };
  }

  if (briefResult.ok) {
    // 8. §3.7 compliance scan over the brief's free prose — a SECOND paid call on the same
    //    already-guarded approved path. It is an OVERLAY on an already-valid brief: if the
    //    reviewer call throws (adapter) or returns malformed, we return the brief with
    //    scan: null (compliance check unavailable) rather than discarding a brief we already
    //    paid for. The surface (UI) flags scan: null explicitly so it is never silent.
    let scan: ComplianceScan | null = null;
    try {
      const scanResult = await deps.scanBrief(brand, briefResult.brief);
      if (scanResult.ok) scan = scanResult.scan;
      // scanResult not ok (parse/malformed) => leave scan null (unavailable).
    } catch {
      // adapter/transport failure => scan unavailable; brief still returned.
    }

    // 9. Persist to the append-only §3.7 audit trail. Best-effort: the core awaits the write
    //    but swallows any failure so an audit-write hiccup never discards a brief the user
    //    already paid for. Uses the validated, in-plan ids (never the raw body).
    try {
      await deps.persistBrief({
        runId: trimmedRunId,
        creatorOpenId: trimmedCreatorOpenId,
        brief: briefResult.brief,
        scan,
      });
    } catch {
      // audit write failed; do not block the response.
    }

    return { status: 200, body: { ok: true, brief: briefResult.brief, scan } };
  }
  switch (briefResult.reason) {
    case "no_claims":
      return { status: 422, body: { ok: false, error: "no_claims" } };
    case "llm_parse_failed":
    case "llm_malformed":
      return { status: 502, body: { ok: false, error: "brief_generation_failed" } };
  }
}
