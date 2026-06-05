// src/lib/discovery-runs-list.check.ts
// SERVER-ONLY live positive control for listDiscoveryRuns (discovery-runs.ts).
// Run from macOS Terminal:
//   npx tsx --conditions=react-server --env-file=.env.local \
//     src/lib/discovery-runs-list.check.ts <userAId> <brandAId> <userBId> <brandBId>
// Seeds realistic runs for two real test accounts, verifies the list returns each
// account's own runs newest-first and NEVER the other account's, checks summary field
// mapping, then deletes everything it inserted. Real IDs are passed as args, never committed.

import { getSupabaseServerClient } from "./supabase-server";
import {
  storeDiscoveryRun,
  listDiscoveryRuns,
} from "./discovery-runs";
import type { DiscoveryRunInsert } from "./discovery-run-row";
import type { OutreachPlan } from "./outreach-plan";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

function makePlan(n: number): OutreachPlan {
  const invites = Array.from({ length: n }, (_, i) => ({
    creatorOpenId: `ttopen_seed_${i}_${Math.random().toString(36).slice(2, 8)}`,
    composite: 80 - i * 5,
    commissionRate: 15,
    effectiveGmv: 10000 - i * 1500,
  }));
  return { invites, eligibleCount: n, selectedCount: n, cappedOutCount: 0 };
}

async function main() {
  const [userA, brandA, userB, brandB] = process.argv.slice(2);
  if (!userA || !brandA || !userB || !brandB) {
    console.error(
      "Usage: tsx discovery-runs-list.check.ts <userAId> <brandAId> <userBId> <brandBId>",
    );
    process.exit(1);
  }

  const supabase = getSupabaseServerClient();
  const insertedIds: string[] = [];
  const aIds: string[] = [];
  let bId = "";

  const seeds: Array<{ owner: "A" | "B"; insert: DiscoveryRunInsert }> = [
    { owner: "A", insert: { user_id: userA, brand_id: brandA, overrides: null, max_pages: 3, plan: makePlan(3), pages_fetched: 2, stopped_early: false, stop_reason: null, creator_count: 3 } },
    { owner: "A", insert: { user_id: userA, brand_id: brandA, overrides: null, max_pages: 5, plan: makePlan(1), pages_fetched: 3, stopped_early: true, stop_reason: { code: 45101004, message: "search quota reached" }, creator_count: 1 } },
    { owner: "A", insert: { user_id: userA, brand_id: brandA, overrides: null, max_pages: 1, plan: makePlan(5), pages_fetched: 1, stopped_early: false, stop_reason: null, creator_count: 5 } },
    { owner: "B", insert: { user_id: userB, brand_id: brandB, overrides: null, max_pages: 2, plan: makePlan(2), pages_fetched: 1, stopped_early: false, stop_reason: null, creator_count: 2 } },
  ];

  try {
    for (const s of seeds) {
      const res = await storeDiscoveryRun(s.insert);
      if (!res.ok) throw new Error(`Seed insert failed for owner ${s.owner}: ${res.reason}`);
      insertedIds.push(res.id);
      if (s.owner === "A") aIds.push(res.id);
      else bId = res.id;
    }

    const listA = await listDiscoveryRuns(userA);
    check("listDiscoveryRuns(A) ok", listA.ok === true);
    if (listA.ok) {
      const ids = listA.runs.map((r) => r.id);
      check("A list contains all 3 seeded A runs", aIds.every((id) => ids.includes(id)));
      check("A list does NOT contain B's run", !ids.includes(bId));
      const times = listA.runs.map((r) => new Date(r.createdAt).getTime());
      check("A list ordered created_at desc", times.every((t, i) => i === 0 || times[i - 1] >= t));
      const pos = (id: string) => ids.indexOf(id);
      check("seeded A runs newest-first (A3 before A2 before A1)", pos(aIds[2]) < pos(aIds[1]) && pos(aIds[1]) < pos(aIds[0]));
      const a2 = listA.runs.find((r) => r.id === aIds[1]);
      check("A2 present for field-mapping check", !!a2);
      if (a2) {
        check("A2 brandId mapped", a2.brandId === brandA);
        check("A2 maxPages mapped (5)", a2.maxPages === 5);
        check("A2 pagesFetched mapped (3)", a2.pagesFetched === 3);
        check("A2 stoppedEarly mapped (true)", a2.stoppedEarly === true);
        check("A2 creatorCount mapped (1)", a2.creatorCount === 1);
        check("A2 stopReason mapped", a2.stopReason !== null && a2.stopReason.code === 45101004 && a2.stopReason.message === "search quota reached");
      }
    }

    const listB = await listDiscoveryRuns(userB);
    check("listDiscoveryRuns(B) ok", listB.ok === true);
    if (listB.ok) {
      const ids = listB.runs.map((r) => r.id);
      check("B list contains B's seeded run", ids.includes(bId));
      check("B list does NOT contain any A run", aIds.every((id) => !ids.includes(id)));
    }
  } finally {
    if (insertedIds.length > 0) {
      const { error } = await supabase.from("discovery_runs").delete().in("id", insertedIds);
      if (error) console.error("Cleanup delete error:", error.message);
      else console.log(`\n  cleanup: deleted ${insertedIds.length} seeded run(s)`);
    }
  }

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
