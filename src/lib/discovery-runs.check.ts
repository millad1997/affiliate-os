// src/lib/discovery-runs.check.ts
// Live positive control for discovery-runs: store a synthetic run, read it back as the
// owner, confirm a non-owner is denied, then delete the synthetic row.
// Run (server-only module → react-server condition + env file required):
//   npx tsx --conditions=react-server --env-file=.env.local \
//     src/lib/discovery-runs.check.ts <ownerUserId> <ownerBrandId> <nonOwnerUserId>
// IDs are passed as args so no real account identifiers are committed.

import { storeDiscoveryRun, getDiscoveryRun } from "./discovery-runs";
import { getSupabaseServerClient } from "./supabase-server";
import type { DiscoveryRunInsert } from "./discovery-run-row";

async function main(): Promise<void> {
  const [ownerId, brandId, nonOwnerId] = process.argv.slice(2);
  if (!ownerId || !brandId || !nonOwnerId) {
    console.error("Usage: <ownerUserId> <ownerBrandId> <nonOwnerUserId>");
    process.exit(2);
  }

  let failures = 0;
  function assert(label: string, cond: boolean): void {
    console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
    if (!cond) failures++;
  }

  const insert: DiscoveryRunInsert = {
    user_id: ownerId,
    brand_id: brandId,
    overrides: { keyword: "isolation-check-synthetic" },
    max_pages: 3,
    plan: {
      invites: [
        { creatorOpenId: "synthetic_creator", composite: 50, commissionRate: 0.15, effectiveGmv: 1000 },
      ],
      eligibleCount: 1,
      selectedCount: 1,
      cappedOutCount: 0,
    },
    pages_fetched: 1,
    stopped_early: false,
    stop_reason: null,
    creator_count: 1,
  };

  const stored = await storeDiscoveryRun(insert);
  assert("store → ok with id", stored.ok === true);
  if (!stored.ok) {
    console.log(`\n${failures} check(s) FAILED.`);
    process.exit(1);
  }

  const runId = stored.id;
  try {
    const r1 = await getDiscoveryRun(runId, ownerId);
    assert("owner reads run → ok", r1.ok === true);
    assert("round-trip creator_count 1", r1.ok && r1.run.creatorCount === 1);
    assert("round-trip brand_id matches", r1.ok && r1.run.brandId === brandId);
    assert("round-trip plan.selectedCount 1", r1.ok && r1.run.plan.selectedCount === 1);
    assert("round-trip overrides keyword", r1.ok && r1.run.overrides?.keyword === "isolation-check-synthetic");

    const r2 = await getDiscoveryRun(runId, nonOwnerId);
    assert("non-owner denied run → not_found", r2.ok === false && r2.reason === "not_found");
  } finally {
    const supabase = getSupabaseServerClient();
    await supabase.from("discovery_runs").delete().eq("id", runId);
    console.log("cleanup: deleted synthetic run", runId);
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
