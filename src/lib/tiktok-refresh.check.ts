import { refreshCredentials } from "./tiktok-refresh";
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

// Stub transport: returns a canned status + body and optionally records the URL
// it was called with. Matches FetchLike exactly: (url, init) => Promise<{status, text()}>.
function mockFetch(status: number, body: string, record?: (url: string) => void): FetchLike {
  return async (url) => {
    record?.(url);
    return { status, text: async () => body };
  };
}

// Stub transport that throws, simulating a network-level failure.
function throwingFetch(message: string): FetchLike {
  return async () => { throw new Error(message); };
}

const creds = {
  appKey: "test_app_key",
  appSecret: "test_app_secret",
  refreshToken: "TTP_test_refresh_abc",
};

async function runChecks() {
  // ── (1) Happy path ───────────────────────────────────────────────────────────
  {
    const envelope = {
      code: 0,
      message: "Success",
      request_id: "req_refresh_happy",
      data: {
        access_token: "act_refreshed_xyz",
        access_token_expire_in: 1893456000,   // absolute Unix epoch seconds (~2030)
        refresh_token: "TTP_test_refresh_NEW", // different from the input token
        refresh_token_expire_in: 1924992000,   // absolute Unix epoch seconds (~2031)
        open_id: "open_synthetic_refresh_001",
        seller_name: "Synthetic Refresh Shop",
        seller_base_region: "US",
        user_type: 1, // creator
      },
    };
    const r = await refreshCredentials({
      ...creds,
      fetchImpl: mockFetch(200, JSON.stringify(envelope)),
    });
    check("(1) happy path -> ok===true", r.ok === true);
    check("(1) happy path -> accessToken", r.ok && r.token.accessToken === "act_refreshed_xyz");
    check("(1) happy path -> accessTokenExpiresAt", r.ok && r.token.accessTokenExpiresAt === 1893456000);
    check("(1) happy path -> refreshToken is RESPONSE value, not input", r.ok && r.token.refreshToken === "TTP_test_refresh_NEW");
    check("(1) happy path -> refreshTokenExpiresAt", r.ok && r.token.refreshTokenExpiresAt === 1924992000);
    check("(1) happy path -> openId", r.ok && r.token.openId === "open_synthetic_refresh_001");
    check("(1) happy path -> sellerName", r.ok && r.token.sellerName === "Synthetic Refresh Shop");
    check("(1) happy path -> sellerBaseRegion", r.ok && r.token.sellerBaseRegion === "US");
    check("(1) happy path -> userType===1", r.ok && r.token.userType === 1);
    check("(1) happy path -> userTypeLabel==='creator'", r.ok && r.token.userTypeLabel === "creator");
  }

  // ── (2) Endpoint/grant wiring ────────────────────────────────────────────────
  {
    let seenUrl: string | null = null;
    const envelope = {
      code: 0,
      message: "Success",
      data: {
        access_token: "act_wiring",
        access_token_expire_in: 1893456000,
        refresh_token: "TTP_test_refresh_NEW",
        refresh_token_expire_in: 1924992000,
        open_id: "open_wiring",
      },
    };
    await refreshCredentials({
      ...creds,
      fetchImpl: mockFetch(200, JSON.stringify(envelope), (u) => (seenUrl = u)),
    });
    check("(2) endpoint/grant -> path is /api/v2/token/refresh", seenUrl !== null && (seenUrl as string).includes("/api/v2/token/refresh"));
    check("(2) endpoint/grant -> grant_type=refresh_token", seenUrl !== null && (seenUrl as string).includes("grant_type=refresh_token"));
    check("(2) endpoint/grant -> refresh_token=TTP_test_refresh_abc", seenUrl !== null && (seenUrl as string).includes("refresh_token=TTP_test_refresh_abc"));
  }

  // ── (3) api_error ────────────────────────────────────────────────────────────
  {
    const envelope = { code: 36004004, message: "refresh token expired", request_id: "req_apierr" };
    const r = await refreshCredentials({
      ...creds,
      fetchImpl: mockFetch(200, JSON.stringify(envelope)),
    });
    check("(3) api_error -> ok===false", r.ok === false);
    check("(3) api_error -> kind==='api_error'", !r.ok && r.kind === "api_error");
    check("(3) api_error -> code===36004004", !r.ok && r.kind === "api_error" && r.code === 36004004);
    check("(3) api_error -> message preserved", !r.ok && r.kind === "api_error" && r.message === "refresh token expired");
  }

  // ── (4) Malformed: code:0 but open_id omitted ────────────────────────────────
  {
    const envelope = {
      code: 0,
      message: "Success",
      data: {
        access_token: "act_malformed",
        access_token_expire_in: 1893456000,
        refresh_token: "TTP_test_refresh_NEW",
        refresh_token_expire_in: 1924992000,
        // open_id intentionally omitted — documents open_id-on-refresh watch behavior
      },
    };
    const r = await refreshCredentials({
      ...creds,
      fetchImpl: mockFetch(200, JSON.stringify(envelope)),
    });
    check("(4) malformed (open_id omitted) -> ok===false", r.ok === false);
    check("(4) malformed (open_id omitted) -> kind==='malformed'", !r.ok && r.kind === "malformed");
  }

  // ── (5) Transport network (stub throws) ──────────────────────────────────────
  {
    const r = await refreshCredentials({
      ...creds,
      fetchImpl: throwingFetch("ECONNREFUSED"),
    });
    check("(5) transport network -> ok===false", r.ok === false);
    check("(5) transport network -> kind==='transport'", !r.ok && r.kind === "transport");
    check("(5) transport network -> detail starts with 'network:'", !r.ok && r.kind === "transport" && r.detail.startsWith("network:"));
  }

  // ── (6) Transport http 429 ───────────────────────────────────────────────────
  // A non-2xx with a non-JSON body → executor maps this to kind:"http".
  {
    const r = await refreshCredentials({
      ...creds,
      fetchImpl: mockFetch(429, "<html>Too Many Requests</html>"),
    });
    check("(6) transport http 429 -> ok===false", r.ok === false);
    check("(6) transport http 429 -> kind==='transport'", !r.ok && r.kind === "transport");
    check("(6) transport http 429 -> detail==='http 429'", !r.ok && r.kind === "transport" && r.detail === "http 429");
  }

  const total = 10 + 3 + 4 + 2 + 3 + 3; // counts per block above
  console.log(`\n${total - failed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runChecks();
