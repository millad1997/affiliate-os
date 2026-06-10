import { handleSendRequest, type SendRouteDeps, type SendCreatorResult } from "./send-route-core";
import type { GetDiscoveryRunResult } from "./discovery-runs";
import type { GetLatestBriefResult } from "./briefs";
import type { StoreSendResult } from "./sends";
import type { ContentBrief } from "./content-brief";

let failures = 0;
function ok(name: string, cond: boolean): void {
  if (cond) console.log(`pass ${name}`);
  else { failures++; console.error(`FAIL ${name}`); }
}

const GOOD_HEADERS = { origin: "https://app.example.com", host: "app.example.com", secFetchSite: "same-origin" };
const BAD_HEADERS = { origin: "https://evil.example.net", host: "app.example.com", secFetchSite: "cross-site" };
const USER = "user-a";
const RUN = "run-1";

const FAKE_BRIEF = { hook: "h", talkingPoints: [], approvedClaimsUsed: [], cta: "c", disclosure: "d" } as unknown as ContentBrief;

function fakeRun(creators: string[]): GetDiscoveryRunResult {
  return {
    ok: true,
    run: {
      plan: { invites: creators.map((c) => ({ creatorOpenId: c })) },
      brandId: "brand-1",
    },
  } as unknown as GetDiscoveryRunResult;
}

function storedBrief(verdict: "pass" | "flagged" | "unavailable"): GetLatestBriefResult {
  return {
    ok: true,
    brief: {
      id: "b1", userId: USER, runId: RUN, creatorOpenId: "x", brandId: "brand-1",
      brief: FAKE_BRIEF, scan: null, verdict, createdAt: "2026-01-01T00:00:00Z",
    },
  } as unknown as GetLatestBriefResult;
}

function makeDeps(overrides: Partial<SendRouteDeps>): SendRouteDeps {
  return {
    userId: USER,
    getRun: async () => fakeRun(["a", "b", "c"]),
    getDecisions: async () => ({
      ok: true,
      decisions: [
        { creatorOpenId: "a", decision: "approved" },
        { creatorOpenId: "b", decision: "approved" },
        { creatorOpenId: "c", decision: "rejected" },
      ],
    }) as never,
    getSentCreatorOpenIds: async () => ({ ok: true, creatorOpenIds: [] }),
    getLatestBrief: async () => storedBrief("pass"),
    composeMessage: () => "MESSAGE",
    sendOutreach: async (input) => ({ ok: true, providerRef: `ref:${input.creatorOpenId}` }),
    persistSend: async () => ({ ok: true, id: "row-1" }),
    ...overrides,
  };
}

function statusOf(results: SendCreatorResult[], id: string): string | undefined {
  return results.find((r) => r.creatorOpenId === id)?.status;
}

