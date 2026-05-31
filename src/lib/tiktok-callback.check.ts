import { verifyState, exchangeCodeForCredentials } from "./tiktok-callback";
import type { FetchLike } from "./tiktok-fetch";

let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}`);
  }
}

// ── Positive controls ────────────────────────────────────────────────────────
check("exact match -> true", verifyState("abc123def", "abc123def") === true);
check("same length, one char differs -> false", verifyState("abc123def", "abc123deg") === false);
check("different length -> false", verifyState("abc12", "abc123def") === false);
check("missing cookie (undefined) -> false", verifyState(undefined, "abc123def") === false);
check("missing query (undefined) -> false", verifyState("abc123def", undefined) === false);
check("null cookie -> false", verifyState(null, "abc") === false);
check("both empty strings -> false", verifyState("", "") === false);

// ── Realistic state value ────────────────────────────────────────────────────
const s = "OKm7vfQTcdWdVQh6fMbp3pv60jhEI1S2bLOFZYBYquY";
const sChanged = s.slice(0, -1) + (s.endsWith("Y") ? "Z" : "Y"); // flip the last char
check("realistic state self-match -> true", verifyState(s, s) === true);
check("realistic state last char changed -> false", verifyState(s, sChanged) === false);

// ── exchangeCodeForCredentials (mock FetchLike) ──────────────────────────────
// A mock transport that returns a canned status + body and optionally records
// the URL it was called with. Matches FetchLike exactly.
function mockFetch(status: number, body: string, record?: (url: string) => void): FetchLike {
  return async (url) => {
    record?.(url);
    return { status, text: async () => body };
  };
}

const creds = { appKey: "test_app_key", appSecret: "test_app_secret" };

async function runExchangeChecks() {
  // ── SUCCESS: code:0 envelope with a full data object (absolute-epoch expiries) ─
  {
    const envelope = {
      code: 0,
      message: "Success",
      request_id: "req_success_1",
      data: {
        access_token: "act_synthetic_abc123",
        access_token_expire_in: 1893456000, // absolute Unix epoch seconds (~2030)
        refresh_token: "rft_synthetic_xyz789",
        refresh_token_expire_in: 1924992000, // absolute Unix epoch seconds (~2031)
        open_id: "open_synthetic_001",
        seller_name: "Synthetic Test Shop",
        seller_base_region: "US",
        user_type: 1, // creator
      },
    };
    const r = await exchangeCodeForCredentials({
      code: "synthetic_auth_code_success",
      ...creds,
      fetchImpl: mockFetch(200, JSON.stringify(envelope)),
    });
    check("exchange success -> ok===true", r.ok === true);
    check("exchange success -> accessToken", r.ok && r.token.accessToken === "act_synthetic_abc123");
    check("exchange success -> accessTokenExpiresAt (absolute epoch)", r.ok && r.token.accessTokenExpiresAt === 1893456000);
    check("exchange success -> refreshToken", r.ok && r.token.refreshToken === "rft_synthetic_xyz789");
    check("exchange success -> refreshTokenExpiresAt (absolute epoch)", r.ok && r.token.refreshTokenExpiresAt === 1924992000);
    check("exchange success -> openId", r.ok && r.token.openId === "open_synthetic_001");
    check("exchange success -> sellerName", r.ok && r.token.sellerName === "Synthetic Test Shop");
    check("exchange success -> sellerBaseRegion", r.ok && r.token.sellerBaseRegion === "US");
    check("exchange success -> userType===1", r.ok && r.token.userType === 1);
    check("exchange success -> userTypeLabel==='creator'", r.ok && r.token.userTypeLabel === "creator");
  }

  // ── AUTH_CODE MAPPING: capture the URL the transport was called with ─────────
  {
    let seenUrl: string | null = null;
    const envelope = {
      code: 0,
      message: "Success",
      data: {
        access_token: "act_synthetic_map",
        access_token_expire_in: 1893456000,
        refresh_token: "rft_synthetic_map",
        refresh_token_expire_in: 1924992000,
        open_id: "open_synthetic_map",
      },
    };
    const authCode = "synthetic_auth_code_mapping";
    await exchangeCodeForCredentials({
      code: authCode,
      ...creds,
      fetchImpl: mockFetch(200, JSON.stringify(envelope), (u) => (seenUrl = u)),
    });
    check("exchange mapping -> url carries auth_code", seenUrl !== null && (seenUrl as string).includes(`auth_code=${authCode}`));
    check("exchange mapping -> grant_type=authorized_code", seenUrl !== null && (seenUrl as string).includes("grant_type=authorized_code"));
  }

  // ── API_ERROR: 200 with non-zero code ────────────────────────────────────────
  {
    const envelope = { code: 36004001, message: "invalid auth code", request_id: "req_api_err" };
    const r = await exchangeCodeForCredentials({
      code: "synthetic_auth_code_apierr",
      ...creds,
      fetchImpl: mockFetch(200, JSON.stringify(envelope)),
    });
    check("exchange api_error -> ok===false", r.ok === false);
    check("exchange api_error -> kind==='api_error'", !r.ok && r.kind === "api_error");
    check("exchange api_error -> code preserved", !r.ok && r.kind === "api_error" && r.code === 36004001);
    check("exchange api_error -> message preserved", !r.ok && r.kind === "api_error" && r.message === "invalid auth code");
  }

  // ── MALFORMED: 200, code:0, but data missing required access_token ───────────
  {
    const envelope = {
      code: 0,
      message: "Success",
      data: {
        // access_token intentionally omitted
        access_token_expire_in: 1893456000,
        refresh_token: "rft_synthetic_malformed",
        refresh_token_expire_in: 1924992000,
        open_id: "open_synthetic_malformed",
      },
    };
    const r = await exchangeCodeForCredentials({
      code: "synthetic_auth_code_malformed",
      ...creds,
      fetchImpl: mockFetch(200, JSON.stringify(envelope)),
    });
    check("exchange malformed -> ok===false", r.ok === false);
    check("exchange malformed -> kind==='malformed'", !r.ok && r.kind === "malformed");
  }

  // ── TRANSPORT: status 500 with a non-JSON body ───────────────────────────────
  {
    const r = await exchangeCodeForCredentials({
      code: "synthetic_auth_code_transport",
      ...creds,
      fetchImpl: mockFetch(500, "<html>Internal Server Error</html>"),
    });
    check("exchange transport -> ok===false", r.ok === false);
    check("exchange transport -> kind==='transport'", !r.ok && r.kind === "transport");
    check("exchange transport -> detail is short ('http 500')", !r.ok && r.kind === "transport" && r.detail === "http 500");
    check("exchange transport -> detail leaks no body", !r.ok && r.kind === "transport" && !r.detail.includes("Internal Server Error"));
  }
}

runExchangeChecks().then(() => {
  if (failed > 0) {
    process.exit(1);
  }
});
