// src/lib/brief-route-core.check.ts
//
// Golden-vector check for handleBriefRequest. Pure module → run with plain:
//   npx tsx src/lib/brief-route-core.check.ts
// Fixtures are spies that record calls so we can assert the cost guard never lets a paid
// buildBrief fire for a non-member / non-approved creator, and that userId always comes
// from deps (session), never the request body.
import { handleBriefRequest, type BriefRouteDeps } from "./brief-route-core";
import type { SameOriginHeaders } from "./same-origin-guard";
import type { GetDiscoveryRunResult, DiscoveryRun } from "./discovery-runs";
import type {
  ListInviteDecisionsResult,
  InviteDecision,
  InviteDecisionValue,
} from "./invite-decisions";
import type { GetBrandContentResult } from "./brand-content-read";
import type { BuildBriefResult } from "./content-brief";

const SESSION_USER = "session-user-1";
const BRAND_ID = "brand-vireo";
const CREATOR_A = "ttopen_mens_wellness_marcus";
const ISO = "2026-01-01T00:00:00.000Z";

const ALLOW: SameOriginHeaders = { origin: null, host: null, secFetchSite: null };
const CROSS: SameOriginHeaders = { origin: null, host: null, secFetchSite: "cross-site" };

function runOk(brandId: string, creatorOpenIds: string[]): GetDiscoveryRunResult {
  const invites = creatorOpenIds.map((creatorOpenId) => ({
    creatorOpenId,
    composite: 70,
    commissionRate: 10,
    effectiveGmv: 1000,
  }));
  const run = {
    id: "run-1",
    userId: SESSION_USER,
    brandId,
    createdAt: ISO,
    overrides: null,
    maxPages: 1,
    plan: {
      selectedCount: invites.length,
      eligibleCount: invites.length,
      cappedOutCount: 0,
      invites,
    },
    pagesFetched: 1,
    stoppedEarly: false,
    stopReason: null,
    creatorCount: invites.length,
  } as unknown as DiscoveryRun;
  return { ok: true, run };
}

