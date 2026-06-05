// src/lib/brand-content-read.check.ts
// Pure golden-vector check for brand-content-read. Uses the injected FetchBrandContentRow
// seam — no real DB access. Server-only module, so run with the flag:
//   npx tsx --conditions=react-server --env-file=.env.local src/lib/brand-content-read.check.ts
import {
  getBrandContent,
  parseApprovedClaims,
  type BrandContentRow,
  type FetchBrandContentRow,
} from "./brand-content-read";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// --- parseApprovedClaims (pure) ---
check("claims: null => []", parseApprovedClaims(null), []);
check("claims: blank => []", parseApprovedClaims("   "), []);
check("claims: single", parseApprovedClaims("Clinically studied ingredients"), [
  "Clinically studied ingredients",
]);
check(
  "claims: multi-line trims + drops blanks",
  parseApprovedClaims("  Supports healthy testosterone  \n\nMade in a GMP facility\n"),
  ["Supports healthy testosterone", "Made in a GMP facility"],
);
check(
  "claims: CRLF + CR handled",
  parseApprovedClaims("Claim A\r\nClaim B\rClaim C"),
  ["Claim A", "Claim B", "Claim C"],
);

// --- getBrandContent control flow (DI seam) ---
const fakeRow: BrandContentRow = {
  name: "Vireo Health Co",
  category: "Men's Health & Wellness",
  description: "Daily men's multivitamin and testosterone support.",
  approved_claims: "Supports healthy testosterone\nClinically studied ingredients",
};
const okFetch: FetchBrandContentRow = async () => ({ ok: true, row: fakeRow });
const nullFetch: FetchBrandContentRow = async () => ({ ok: true, row: null });
const errFetch: FetchBrandContentRow = async () => ({ ok: false });

(async () => {
  check("getBrandContent: happy path", await getBrandContent("b", "u", okFetch), {
    ok: true,
    content: {
      name: "Vireo Health Co",
      category: "Men's Health & Wellness",
      description: "Daily men's multivitamin and testosterone support.",
      approvedClaims: [
        "Supports healthy testosterone",
        "Clinically studied ingredients",
      ],
    },
  });
  check("getBrandContent: not_found", await getBrandContent("b", "u", nullFetch), {
    ok: false,
    reason: "not_found",
  });
  check("getBrandContent: query_failed", await getBrandContent("b", "u", errFetch), {
    ok: false,
    reason: "query_failed",
  });
  const malformedFetch: FetchBrandContentRow = async () => ({
    ok: true,
    row: { ...fakeRow, name: "   " } as BrandContentRow,
  });
  check("getBrandContent: malformed (blank name)", await getBrandContent("b", "u", malformedFetch), {
    ok: false,
    reason: "malformed",
  });
  const sparseFetch: FetchBrandContentRow = async () => ({
    ok: true,
    row: { name: "Northwood Naturals", category: "Supplements", description: null, approved_claims: null },
  });
  check("getBrandContent: null description + null claims", await getBrandContent("b", "u", sparseFetch), {
    ok: true,
    content: {
      name: "Northwood Naturals",
      category: "Supplements",
      description: null,
      approvedClaims: [],
    },
  });

  if (failures > 0) {
    console.error(`\n${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("\nALL_CHECKS_PASSED");
})();
