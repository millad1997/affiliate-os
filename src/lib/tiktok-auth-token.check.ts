import {
  buildTokenExchangeRequest,
  buildRefreshTokenRequest,
  parseTokenResponse,
} from "./tiktok-auth-token";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const creds = { appKey: "test_app_key", appSecret: "test_app_secret" };
const authCode = "test_auth_code_123";
const refreshToken = "test_refresh_token_456";

// ── B1: exchange URL shape ───────────────────────────────────────────────────
{
  const req = buildTokenExchangeRequest(authCode, creds);
  const u = new URL(req.url);
  check("B1a method is GET", req.method === "GET");
  check("B1b host is auth.tiktok-shops.com", u.host === "auth.tiktok-shops.com");
  check("B1c path is /api/v2/token/get", u.pathname === "/api/v2/token/get");
  check("B1d grant_type=authorized_code", u.searchParams.get("grant_type") === "authorized_code");
  check("B1e auth_code param present", u.searchParams.get("auth_code") === authCode);
  check("B1f no param literally named 'code'", !u.searchParams.has("code"));
  check("B1g no 'sign' param", !u.searchParams.has("sign"));
  check("B1h app_key present", u.searchParams.get("app_key") === "test_app_key");
  check("B1i headers is empty object", Object.keys(req.headers).length === 0);
  check("B1j body is undefined", req.body === undefined);
}

// ── B2: refresh URL shape ────────────────────────────────────────────────────
{
  const req = buildRefreshTokenRequest(refreshToken, creds);
  const u = new URL(req.url);
  check("B2a method is GET", req.method === "GET");
  check("B2b path is /api/v2/token/refresh", u.pathname === "/api/v2/token/refresh");
  check("B2c grant_type=refresh_token", u.searchParams.get("grant_type") === "refresh_token");
  check("B2d refresh_token param present", u.searchParams.get("refresh_token") === refreshToken);
  check("B2e no 'sign' param", !u.searchParams.has("sign"));
}

// ── B3: special-char encoding ────────────────────────────────────────────────
{
  const tricky = "abc/def+ghi";
  const req = buildTokenExchangeRequest(tricky, creds);
  const rawUrl = req.url;
  // "+" must appear as %2B and "/" as %2F in the raw URL string (before URL parsing re-decodes)
  check("B3a '/' is percent-encoded in raw URL", rawUrl.includes("%2F") || rawUrl.includes("%2f"));
  check("B3b '+' is percent-encoded in raw URL", rawUrl.includes("%2B") || rawUrl.includes("%2b"));
  // Verify round-trip via URL parsing recovers the original value
  const u = new URL(rawUrl);
  check("B3c decoded value round-trips correctly", u.searchParams.get("auth_code") === tricky);
}

// ── P1: happy path with doc sample data (numbers supplied as numbers) ────────
{
  const docSample = {
    code: 0,
    message: "Success",
    request_id: "req_abc123",
    data: {
      access_token: "act_sample_token",
      access_token_expire_in: 1630401330,
      refresh_token: "rft_sample_token",
      refresh_token_expire_in: 1630401510,
      open_id: "ephr6abc",
      seller_name: "Acme Shop",
      seller_base_region: "US",
      user_type: 1,
    },
  };
  const r = parseTokenResponse(docSample);
  check("P1a ok===true", r.ok === true);
  check("P1b accessTokenExpiresAt equals doc value (not now+TTL)", r.ok && r.token.accessTokenExpiresAt === 1630401330);
  check("P1c refreshTokenExpiresAt equals doc value", r.ok && r.token.refreshTokenExpiresAt === 1630401510);
  check("P1d openId mapped", r.ok && r.token.openId === "ephr6abc");
  check("P1e userType===1", r.ok && r.token.userType === 1);
  check("P1f userTypeLabel==='creator'", r.ok && r.token.userTypeLabel === "creator");
  check("P1g accessToken mapped", r.ok && r.token.accessToken === "act_sample_token");
  check("P1h sellerName mapped", r.ok && r.token.sellerName === "Acme Shop");
}