function decision(creatorOpenId: string, value: InviteDecisionValue): InviteDecision {
  return {
    id: "d-" + creatorOpenId,
    userId: SESSION_USER,
    runId: "run-1",
    creatorOpenId,
    decision: value,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

const BRAND_OK: GetBrandContentResult = {
  ok: true,
  content: {
    name: "Vireo Health Co",
    category: "supplements",
    description: "Magnesium glycinate sleep support",
    approvedClaims: ["Supports restful sleep"],
  },
};

const BRIEF_OK: BuildBriefResult = {
  ok: true,
  brief: {
    hook: "Sleep better tonight",
    talkingPoints: ["Take 30 min before bed"],
    approvedClaimsUsed: ["Supports restful sleep"],
    disclosure: "Paid partnership with Vireo Health Co. #ad",
    callToAction: "Tap the orange cart",
    notes: null,
  },
};

type Calls = {
  getRun: Array<[string, string]>;
  getDecisions: Array<[string, string]>;
  getBrandContent: Array<[string, string]>;
  buildBrief: string[]; // brand.name per call
};

function freshCalls(): Calls {
  return { getRun: [], getDecisions: [], getBrandContent: [], buildBrief: [] };
}

function makeDeps(
  calls: Calls,
  opts: {
    userId?: string;
    run?: GetDiscoveryRunResult;
    decisions?: ListInviteDecisionsResult;
    brand?: GetBrandContentResult;
    brief?: BuildBriefResult | "throw";
  } = {},
): BriefRouteDeps {
  return {
    userId: opts.userId ?? SESSION_USER,
    getRun: async (runId, userId) => {
      calls.getRun.push([runId, userId]);
      return opts.run ?? runOk(BRAND_ID, [CREATOR_A]);
    },
    getDecisions: async (runId, userId) => {
      calls.getDecisions.push([runId, userId]);
      return opts.decisions ?? { ok: true, decisions: [decision(CREATOR_A, "approved")] };
    },
    getBrandContent: async (brandId, userId) => {
      calls.getBrandContent.push([brandId, userId]);
      return opts.brand ?? BRAND_OK;
    },
    buildBrief: async (brand) => {
      calls.buildBrief.push(brand.name);
      if (opts.brief === "throw") throw new Error("anthropic_http_500");
      return opts.brief ?? BRIEF_OK;
    },
  };
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}`);
  }
}

function bodyErr(body: { ok: boolean } & Record<string, unknown>): string {
  return body.ok ? "(ok)" : String((body as { error: string }).error);
}

async function main() {
  // 1. cross-site → 403, and nothing downstream runs.
  {
    const calls = freshCalls();
    const r = await handleBriefRequest(CROSS, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(calls));
    check("1 cross-site -> 403 forbidden", r.status === 403 && bodyErr(r.body) === "forbidden");
    check("1 cross-site -> getRun NOT called", calls.getRun.length === 0);
  }

  // 2-3. bad body shapes.
  {
    const r = await handleBriefRequest(ALLOW, null, makeDeps(freshCalls()));
    check("2 null body -> 400 invalid_request", r.status === 400 && bodyErr(r.body) === "invalid_request");
  }
  {
    const r = await handleBriefRequest(ALLOW, "nope", makeDeps(freshCalls()));
    check("3 string body -> 400 invalid_request", r.status === 400 && bodyErr(r.body) === "invalid_request");
  }

  // 4-7. id validation.
  {
    const r = await handleBriefRequest(ALLOW, { creatorOpenId: CREATOR_A }, makeDeps(freshCalls()));
    check("4 missing runId -> 400 invalid_run_id", r.status === 400 && bodyErr(r.body) === "invalid_run_id");
  }
  {
    const r = await handleBriefRequest(ALLOW, { runId: "   ", creatorOpenId: CREATOR_A }, makeDeps(freshCalls()));
    check("5 whitespace runId -> 400 invalid_run_id", r.status === 400 && bodyErr(r.body) === "invalid_run_id");
  }
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1" }, makeDeps(freshCalls()));
    check("6 missing creatorOpenId -> 400 invalid_creator_open_id", r.status === 400 && bodyErr(r.body) === "invalid_creator_open_id");
  }
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: "  " }, makeDeps(freshCalls()));
    check("7 whitespace creatorOpenId -> 400 invalid_creator_open_id", r.status === 400 && bodyErr(r.body) === "invalid_creator_open_id");
  }

  // 8-9. run lookup.
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(freshCalls(), { run: { ok: false, reason: "not_found" } }));
    check("8 run not_found -> 404 run_not_found", r.status === 404 && bodyErr(r.body) === "run_not_found");
  }
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(freshCalls(), { run: { ok: false, reason: "query_failed" } }));
    check("9 run query_failed -> 500 lookup_failed", r.status === 500 && bodyErr(r.body) === "lookup_failed");
  }

  // 10. creator not in plan -> 404, and neither decisions nor buildBrief run.
  {
    const calls = freshCalls();
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: "someone-else" }, makeDeps(calls));
    check("10 creator not in plan -> 404 creator_not_in_run", r.status === 404 && bodyErr(r.body) === "creator_not_in_run");
    check("10 creator not in plan -> getDecisions NOT called", calls.getDecisions.length === 0);
    check("10 creator not in plan -> buildBrief NOT called", calls.buildBrief.length === 0);
  }

  // 11-12. cost guard: no decision / rejected -> 409, no paid call.
  {
    const calls = freshCalls();
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(calls, { decisions: { ok: true, decisions: [] } }));
    check("11 no decision -> 409 not_approved", r.status === 409 && bodyErr(r.body) === "not_approved");
    check("11 no decision -> buildBrief NOT called", calls.buildBrief.length === 0);
  }
  {
    const calls = freshCalls();
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(calls, { decisions: { ok: true, decisions: [decision(CREATOR_A, "rejected")] } }));
    check("12 rejected -> 409 not_approved", r.status === 409 && bodyErr(r.body) === "not_approved");
    check("12 rejected -> buildBrief NOT called", calls.buildBrief.length === 0);
  }

  // 13. decisions query_failed -> 500.
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(freshCalls(), { decisions: { ok: false, reason: "query_failed" } }));
    check("13 decisions query_failed -> 500 lookup_failed", r.status === 500 && bodyErr(r.body) === "lookup_failed");
  }

  // 14-16. brand content failures.
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(freshCalls(), { brand: { ok: false, reason: "not_found" } }));
    check("14 brand not_found -> 404 brand_not_found", r.status === 404 && bodyErr(r.body) === "brand_not_found");
  }
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(freshCalls(), { brand: { ok: false, reason: "malformed" } }));
    check("15 brand malformed -> 500 brand_malformed", r.status === 500 && bodyErr(r.body) === "brand_malformed");
  }
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(freshCalls(), { brand: { ok: false, reason: "query_failed" } }));
    check("16 brand query_failed -> 500 lookup_failed", r.status === 500 && bodyErr(r.body) === "lookup_failed");
  }

  // 17-20. brief outcomes.
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(freshCalls(), { brief: { ok: false, reason: "no_claims" } }));
    check("17 no_claims -> 422 no_claims", r.status === 422 && bodyErr(r.body) === "no_claims");
  }
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(freshCalls(), { brief: { ok: false, reason: "llm_parse_failed" } }));
    check("18 llm_parse_failed -> 502 brief_generation_failed", r.status === 502 && bodyErr(r.body) === "brief_generation_failed");
  }
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(freshCalls(), { brief: { ok: false, reason: "llm_malformed" } }));
    check("19 llm_malformed -> 502 brief_generation_failed", r.status === 502 && bodyErr(r.body) === "brief_generation_failed");
  }
  {
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(freshCalls(), { brief: "throw" }));
    check("20 buildBrief throws -> 502 brief_generation_failed", r.status === 502 && bodyErr(r.body) === "brief_generation_failed");
  }

  // 21. happy path.
  {
    const calls = freshCalls();
    const r = await handleBriefRequest(ALLOW, { runId: "run-1", creatorOpenId: CREATOR_A }, makeDeps(calls));
    check("21 happy -> 200 ok", r.status === 200 && r.body.ok === true);
    check("21 happy -> brief hook present", r.body.ok === true && r.body.brief.hook === "Sleep better tonight");
    check("21 happy -> getBrandContent called with run.brandId", calls.getBrandContent.length === 1 && calls.getBrandContent[0][0] === BRAND_ID);
    check("21 happy -> buildBrief got brand content", calls.buildBrief.length === 1 && calls.buildBrief[0] === "Vireo Health Co");
  }

  // 22. userId always from session (deps), never the body.
  {
    const calls = freshCalls();
    const r = await handleBriefRequest(
      ALLOW,
      { runId: "run-1", creatorOpenId: CREATOR_A, userId: "attacker-id" },
      makeDeps(calls),
    );
    check("22 rogue body userId -> 200 ok", r.status === 200);
    check("22 getRun got session userId", calls.getRun[0][1] === SESSION_USER);
    check("22 getDecisions got session userId", calls.getDecisions[0][1] === SESSION_USER);
    check("22 getBrandContent got session userId", calls.getBrandContent[0][1] === SESSION_USER);
  }

  // 23. trimming: surrounding whitespace on ids still resolves to the in-plan creator.
  {
    const calls = freshCalls();
    const r = await handleBriefRequest(ALLOW, { runId: "  run-1  ", creatorOpenId: `  ${CREATOR_A}  ` }, makeDeps(calls));
    check("23 trimmed ids -> 200 ok", r.status === 200);
    check("23 getRun got trimmed runId", calls.getRun[0][0] === "run-1");
  }

  console.log(`\nPASSED ${passed}/${passed + failed}`);
  if (failed > 0) process.exit(1);
}

void main();
