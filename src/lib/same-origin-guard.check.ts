// src/lib/same-origin-guard.check.ts
//
// Golden-vector check for isSameOrigin. Pure module → run with plain:
//   npx tsx src/lib/same-origin-guard.check.ts
// Each expected boolean is hand-computed against the guard's branches.

import { isSameOrigin, type SameOriginHeaders } from "./same-origin-guard";

type Case = { name: string; headers: SameOriginHeaders; expected: boolean };

const cases: Case[] = [
  { name: "sec-fetch-site same-origin → allow",
    headers: { origin: null, host: null, secFetchSite: "same-origin" }, expected: true },
  { name: "sec-fetch-site none (direct nav / non-browser) → allow",
    headers: { origin: null, host: null, secFetchSite: "none" }, expected: true },
  { name: "sec-fetch-site cross-site → deny",
    headers: { origin: null, host: null, secFetchSite: "cross-site" }, expected: false },
  { name: "sec-fetch-site same-site → deny",
    headers: { origin: null, host: null, secFetchSite: "same-site" }, expected: false },
  { name: "origin host matches host, no sec-fetch-site → allow",
    headers: { origin: "https://app.example.com", host: "app.example.com", secFetchSite: null }, expected: true },
  { name: "origin host mismatches host → deny",
    headers: { origin: "https://evil.example.com", host: "app.example.com", secFetchSite: null }, expected: false },
  { name: "origin present but host null → deny",
    headers: { origin: "https://app.example.com", host: null, secFetchSite: null }, expected: false },
  { name: "malformed origin (unparseable URL) → deny",
    headers: { origin: "not-a-url", host: "app.example.com", secFetchSite: null }, expected: false },
  { name: "all headers null (SameSite cookie still gates) → allow",
    headers: { origin: null, host: null, secFetchSite: null }, expected: true },
  { name: "sec-fetch-site same-origin + matching origin/host → allow",
    headers: { origin: "https://app.example.com", host: "app.example.com", secFetchSite: "same-origin" }, expected: true },
  { name: "sec-fetch-site same-origin but origin mismatches host → deny",
    headers: { origin: "https://evil.example.com", host: "app.example.com", secFetchSite: "same-origin" }, expected: false },
];

let passed = 0;
let failed = 0;
for (const c of cases) {
  const actual = isSameOrigin(c.headers);
  if (actual === c.expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${c.name} — expected ${c.expected}, got ${actual}`);
  }
}

console.log(`same-origin-guard: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
