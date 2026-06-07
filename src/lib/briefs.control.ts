// src/lib/briefs.control.ts
//
// LIVE bidirectional tenant-isolation control for the `briefs` audit table. NOT a pure
// golden-vector check — it executes real service-role reads/writes against Supabase, so it runs
// ONLY from the server-only condition with env loaded:
//   npx tsx --conditions=react-server --env-file=.env.local \
//     src/lib/briefs.control.ts <A_USER_ID> <B_USER_ID> <RUN_ID_A> <CREATOR_OPEN_ID>
//
// Real tenant UUIDs are passed as ARGS (never committed). RUN_ID_A must be a run OWNED by
// A_USER_ID, and CREATOR_OPEN_ID must be a creator present in that run's plan. The control writes
// ONE synthetic audit row for tenant A (briefs is append-only; the row is harmless, presentable
// test data and is left in place).
//
// Proves: (1) A can store + read its own brief; (2) B CANNOT read A's brief (read isolation);
// (3) B CANNOT store against A's run (write isolation -> run_not_found); (4) the run-scoped list
// is tenant-isolated both ways.
import { storeBrief, getLatestBrief, listBriefsForRun } from "./briefs";
import type { ContentBrief } from "./content-brief";
import type { ComplianceScan } from "./compliance-scan";

const [, , A_USER, B_USER, RUN_ID, CREATOR] = process.argv;
if (!A_USER || !B_USER || !RUN_ID || !CREATOR) {
  console.error(
    "usage: tsx --conditions=react-server --env-file=.env.local src/lib/briefs.control.ts <A_USER_ID> <B_USER_ID> <RUN_ID_A> <CREATOR_OPEN_ID>",
  );
  process.exit(2);
}

const BRIEF: ContentBrief = {
  hook: "Isolation control synthetic hook",
  talkingPoints: ["control point"],
  approvedClaimsUsed: ["Supports everyday energy."],
  disclosure: "Paid partnership with Vireo Health Co. #ad",
  callToAction: "Tap the orange cart",
  notes: null,
};

const SCAN: ComplianceScan = {
  verdict: "flagged",
  findings: [
    {
      field: "hook",
      index: null,
      quote: "Isolation control synthetic hook",
      category: "off_brand",
      severity: "low",
      rationale: "synthetic control finding",
    },
  ],
};

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

async function main() {
  // 1. A stores its own brief -> ok.
  const stored = await storeBrief({ runId: RUN_ID, userId: A_USER, creatorOpenId: CREATOR, brief: BRIEF, scan: SCAN });
  check("1 A storeBrief -> ok", stored.ok === true);
  const storedId = stored.ok ? stored.id : "";

  // 2. A reads back the latest brief -> present, id matches, verdict flagged, brandId from run.
  const latestA = await getLatestBrief(RUN_ID, CREATOR, A_USER);
  check("2 A getLatestBrief -> ok", latestA.ok === true);
  check("2 A latest present + id matches", latestA.ok === true && latestA.brief !== null && latestA.brief.id === storedId);
  check("2 A latest verdict flagged", latestA.ok === true && latestA.brief !== null && latestA.brief.verdict === "flagged");
  check("2 A latest brandId from run", latestA.ok === true && latestA.brief !== null && latestA.brief.brandId.length > 0);

  // 3. B reads the same (run, creator) -> NULL. Read isolation: B cannot see A's audit row.
  const latestB = await getLatestBrief(RUN_ID, CREATOR, B_USER);
  check("3 B getLatestBrief -> ok", latestB.ok === true);
  check("3 B sees NOTHING (read isolation)", latestB.ok === true && latestB.brief === null);

  // 4. B tries to store against A's run -> run_not_found. Write isolation: nothing written.
  const storeB = await storeBrief({ runId: RUN_ID, userId: B_USER, creatorOpenId: CREATOR, brief: BRIEF, scan: SCAN });
  check("4 B storeBrief on A's run -> run_not_found (write isolation)", storeB.ok === false && storeB.reason === "run_not_found");

  // 5. Run-scoped list is tenant-isolated both ways.
  const listA = await listBriefsForRun(RUN_ID, A_USER);
  check("5 A listBriefsForRun -> ok + includes stored id", listA.ok === true && listA.briefs.some((b) => b.id === storedId));
  const listB = await listBriefsForRun(RUN_ID, B_USER);
  check("5 B listBriefsForRun -> empty (isolation)", listB.ok === true && listB.briefs.length === 0);

  console.log(`\nPASSED ${passed}/${passed + failed}`);
  if (failed > 0) process.exit(1);
}

void main();
