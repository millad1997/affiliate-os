// src/lib/brand-outreach-config-read.check.ts
// Standalone assertion script for getBrandOutreachConfig's row coercion + result mapping.
// Every scenario injects a stub FetchBrandOutreachRow, so the real Supabase read is NEVER run.
// This module imports server-only, so it must run under the react-server condition:
//   npx tsx --conditions=react-server --env-file=.env.local src/lib/brand-outreach-config-read.check.ts

import { getBrandOutreachConfig, type BrandOutreachRow, type FetchBrandOutreachRow } from "./brand-outreach-config-read";
import { assessOutreachReadiness } from "./outreach-readiness";

let passed = 0;
let failures = 0;

function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); passed++; }
  else { console.error(`FAIL  ${name}`); failures++; throw new Error(`Assertion failed: ${name}`); }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const baseRow: BrandOutreachRow = {
  tiktok_product_ids: ["1729000000000000777"],
  seller_contact_email: "partners@brand.com",
  has_free_sample: true,
  is_sample_approval_exempt: false,
  collaboration_duration_days: 45,
  commission_rate: "10",
};

function stubRow(row: BrandOutreachRow): FetchBrandOutreachRow {
  return async () => ({ ok: true, row });
}

async function runChecks(): Promise<void> {
  // (a) fetcher { ok: false } → query_failed.
  const r1 = await getBrandOutreachConfig("brand-1", "user-1", async () => ({ ok: false }));
  check("1: ok === false", r1.ok === false);
  check("1: reason === query_failed", r1.ok === false && r1.reason === "query_failed");

  // (b) row null → not_found.
  const r2 = await getBrandOutreachConfig("brand-1", "user-1", async () => ({ ok: true, row: null }));
  check("2: ok === false", r2.ok === false);
  check("2: reason === not_found", r2.ok === false && r2.reason === "not_found");

  // (c) full row with commission_rate as STRING "15.5" → ok, all fields mapped camelCase.
  const r3 = await getBrandOutreachConfig("brand-1", "user-1", stubRow({
    ...baseRow,
    commission_rate: "15.5",
  }));
  check("3: ok === true", r3.ok === true);
  if (r3.ok) {
    check("3: commissionRatePercent === 15.5",
      r3.config.commissionRatePercent === 15.5 && typeof r3.config.commissionRatePercent === "number");
    check("3: tiktokProductIds mapped",
      deepEqual(r3.config.tiktokProductIds, ["1729000000000000777"]));
    check("3: sellerContactEmail mapped", r3.config.sellerContactEmail === "partners@brand.com");
    check("3: hasFreeSample mapped", r3.config.hasFreeSample === true);
    check("3: isSampleApprovalExempt mapped", r3.config.isSampleApprovalExempt === false);
    check("3: collaborationDurationDays mapped", r3.config.collaborationDurationDays === 45);
  }

  // (d) commission_rate: "abc" → malformed.
  const r4 = await getBrandOutreachConfig("brand-1", "user-1", stubRow({
    ...baseRow,
    commission_rate: "abc",
  }));
  check("4: ok === false", r4.ok === false);
  check("4: reason === malformed", r4.ok === false && r4.reason === "malformed");

  // (e) incomplete row → ok from read; readiness flags both missing.
  const r5 = await getBrandOutreachConfig("brand-1", "user-1", stubRow({
    ...baseRow,
    tiktok_product_ids: [],
    seller_contact_email: null,
  }));
  check("5: read ok despite incomplete config", r5.ok === true);
  if (r5.ok) {
    const readiness = assessOutreachReadiness(r5.config);
    check("5: readiness not ready", readiness.ready === false);
    check("5: readiness missing both fields",
      readiness.ready === false && deepEqual(readiness.missing, ["tiktok_product_ids", "seller_contact_email"]));
  }
}

runChecks()
  .then(() => {
    console.log(`\n(${passed} passed, ${failures} failed)`);
    if (failures > 0) process.exit(1);
  })
  .catch((err) => {
    console.error(`\n(${passed} passed, ${failures} failed)`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
