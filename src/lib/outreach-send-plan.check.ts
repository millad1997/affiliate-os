import { buildSendPlan, type SendPlan } from "./outreach-send-plan";

let failures = 0;

function eq(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((v, i) => v === expected[i]);
}

function check(name: string, got: SendPlan, want: SendPlan): void {
  const ok = eq(got.toSend, want.toSend) && eq(got.alreadySent, want.alreadySent);
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}`);
    console.error(`  toSend      got=${JSON.stringify(got.toSend)} want=${JSON.stringify(want.toSend)}`);
    console.error(`  alreadySent got=${JSON.stringify(got.alreadySent)} want=${JSON.stringify(want.alreadySent)}`);
  } else {
    console.log(`pass ${name}`);
  }
}

// 1. Basic: 3 in plan, 2 approved + 1 rejected, nothing sent.
check("basic_approved_minus_rejected", buildSendPlan({
  planCreatorOpenIds: ["a", "b", "c"],
  decisions: [
    { creatorOpenId: "a", decision: "approved" },
    { creatorOpenId: "b", decision: "rejected" },
    { creatorOpenId: "c", decision: "approved" },
  ],
  sentCreatorOpenIds: [],
}), { toSend: ["a", "c"], alreadySent: [] });

// 2. Idempotency: 2 approved, 1 already sent.
check("idempotency_excludes_sent", buildSendPlan({
  planCreatorOpenIds: ["a", "b", "c"],
  decisions: [
    { creatorOpenId: "a", decision: "approved" },
    { creatorOpenId: "c", decision: "approved" },
  ],
  sentCreatorOpenIds: ["a"],
}), { toSend: ["c"], alreadySent: ["a"] });

// 3. Pending (absent from decisions) is never sent.
check("pending_never_sent", buildSendPlan({
  planCreatorOpenIds: ["a", "b", "c"],
  decisions: [{ creatorOpenId: "a", decision: "approved" }],
  sentCreatorOpenIds: [],
}), { toSend: ["a"], alreadySent: [] });

// 4. All approved already sent -> nothing to send.
check("all_already_sent", buildSendPlan({
  planCreatorOpenIds: ["a", "b"],
  decisions: [
    { creatorOpenId: "a", decision: "approved" },
    { creatorOpenId: "b", decision: "approved" },
  ],
  sentCreatorOpenIds: ["a", "b"],
}), { toSend: [], alreadySent: ["a", "b"] });

// 5. Empty plan.
check("empty_plan", buildSendPlan({
  planCreatorOpenIds: [], decisions: [], sentCreatorOpenIds: [],
}), { toSend: [], alreadySent: [] });

// 6. Output follows PLAN order, not decision order.
check("output_follows_plan_order", buildSendPlan({
  planCreatorOpenIds: ["c", "a", "b"],
  decisions: [
    { creatorOpenId: "a", decision: "approved" },
    { creatorOpenId: "b", decision: "approved" },
    { creatorOpenId: "c", decision: "approved" },
  ],
  sentCreatorOpenIds: [],
}), { toSend: ["c", "a", "b"], alreadySent: [] });

// 7. Defensive: a sent id that was REJECTED (not approved) is ignored, never in alreadySent.
check("sent_but_not_approved_ignored", buildSendPlan({
  planCreatorOpenIds: ["a", "b"],
  decisions: [
    { creatorOpenId: "a", decision: "approved" },
    { creatorOpenId: "b", decision: "rejected" },
  ],
  sentCreatorOpenIds: ["b"],
}), { toSend: ["a"], alreadySent: [] });

// 8. Defensive: a sent id NOT in the plan is ignored entirely.
check("sent_not_in_plan_ignored", buildSendPlan({
  planCreatorOpenIds: ["a"],
  decisions: [{ creatorOpenId: "a", decision: "approved" }],
  sentCreatorOpenIds: ["z"],
}), { toSend: ["a"], alreadySent: [] });

if (failures > 0) {
  console.error(`\n${failures} VECTOR(S) FAILED`);
  process.exit(1);
}
console.log("\nALL_VECTORS_PASS");
