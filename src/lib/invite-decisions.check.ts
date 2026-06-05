import "server-only";

// Live positive-control + bidirectional isolation check for invite-decisions.ts.
// Run from macOS Terminal (NOT scrollback):
//   npx tsx --conditions=react-server --env-file=.env.local \
//     src/lib/invite-decisions.check.ts <userA_uuid> <userB_uuid>
// userA must own at least one seeded discovery_run whose plan has >= 1 invite.
// Self-cleaning: deletes the decision row it creates before exiting.

import { getSupabaseServerClient } from "./supabase-server";
import { getDiscoveryRun, listDiscoveryRuns } from "./discovery-runs";
import { storeInviteDecision, listInviteDecisions } from "./invite-decisions";

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

async function main(): Promise<void> {
  const userA = process.argv[2];
  const userB = process.argv[3];
  if (!userA || !userB) {
    console.error("Usage: invite-decisions.check.ts <userA_uuid> <userB_uuid>");
    process.exit(2);
  }

  // Derive a real run owned by A that has at least one invite.
  const listed = await listDiscoveryRuns(userA);
  if (!listed.ok) {
    console.error("Could not list A's runs:", listed.reason);
    process.exit(2);
  }
  let runId = "";
  let creatorC0 = "";
  for (const summary of listed.runs) {
    const full = await getDiscoveryRun(summary.id, userA);
    if (full.ok && full.run.plan.invites.length >= 1) {
      runId = summary.id;
      creatorC0 = full.run.plan.invites[0].creatorOpenId;
      break;
    }
  }
  if (!runId || !creatorC0) {
    console.error("No seeded run with >=1 invite found for userA. Seed one first.");
    process.exit(2);
  }
  console.log(`Using runId=${runId} creatorC0=${creatorC0}`);

  const supabase = getSupabaseServerClient();
  // Start clean: remove any pre-existing decision for this (run, creator).
  await supabase
    .from("invite_decisions")
    .delete()
    .eq("run_id", runId)
    .eq("creator_open_id", creatorC0);

  // 1. Happy path: A approves C0.
  const r1 = await storeInviteDecision({
    runId,
    userId: userA,
    creatorOpenId: creatorC0,
    decision: "approved",
  });
  expect("1 store approved -> ok:true", r1.ok === true);

  // 2. Read back: A sees exactly one approved decision for C0.
  const r2 = await listInviteDecisions(runId, userA);
  expect("2 list ok:true", r2.ok === true);
  expect(
    "2 list has approved decision for C0",
    r2.ok === true &&
      r2.decisions.some(
        (d) =>
          d.creatorOpenId === creatorC0 &&
          d.decision === "approved" &&
          d.userId === userA &&
          d.runId === runId,
      ),
  );

  // 3. Flip: A changes C0 to rejected (upsert overwrites, single row).
  const r3 = await storeInviteDecision({
    runId,
    userId: userA,
    creatorOpenId: creatorC0,
    decision: "rejected",
  });
  expect("3 store rejected (flip) -> ok:true", r3.ok === true);
  const r3b = await listInviteDecisions(runId, userA);
  const c0Rows =
    r3b.ok === true
      ? r3b.decisions.filter((d) => d.creatorOpenId === creatorC0)
      : [];
  expect("3 flip kept a single row for C0", c0Rows.length === 1);
  expect(
    "3 flip row now reads rejected",
    c0Rows.length === 1 && c0Rows[0].decision === "rejected",
  );

  // 4. Validation: bad decision value rejected, nothing written.
  const r4 = await storeInviteDecision({
    runId,
    userId: userA,
    creatorOpenId: creatorC0,
    decision: "maybe",
  });
  expect(
    "4 invalid decision -> reason invalid_decision",
    r4.ok === false && r4.reason === "invalid_decision",
  );

  // 5. Integrity: creator not in this run's plan rejected.
  const r5 = await storeInviteDecision({
    runId,
    userId: userA,
    creatorOpenId: "creator_not_in_any_plan_zzz",
    decision: "approved",
  });
  expect(
    "5 creator not in run -> reason creator_not_in_run",
    r5.ok === false && r5.reason === "creator_not_in_run",
  );

  // 6. WRITE isolation: B cannot decide on A's run.
  const r6 = await storeInviteDecision({
    runId,
    userId: userB,
    creatorOpenId: creatorC0,
    decision: "approved",
  });
  expect(
    "6 B writing A's run -> run_not_found (write isolation)",
    r6.ok === false && r6.reason === "run_not_found",
  );

  // 7. READ isolation: B sees no decisions on A's run.
  const r7 = await listInviteDecisions(runId, userB);
  expect(
    "7 B listing A's run -> ok:true, empty (read isolation)",
    r7.ok === true && r7.decisions.length === 0,
  );

  // 8. A's single (rejected) decision is intact after B's attempts.
  const r8 = await listInviteDecisions(runId, userA);
  const c0After =
    r8.ok === true
      ? r8.decisions.filter((d) => d.creatorOpenId === creatorC0)
      : [];
  expect(
    "8 A's decision intact (single, rejected)",
    c0After.length === 1 && c0After[0].decision === "rejected",
  );

  // Cleanup (self-cleaning).
  await supabase
    .from("invite_decisions")
    .delete()
    .eq("run_id", runId)
    .eq("creator_open_id", creatorC0);
  const r9 = await listInviteDecisions(runId, userA);
  expect(
    "9 cleanup -> no C0 decision remains",
    r9.ok === true && r9.decisions.every((d) => d.creatorOpenId !== creatorC0),
  );

  console.log(`\nPASSED ${passed}/${passed + failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("CHECK CRASHED", e);
  process.exit(1);
});
