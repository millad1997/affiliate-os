import { buildAuthorizeUrl, generateState } from "./tiktok-authorize";

let pass = 0, fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else       { fail++; console.log(`  FAIL  ${name}`); }
}

const SVC = "7644135269490296589";
const US_URL = `https://services.us.tiktokshop.com/open/authorize?service_id=${SVC}&state=teststate123`;

// ── U1: explicit US region ────────────────────────────────────────────────────
{
  const url = buildAuthorizeUrl({ serviceId: SVC, state: "teststate123", region: "US" });
  check("U1 explicit region=US produces correct URL", url === US_URL);
}

// ── U2: region omitted defaults to US ────────────────────────────────────────
{
  const url = buildAuthorizeUrl({ serviceId: SVC, state: "teststate123" });
  check("U2 region omitted -> US URL", url === US_URL);
}

// ── U3: lowercase region "us" matches US host ─────────────────────────────────
{
  const url = buildAuthorizeUrl({ serviceId: SVC, state: "teststate123", region: "us" });
  check("U3 region 'us' (lowercase) -> US host", url === US_URL);
}

// ── U4: non-US region routes to international host ────────────────────────────
{
  const url = buildAuthorizeUrl({ serviceId: SVC, state: "teststate123", region: "GB" });
  const expected = `https://services.tiktokshop.com/open/authorize?service_id=${SVC}&state=teststate123`;
  check("U4 region=GB -> international URL", url === expected);
}

// ── U5: state with surrounding whitespace is trimmed ─────────────────────────
{
  const url = buildAuthorizeUrl({ serviceId: SVC, state: "  teststate123  ", region: "US" });
  check("U5 whitespace-padded state trimmed in URL", url === US_URL);
}

// ── G1: generateState returns a URL-safe base64url string, length >= 32 ──────
{
  const s = generateState();
  check("G1a result is a string", typeof s === "string");
  check("G1b matches /^[A-Za-z0-9_-]+$/", /^[A-Za-z0-9_-]+$/.test(s));
  check("G1c length >= 32", s.length >= 32);
}

// ── G2: successive calls return different values ──────────────────────────────
{
  const a = generateState();
  const b = generateState();
  check("G2 two successive calls return different tokens", a !== b);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
