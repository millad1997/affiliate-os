// src/lib/discovery-runs.seed.ts
// SERVER-ONLY dev utility: inserts a few realistic discovery_runs for one account so the
// /runs UI has data to display. Unlike the .check.ts control, this does NOT clean up — the
// rows persist as demo data. Run from macOS Terminal:
//   npx tsx --conditions=react-server --env-file=.env.local \
//     src/lib/discovery-runs.seed.ts <userId> <brandId>
// userId/brandId are passed as args and never committed.

import { storeDiscoveryRun } from "./discovery-runs";
import type { DiscoveryRunInsert } from "./discovery-run-row";
import type { OutreachPlan } from "./outreach-plan";

function makePlan(invites: Array<{ id: string; composite: number; gmv: number | null }>): OutreachPlan {
  return {
    invites: invites.map((i) => ({
      creatorOpenId: i.id,
      composite: i.composite,
      commissionRate: 15,
      effectiveGmv: i.gmv,
    })),
    eligibleCount: invites.length,
    selectedCount: invites.length,
    cappedOutCount: 0,
  };
}

async function main() {
  const [userId, brandId] = process.argv.slice(2);
  if (!userId || !brandId) {
    console.error("Usage: tsx discovery-runs.seed.ts <userId> <brandId>");
    process.exit(1);
  }

  const seeds: DiscoveryRunInsert[] = [
    {
      user_id: userId, brand_id: brandId, overrides: null, max_pages: 3,
      plan: makePlan([
        { id: "ttopen_mens_wellness_marcus", composite: 81, gmv: 12400 },
        { id: "ttopen_peptide_priya", composite: 73, gmv: 8800 },
        { id: "ttopen_recovery_ramon", composite: 66, gmv: 5100 },
        { id: "ttopen_clean_living_dana", composite: 58, gmv: 2600 },
      ]),
      pages_fetched: 3, stopped_early: false, stop_reason: null, creator_count: 4,
    },
    {
      user_id: userId, brand_id: brandId, overrides: null, max_pages: 5,
      plan: makePlan([
        { id: "ttopen_sleep_stack_sara", composite: 77, gmv: 9900 },
        { id: "ttopen_gut_health_gabe", composite: 62, gmv: 4300 },
      ]),
      pages_fetched: 4, stopped_early: true,
      stop_reason: { code: 45101004, message: "search quota reached" }, creator_count: 2,
    },
    {
      user_id: userId, brand_id: brandId, overrides: null, max_pages: 2,
      plan: makePlan([
        { id: "ttopen_testosterone_tyler", composite: 69, gmv: 7200 },
        { id: "ttopen_focus_fiona", composite: 64, gmv: 3800 },
        { id: "ttopen_hydration_hank", composite: 55, gmv: 1500 },
      ]),
      pages_fetched: 2, stopped_early: false, stop_reason: null, creator_count: 3,
    },
  ];

  let inserted = 0;
  for (const insert of seeds) {
    const res = await storeDiscoveryRun(insert);
    if (!res.ok) {
      console.error("Seed insert failed:", res.reason);
      process.exit(1);
    }
    inserted++;
    console.log(`  seeded run ${inserted}: ${res.id} (${insert.creator_count} picks)`);
  }
  console.log(`\nDone. Seeded ${inserted} run(s) for user ${userId}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