// ── P2: expiries supplied as STRINGS ────────────────────────────────────────
{
  const r = parseTokenResponse({
    code: 0,
    message: "Success",
    data: {
      access_token: "act_tok",
      access_token_expire_in: "1630401330",
      refresh_token: "rft_tok",
      refresh_token_expire_in: "1630401510",
      open_id: "open_p2",
      user_type: 0,
    },
  });
  check("P2a ok===true (string expiries coerced)", r.ok === true);
  check("P2b accessTokenExpiresAt coerced to number", r.ok && r.token.accessTokenExpiresAt === 1630401330);
  check("P2c refreshTokenExpiresAt coerced to number", r.ok && r.token.refreshTokenExpiresAt === 1630401510);
  check("P2d userType 0 -> seller", r.ok && r.token.userTypeLabel === "seller");
}

// ── P3: api_error path ───────────────────────────────────────────────────────
{
  let threw = false;
  let r: ReturnType<typeof parseTokenResponse> | undefined;
  try {
    r = parseTokenResponse({ code: 12345, message: "bad auth" });
  } catch {
    threw = true;
  }
  check("P3a no throw on api error", !threw);
  check("P3b ok===false", r !== undefined && r.ok === false);
  check("P3c kind==='api_error'", r !== undefined && !r.ok && r.kind === "api_error");
  check("P3d code===12345", r !== undefined && !r.ok && r.kind === "api_error" && r.code === 12345);
  check("P3e message==='bad auth'", r !== undefined && !r.ok && r.kind === "api_error" && r.message === "bad auth");
}

// ── P4: code:0 but access_token absent → malformed ──────────────────────────
{
  const r = parseTokenResponse({
    code: 0,
    message: "Success",
    data: {
      // access_token intentionally omitted
      access_token_expire_in: 1630401330,
      refresh_token: "rft_tok",
      refresh_token_expire_in: 1630401510,
      open_id: "open_p4",
    },
  });
  check("P4a ok===false", r.ok === false);
  check("P4b kind==='malformed'", !r.ok && r.kind === "malformed");
}

// ── P5: user_type edge cases ─────────────────────────────────────────────────
{
  const base = {
    code: 0,
    message: "Success",
    data: {
      access_token: "act_tok",
      access_token_expire_in: 1630401330,
      refresh_token: "rft_tok",
      refresh_token_expire_in: 1630401510,
      open_id: "open_p5",
    },
  };

  // user_type: 2 (not in enum, forward-compat)
  const r2 = parseTokenResponse({ ...base, data: { ...base.data, user_type: 2 } });
  check("P5a user_type 2 -> ok===true", r2.ok === true);
  check("P5b user_type 2 -> userType===2", r2.ok && r2.token.userType === 2);
  check("P5c user_type 2 -> userTypeLabel==='unknown'", r2.ok && r2.token.userTypeLabel === "unknown");

  // user_type absent
  const rNull = parseTokenResponse(base);
  check("P5d user_type absent -> ok===true", rNull.ok === true);
  check("P5e user_type absent -> userType===null", rNull.ok && rNull.token.userType === null);
  check("P5f user_type absent -> userTypeLabel==='unknown'", rNull.ok && rNull.token.userTypeLabel === "unknown");

  // user_type: 3 -> partner
  const r3 = parseTokenResponse({ ...base, data: { ...base.data, user_type: 3 } });
  check("P5g user_type 3 -> userTypeLabel==='partner'", r3.ok && r3.token.userTypeLabel === "partner");
}

// ── P6: code:0 but data missing entirely → malformed ────────────────────────
{
  const r = parseTokenResponse({ code: 0, message: "Success" });
  check("P6a ok===false", r.ok === false);
  check("P6b kind==='malformed'", !r.ok && r.kind === "malformed");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`${fail} control(s) failed`);
