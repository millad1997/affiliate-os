// Pure golden-vector check for invite-decision-route-core.ts. No server-only import;
// run with plain:  npx tsx src/lib/invite-decision-route-core.check.ts
// (If this ever demands --conditions=react-server, a server-only value-import leaked in.)

import {
  handleApproveAllPendingRequest,
  handleClearInviteDecisionRequest,
  handleInviteDecisionRequest,
  handleRejectAllPendingRequest,
  type InviteDecisionRequestHeaders,
  type RejectAllPendingResult,
} from "./invite-decision-route-core";
import type {
  ApproveAllPendingResult,
  DeleteInviteDecisionResult,
  StoreInviteDecisionResult,
} from "./invite-decisions";

let passed = 0;
let failed = 0;
function expect(label: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}`);
  }
}

type StoreArgs = {
  runId: string;
  userId: string;
  creatorOpenId: string;
  decision: string;
};
function makeFakeStore(result: StoreInviteDecisionResult) {
  const calls: StoreArgs[] = [];
  const store = async (args: StoreArgs): Promise<StoreInviteDecisionResult> => {
    calls.push(args);
    return result;
  };
  return { store, calls };
}

const OK_HEADERS: InviteDecisionRequestHeaders = {
  origin: "https://app.example.com",
  host: "app.example.com",
  secFetchSite: "same-origin",
};
const OK_BODY = { runId: "run_1", creatorOpenId: "creator_1", decision: "approved" };
const CLEAR_BODY = { runId: "run_1", creatorOpenId: "creator_1" };

type ClearArgs = { runId: string; userId: string; creatorOpenId: string };
function makeFakeClear(result: DeleteInviteDecisionResult) {
  const calls: ClearArgs[] = [];
  const clear = async (args: ClearArgs): Promise<DeleteInviteDecisionResult> => {
    calls.push(args);
    return result;
  };
  return { clear, calls };
}

const APPROVE_ALL_BODY = { runId: "run_1" };

type ApproveAllArgs = { runId: string; userId: string };
function makeFakeApproveAll(result: ApproveAllPendingResult) {
  const calls: ApproveAllArgs[] = [];
  const approveAll = async (args: ApproveAllArgs): Promise<ApproveAllPendingResult> => {
    calls.push(args);
    return result;
  };
  return { approveAll, calls };
}

const REJECT_ALL_BODY = { runId: "run_1" };

type RejectAllArgs = { runId: string; userId: string };
function makeFakeRejectAll(result: RejectAllPendingResult) {
  const calls: RejectAllArgs[] = [];
  const rejectAll = async (args: RejectAllArgs): Promise<RejectAllPendingResult> => {
    calls.push(args);
    return result;
  };
  return { rejectAll, calls };
}

async function main(): Promise<void> {
  // --- CSRF guard ---
  {
    const f = makeFakeStore({ ok: true, id: "id_1" });
    const r = await handleInviteDecisionRequest(
      { origin: "https://evil.com", host: "app.example.com", secFetchSite: "cross-site" },
      OK_BODY,
      { userId: "u", store: f.store },
    );
    expect(
      "1 cross-site -> 403 forbidden",
      r.status === 403 && r.body.ok === false && r.body.error === "forbidden",
    );
    expect("1 cross-site -> store NOT called", f.calls.length === 0);
  }
  {
    const f = makeFakeStore({ ok: true, id: "id_1" });
    const r = await handleInviteDecisionRequest(
      { origin: "https://sub.app.example.com", host: "app.example.com", secFetchSite: "same-site" },
      OK_BODY,
      { userId: "u", store: f.store },
    );
    expect("2 same-site -> 403", r.status === 403 && f.calls.length === 0);
  }
  {
    const f = makeFakeStore({ ok: true, id: "id_1" });
    const r = await handleInviteDecisionRequest(
      { origin: "https://evil.com", host: "app.example.com", secFetchSite: null },
      OK_BODY,
      { userId: "u", store: f.store },
    );
    expect("3 origin host mismatch (no sfs) -> 403", r.status === 403 && f.calls.length === 0);
  }
  {
    const f = makeFakeStore({ ok: true, id: "id_ok" });
    const r = await handleInviteDecisionRequest(OK_HEADERS, OK_BODY, { userId: "u", store: f.store });
    expect("4 same-origin -> 200 ok", r.status === 200 && r.body.ok === true && r.body.id === "id_ok");
    expect("4 same-origin -> store called once", f.calls.length === 1);
  }
  {
    const f = makeFakeStore({ ok: true, id: "id_ok" });
    const r = await handleInviteDecisionRequest(
      { origin: null, host: null, secFetchSite: null },
      OK_BODY,
      { userId: "u", store: f.store },
    );
    expect("5 no headers -> 200 (defense-in-depth allow)", r.status === 200 && f.calls.length === 1);
  }
  {
    const f = makeFakeStore({ ok: true, id: "id_ok" });
    const r = await handleInviteDecisionRequest(
      { origin: "https://app.example.com", host: "app.example.com", secFetchSite: null },
      OK_BODY,
      { userId: "u", store: f.store },
    );
    expect("6 origin matches host (no sfs) -> 200", r.status === 200 && f.calls.length === 1);
  }
  {
    const f = makeFakeStore({ ok: true, id: "id_ok" });
    const r = await handleInviteDecisionRequest(
      { origin: null, host: "app.example.com", secFetchSite: "none" },
      OK_BODY,
      { userId: "u", store: f.store },
    );
    expect("7 sec-fetch-site none -> 200", r.status === 200 && f.calls.length === 1);
  }

  // --- Body validation (same-origin, so past the guard) ---
  {
    const f = makeFakeStore({ ok: true, id: "x" });
    const r = await handleInviteDecisionRequest(OK_HEADERS, null, { userId: "u", store: f.store });
    expect(
      "8 null body -> 400 invalid_request",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_request" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeStore({ ok: true, id: "x" });
    const r = await handleInviteDecisionRequest(
      OK_HEADERS,
      { creatorOpenId: "c", decision: "approved" },
      { userId: "u", store: f.store },
    );
    expect(
      "9 missing runId -> 400 invalid_run_id",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_run_id" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeStore({ ok: true, id: "x" });
    const r = await handleInviteDecisionRequest(
      OK_HEADERS,
      { runId: "   ", creatorOpenId: "c", decision: "approved" },
      { userId: "u", store: f.store },
    );
    expect("10 whitespace runId -> 400 invalid_run_id", r.status === 400 && f.calls.length === 0);
  }
  {
    const f = makeFakeStore({ ok: true, id: "x" });
    const r = await handleInviteDecisionRequest(
      OK_HEADERS,
      { runId: "r", decision: "approved" },
      { userId: "u", store: f.store },
    );
    expect(
      "11 missing creatorOpenId -> 400 invalid_creator_open_id",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_creator_open_id" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeStore({ ok: true, id: "x" });
    const r = await handleInviteDecisionRequest(
      OK_HEADERS,
      { runId: "r", creatorOpenId: "c", decision: 123 },
      { userId: "u", store: f.store },
    );
    expect(
      "12 non-string decision -> 400 invalid_decision",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_decision" && f.calls.length === 0,
    );
  }

  // --- Store-result mapping ---
  {
    const f = makeFakeStore({ ok: true, id: "id_map" });
    const r = await handleInviteDecisionRequest(OK_HEADERS, OK_BODY, { userId: "u", store: f.store });
    expect("13 store ok -> 200 id", r.status === 200 && r.body.ok === true && r.body.id === "id_map");
  }
  {
    const f = makeFakeStore({ ok: false, reason: "invalid_decision" });
    const r = await handleInviteDecisionRequest(OK_HEADERS, OK_BODY, { userId: "u", store: f.store });
    expect("14 store invalid_decision -> 400", r.status === 400 && r.body.ok === false && r.body.error === "invalid_decision");
  }
  {
    const f = makeFakeStore({ ok: false, reason: "creator_not_in_run" });
    const r = await handleInviteDecisionRequest(OK_HEADERS, OK_BODY, { userId: "u", store: f.store });
    expect("15 store creator_not_in_run -> 404", r.status === 404 && r.body.ok === false && r.body.error === "creator_not_in_run");
  }
  {
    const f = makeFakeStore({ ok: false, reason: "run_not_found" });
    const r = await handleInviteDecisionRequest(OK_HEADERS, OK_BODY, { userId: "u", store: f.store });
    expect("16 store run_not_found -> 404", r.status === 404 && r.body.ok === false && r.body.error === "run_not_found");
  }
  {
    const f = makeFakeStore({ ok: false, reason: "store_failed" });
    const r = await handleInviteDecisionRequest(OK_HEADERS, OK_BODY, { userId: "u", store: f.store });
    expect("17 store store_failed -> 500", r.status === 500 && r.body.ok === false && r.body.error === "store_failed");
  }

  // --- Security provenance: userId from deps only; runId/creatorOpenId trimmed ---
  {
    const f = makeFakeStore({ ok: true, id: "id_sec" });
    const r = await handleInviteDecisionRequest(
      OK_HEADERS,
      { runId: " run_1 ", creatorOpenId: " creator_1 ", decision: "approved", userId: "attacker" },
      { userId: "session_user", store: f.store },
    );
    expect("18 ok despite rogue body userId", r.status === 200);
    expect("18 store got session userId, not body's", f.calls.length === 1 && f.calls[0].userId === "session_user");
    expect("18 store got trimmed runId", f.calls.length === 1 && f.calls[0].runId === "run_1");
    expect("18 store got trimmed creatorOpenId", f.calls.length === 1 && f.calls[0].creatorOpenId === "creator_1");
  }

  // ============ handleClearInviteDecisionRequest (DELETE / clear) ============

  // --- CSRF guard ---
  {
    const f = makeFakeClear({ ok: true });
    const r = await handleClearInviteDecisionRequest(
      { origin: "https://evil.com", host: "app.example.com", secFetchSite: "cross-site" },
      CLEAR_BODY,
      { userId: "u", clear: f.clear },
    );
    expect(
      "19 clear cross-site -> 403 forbidden",
      r.status === 403 && r.body.ok === false && r.body.error === "forbidden",
    );
    expect("19 clear cross-site -> clear NOT called", f.calls.length === 0);
  }

  // --- Body validation ---
  {
    const f = makeFakeClear({ ok: true });
    const r = await handleClearInviteDecisionRequest(OK_HEADERS, null, { userId: "u", clear: f.clear });
    expect(
      "20 clear null body -> 400 invalid_request",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_request" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeClear({ ok: true });
    const r = await handleClearInviteDecisionRequest(
      OK_HEADERS,
      { creatorOpenId: "c" },
      { userId: "u", clear: f.clear },
    );
    expect(
      "21 clear missing runId -> 400 invalid_run_id",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_run_id" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeClear({ ok: true });
    const r = await handleClearInviteDecisionRequest(
      OK_HEADERS,
      { runId: "   ", creatorOpenId: "c" },
      { userId: "u", clear: f.clear },
    );
    expect("22 clear whitespace runId -> 400", r.status === 400 && f.calls.length === 0);
  }
  {
    const f = makeFakeClear({ ok: true });
    const r = await handleClearInviteDecisionRequest(
      OK_HEADERS,
      { runId: "r" },
      { userId: "u", clear: f.clear },
    );
    expect(
      "23 clear missing creatorOpenId -> 400 invalid_creator_open_id",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_creator_open_id" && f.calls.length === 0,
    );
  }

  // --- Clear-result mapping ---
  {
    const f = makeFakeClear({ ok: true });
    const r = await handleClearInviteDecisionRequest(OK_HEADERS, CLEAR_BODY, { userId: "u", clear: f.clear });
    expect("24 clear ok -> 200 ok:true", r.status === 200 && r.body.ok === true);
    expect("24 clear ok -> clear called once", f.calls.length === 1);
  }
  {
    const f = makeFakeClear({ ok: false, reason: "run_not_found" });
    const r = await handleClearInviteDecisionRequest(OK_HEADERS, CLEAR_BODY, { userId: "u", clear: f.clear });
    expect("25 clear run_not_found -> 404", r.status === 404 && r.body.ok === false && r.body.error === "run_not_found");
  }
  {
    const f = makeFakeClear({ ok: false, reason: "delete_failed" });
    const r = await handleClearInviteDecisionRequest(OK_HEADERS, CLEAR_BODY, { userId: "u", clear: f.clear });
    expect("26 clear delete_failed -> 500", r.status === 500 && r.body.ok === false && r.body.error === "delete_failed");
  }

  // --- Security provenance: userId from deps only; runId/creatorOpenId trimmed ---
  {
    const f = makeFakeClear({ ok: true });
    const r = await handleClearInviteDecisionRequest(
      OK_HEADERS,
      { runId: " run_1 ", creatorOpenId: " creator_1 ", userId: "attacker" },
      { userId: "session_user", clear: f.clear },
    );
    expect("27 clear ok despite rogue body userId", r.status === 200);
    expect("27 clear got session userId, not body's", f.calls.length === 1 && f.calls[0].userId === "session_user");
    expect("27 clear got trimmed runId", f.calls.length === 1 && f.calls[0].runId === "run_1");
    expect("27 clear got trimmed creatorOpenId", f.calls.length === 1 && f.calls[0].creatorOpenId === "creator_1");
  }

  // ============ handleApproveAllPendingRequest (bulk approve) ============

  // --- CSRF guard ---
  {
    const f = makeFakeApproveAll({ ok: true, approved: 0 });
    const r = await handleApproveAllPendingRequest(
      { origin: "https://evil.com", host: "app.example.com", secFetchSite: "cross-site" },
      APPROVE_ALL_BODY,
      { userId: "u", approveAll: f.approveAll },
    );
    expect(
      "28 approve-all cross-site -> 403 forbidden",
      r.status === 403 && r.body.ok === false && r.body.error === "forbidden",
    );
    expect("28 approve-all cross-site -> approveAll NOT called", f.calls.length === 0);
  }

  // --- Body validation ---
  {
    const f = makeFakeApproveAll({ ok: true, approved: 0 });
    const r = await handleApproveAllPendingRequest(OK_HEADERS, null, { userId: "u", approveAll: f.approveAll });
    expect(
      "29 approve-all null body -> 400 invalid_request",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_request" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeApproveAll({ ok: true, approved: 0 });
    const r = await handleApproveAllPendingRequest(OK_HEADERS, {}, { userId: "u", approveAll: f.approveAll });
    expect(
      "30 approve-all missing runId -> 400 invalid_run_id",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_run_id" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeApproveAll({ ok: true, approved: 0 });
    const r = await handleApproveAllPendingRequest(
      OK_HEADERS,
      { runId: "   " },
      { userId: "u", approveAll: f.approveAll },
    );
    expect("31 approve-all whitespace runId -> 400", r.status === 400 && f.calls.length === 0);
  }

  // --- Result mapping ---
  {
    const f = makeFakeApproveAll({ ok: true, approved: 3 });
    const r = await handleApproveAllPendingRequest(OK_HEADERS, APPROVE_ALL_BODY, { userId: "u", approveAll: f.approveAll });
    expect(
      "32 approve-all ok -> 200 with approved count",
      r.status === 200 && r.body.ok === true && r.body.approved === 3,
    );
    expect("32 approve-all ok -> approveAll called once", f.calls.length === 1);
  }
  {
    const f = makeFakeApproveAll({ ok: false, reason: "run_not_found" });
    const r = await handleApproveAllPendingRequest(OK_HEADERS, APPROVE_ALL_BODY, { userId: "u", approveAll: f.approveAll });
    expect("33 approve-all run_not_found -> 404", r.status === 404 && r.body.ok === false && r.body.error === "run_not_found");
  }
  {
    const f = makeFakeApproveAll({ ok: false, reason: "store_failed" });
    const r = await handleApproveAllPendingRequest(OK_HEADERS, APPROVE_ALL_BODY, { userId: "u", approveAll: f.approveAll });
    expect("34 approve-all store_failed -> 500", r.status === 500 && r.body.ok === false && r.body.error === "store_failed");
  }

  // --- Security provenance: userId from deps only; runId trimmed ---
  {
    const f = makeFakeApproveAll({ ok: true, approved: 1 });
    const r = await handleApproveAllPendingRequest(
      OK_HEADERS,
      { runId: " run_1 ", userId: "attacker" },
      { userId: "session_user", approveAll: f.approveAll },
    );
    expect("35 approve-all ok despite rogue body userId", r.status === 200);
    expect("35 approve-all got session userId, not body's", f.calls.length === 1 && f.calls[0].userId === "session_user");
    expect("35 approve-all got trimmed runId", f.calls.length === 1 && f.calls[0].runId === "run_1");
  }

  // ============ handleRejectAllPendingRequest (bulk reject) ============

  // --- CSRF guard ---
  {
    const f = makeFakeRejectAll({ ok: true, rejected: 0 });
    const r = await handleRejectAllPendingRequest(
      { origin: "https://evil.com", host: "app.example.com", secFetchSite: "cross-site" },
      REJECT_ALL_BODY,
      { userId: "u", rejectAll: f.rejectAll },
    );
    expect(
      "36 reject-all cross-site -> 403 forbidden",
      r.status === 403 && r.body.ok === false && r.body.error === "forbidden",
    );
    expect("36 reject-all cross-site -> rejectAll NOT called", f.calls.length === 0);
  }

  // --- Body validation ---
  {
    const f = makeFakeRejectAll({ ok: true, rejected: 0 });
    const r = await handleRejectAllPendingRequest(OK_HEADERS, null, { userId: "u", rejectAll: f.rejectAll });
    expect(
      "37 reject-all null body -> 400 invalid_request",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_request" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeRejectAll({ ok: true, rejected: 0 });
    const r = await handleRejectAllPendingRequest(OK_HEADERS, {}, { userId: "u", rejectAll: f.rejectAll });
    expect(
      "38 reject-all missing runId -> 400 invalid_run_id",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_run_id" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeRejectAll({ ok: true, rejected: 0 });
    const r = await handleRejectAllPendingRequest(
      OK_HEADERS,
      { runId: "   " },
      { userId: "u", rejectAll: f.rejectAll },
    );
    expect("39 reject-all whitespace runId -> 400", r.status === 400 && f.calls.length === 0);
  }

  // --- Result mapping ---
  {
    const f = makeFakeRejectAll({ ok: true, rejected: 3 });
    const r = await handleRejectAllPendingRequest(OK_HEADERS, REJECT_ALL_BODY, { userId: "u", rejectAll: f.rejectAll });
    expect(
      "40 reject-all ok -> 200 with rejected count",
      r.status === 200 && r.body.ok === true && r.body.rejected === 3,
    );
    expect("40 reject-all ok -> rejectAll called once", f.calls.length === 1);
  }
  {
    const f = makeFakeRejectAll({ ok: false, reason: "run_not_found" });
    const r = await handleRejectAllPendingRequest(OK_HEADERS, REJECT_ALL_BODY, { userId: "u", rejectAll: f.rejectAll });
    expect("41 reject-all run_not_found -> 404", r.status === 404 && r.body.ok === false && r.body.error === "run_not_found");
  }
  {
    const f = makeFakeRejectAll({ ok: false, reason: "store_failed" });
    const r = await handleRejectAllPendingRequest(OK_HEADERS, REJECT_ALL_BODY, { userId: "u", rejectAll: f.rejectAll });
    expect("42 reject-all store_failed -> 500", r.status === 500 && r.body.ok === false && r.body.error === "store_failed");
  }

  // --- Security provenance: userId from deps only; runId trimmed ---
  {
    const f = makeFakeRejectAll({ ok: true, rejected: 1 });
    const r = await handleRejectAllPendingRequest(
      OK_HEADERS,
      { runId: " run_1 ", userId: "attacker" },
      { userId: "session_user", rejectAll: f.rejectAll },
    );
    expect("43 reject-all ok despite rogue body userId", r.status === 200);
    expect("43 reject-all got session userId, not body's", f.calls.length === 1 && f.calls[0].userId === "session_user");
    expect("43 reject-all got trimmed runId", f.calls.length === 1 && f.calls[0].runId === "run_1");
  }

  console.log(`\nPASSED ${passed}/${passed + failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("CHECK CRASHED", e);
  process.exit(1);
});