async function main(): Promise<void> {
  // 1. Cross-origin rejected before any work.
  const r1 = await handleSendRequest(BAD_HEADERS, { runId: RUN }, makeDeps({
    getRun: async () => { throw new Error("must not be called"); },
  }));
  ok("cross_origin_403", r1.status === 403 && r1.body.ok === false && r1.body.error === "forbidden");

  // 2. Invalid body / missing runId.
  const r2 = await handleSendRequest(GOOD_HEADERS, { runId: "  " }, makeDeps({}));
  ok("invalid_run_id_400", r2.status === 400 && r2.body.ok === false && r2.body.error === "invalid_run_id");

  // 3. Non-owned run.
  const r3 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    getRun: async () => ({ ok: false, reason: "not_found" }) as never,
  }));
  ok("run_not_found_404", r3.status === 404 && r3.body.ok === false && r3.body.error === "run_not_found");

  // 4. Decisions lookup failure.
  const r4 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    getDecisions: async () => ({ ok: false, reason: "query_failed" }) as never,
  }));
  ok("decisions_lookup_500", r4.status === 500 && r4.body.ok === false && r4.body.error === "lookup_failed");

  // 5. Sent-set lookup failure.
  const r5 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    getSentCreatorOpenIds: async () => ({ ok: false, reason: "query_failed" }) as never,
  }));
  ok("sent_set_lookup_500", r5.status === 500 && r5.body.ok === false && r5.body.error === "lookup_failed");

  // 6. Happy path: a,b approved+pass => sent; c rejected => absent entirely.
  const r6 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({}));
  ok("happy_two_sent", r6.status === 200 && r6.body.ok === true
    && statusOf(r6.body.results, "a") === "sent"
    && statusOf(r6.body.results, "b") === "sent"
    && statusOf(r6.body.results, "c") === undefined
    && r6.body.alreadySent.length === 0);

  // 7. Already-sent excluded from the loop, reported in alreadySent.
  const sends7: string[] = [];
  const r7 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    getSentCreatorOpenIds: async () => ({ ok: true, creatorOpenIds: ["a"] }),
    sendOutreach: async (input) => { sends7.push(input.creatorOpenId); return { ok: true, providerRef: null }; },
  }));
  ok("already_sent_skipped", r7.status === 200 && r7.body.ok === true
    && r7.body.alreadySent.length === 1 && r7.body.alreadySent[0] === "a"
    && statusOf(r7.body.results, "a") === undefined
    && sends7.length === 1 && sends7[0] === "b");

  // 8. Compliance gate: no brief / flagged / unavailable — adapter NEVER called.
  const sends8: string[] = [];
  const r8 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    getLatestBrief: async (_run, creatorOpenId) => {
      if (creatorOpenId === "a") return { ok: true, brief: null } as never;
      return storedBrief("flagged");
    },
    sendOutreach: async (input) => { sends8.push(input.creatorOpenId); return { ok: true, providerRef: null }; },
  }));
  ok("compliance_gate_skips", r8.status === 200 && r8.body.ok === true
    && statusOf(r8.body.results, "a") === "skipped_no_brief"
    && statusOf(r8.body.results, "b") === "skipped_not_compliant"
    && sends8.length === 0);

  const r8b = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    getLatestBrief: async () => storedBrief("unavailable"),
  }));
  ok("unavailable_not_compliant", r8b.status === 200 && r8b.body.ok === true
    && statusOf(r8b.body.results, "a") === "skipped_not_compliant"
    && statusOf(r8b.body.results, "b") === "skipped_not_compliant");

  // 9. Brief lookup failure for one creator does not abort the other.
  const r9 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    getLatestBrief: async (_run, creatorOpenId) => {
      if (creatorOpenId === "a") return { ok: false, reason: "query_failed" } as never;
      return storedBrief("pass");
    },
  }));
  ok("lookup_failed_isolated", r9.status === 200 && r9.body.ok === true
    && statusOf(r9.body.results, "a") === "lookup_failed"
    && statusOf(r9.body.results, "b") === "sent");

  // 10. Adapter failure => failed, persisted with errorCode; other creator unaffected.
  const persisted10: Array<{ creatorOpenId: string; status: string; errorCode?: string | null }> = [];
  const r10 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    sendOutreach: async (input) => input.creatorOpenId === "a"
      ? { ok: false, errorCode: "provider_rejected" }
      : { ok: true, providerRef: null },
    persistSend: async (args) => { persisted10.push(args); return { ok: true, id: "r" }; },
  }));
  ok("adapter_failure_recorded", r10.status === 200 && r10.body.ok === true
    && statusOf(r10.body.results, "a") === "failed"
    && statusOf(r10.body.results, "b") === "sent"
    && persisted10.some((p) => p.creatorOpenId === "a" && p.status === "failed" && p.errorCode === "provider_rejected")
    && persisted10.some((p) => p.creatorOpenId === "b" && p.status === "sent"));

  // 11. Adapter throw treated as failure outcome.
  const r11 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    sendOutreach: async (input) => {
      if (input.creatorOpenId === "a") throw new Error("boom");
      return { ok: true, providerRef: null };
    },
  }));
  ok("adapter_throw_failed", r11.status === 200 && r11.body.ok === true
    && statusOf(r11.body.results, "a") === "failed"
    && statusOf(r11.body.results, "b") === "sent");

  // 12. Sent but audit write failed => sent_unrecorded (never swallowed).
  const r12 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    persistSend: async (args) => args.creatorOpenId === "a"
      ? ({ ok: false, reason: "store_failed" } as StoreSendResult)
      : { ok: true, id: "r" },
  }));
  ok("sent_unrecorded_surfaced", r12.status === 200 && r12.body.ok === true
    && statusOf(r12.body.results, "a") === "sent_unrecorded"
    && statusOf(r12.body.results, "b") === "sent");

  // 13. Persist returns already_sent (lost race) => reported sent.
  const r13 = await handleSendRequest(GOOD_HEADERS, { runId: RUN }, makeDeps({
    persistSend: async () => ({ ok: false, reason: "already_sent" }) as StoreSendResult,
  }));
  ok("lost_race_maps_to_sent", r13.status === 200 && r13.body.ok === true
    && statusOf(r13.body.results, "a") === "sent"
    && statusOf(r13.body.results, "b") === "sent");
}

main().finally(() => {
  if (failures > 0) { console.error(`\n${failures} VECTOR(S) FAILED`); process.exit(1); }
  console.log("\nALL_VECTORS_PASS");
});
