// src/lib/brand-content-read.isolation.check.ts
// Cross-tenant isolation positive control for getBrandContent.
// Run (server-only module, so the react-server condition is required):
//   npx tsx --conditions=react-server --env-file=.env.local \
//     src/lib/brand-content-read.isolation.check.ts <brandB> <ownerB> <brandA> <ownerA>
// Proves, on REAL rows owned by two distinct tenants, that each owner can read
// their own brand's content AND neither can read the other's. IDs are passed as args
// so no real account identifiers are committed to the repo.
import { getBrandContent } from "./brand-content-read";
async function main(): Promise<void> {
  const [brandB, ownerB, brandA, ownerA] = process.argv.slice(2);
  if (!brandB || !ownerB || !brandA || !ownerA) {
    console.error("Usage: <brandB> <ownerB> <brandA> <ownerA>");
    process.exit(2);
  }
  let failures = 0;
  function assert(label: string, cond: boolean): void {
    console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
    if (!cond) failures++;
  }
  const r1 = await getBrandContent(brandB, ownerB);
  assert("owner B reads B's content → ok", r1.ok === true);
  const r2 = await getBrandContent(brandB, ownerA);
  assert("non-owner A denied B's content → not_found", r2.ok === false && r2.reason === "not_found");
  const r3 = await getBrandContent(brandA, ownerA);
  assert("owner A reads A's content → ok", r3.ok === true);
  const r4 = await getBrandContent(brandA, ownerB);
  assert("non-owner B denied A's content → not_found", r4.ok === false && r4.reason === "not_found");
  console.log(`\n${failures === 0 ? "All isolation checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
