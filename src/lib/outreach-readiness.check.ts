// src/lib/outreach-readiness.check.ts
// Standalone assertion script for assessOutreachReadiness.
// Pure: no react-server, no env, no DB.
// Run: npx tsx src/lib/outreach-readiness.check.ts

import { assessOutreachReadiness, type BrandOutreachConfig } from "./outreach-readiness";

let passed = 0;
let failures = 0;

function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); passed++; }
  else { console.error(`FAIL  ${name}`); failures++; throw new Error(`Assertion failed: ${name}`); }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const fullConfig: BrandOutreachConfig = {
  tiktokProductIds: ["1729000000000000777"],
  sellerContactEmail: "partners@brand.com",
  hasFreeSample: false,
  isSampleApprovalExempt: false,
  collaborationDurationDays: 30,
  commissionRatePercent: 10,
};

// (a) both required fields present → ready.
const r1 = assessOutreachReadiness(fullConfig);
check("1: both present -> ready true", r1.ready === true);

// (b) empty product IDs only.
const r2 = assessOutreachReadiness({ ...fullConfig, tiktokProductIds: [] });
check("2: empty product IDs -> not ready", r2.ready === false);
check("2: missing exactly tiktok_product_ids",
  r2.ready === false && deepEqual(r2.missing, ["tiktok_product_ids"]));

// (c) null email only.
const r3 = assessOutreachReadiness({ ...fullConfig, sellerContactEmail: null });
check("3: null email -> not ready", r3.ready === false);
check("3: missing exactly seller_contact_email",
  r3.ready === false && deepEqual(r3.missing, ["seller_contact_email"]));

// (d) both absent, in order.
const r4 = assessOutreachReadiness({ ...fullConfig, tiktokProductIds: [], sellerContactEmail: null });
check("4: both absent -> not ready", r4.ready === false);
check("4: missing both in order",
  r4.ready === false && deepEqual(r4.missing, ["tiktok_product_ids", "seller_contact_email"]));

// (e) readiness ignores defaulted fields when required fields present.
const r5 = assessOutreachReadiness({
  tiktokProductIds: ["1729000000000000777"],
  sellerContactEmail: "partners@brand.com",
  hasFreeSample: false,
  isSampleApprovalExempt: false,
  collaborationDurationDays: 30,
  commissionRatePercent: 10,
});
check("5: defaulted fields ignored -> ready true", r5.ready === true);

console.log(`\n(${passed} passed, ${failures} failed)`);
if (failures > 0) process.exit(1);
