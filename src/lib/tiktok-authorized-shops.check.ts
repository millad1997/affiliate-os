import {
  buildGetAuthorizedShopsRequest,
  parseAuthorizedShopsResponse,
  selectShopForRegion,
  type AuthorizedShop,
} from "./tiktok-authorized-shops";
import { signRequest } from "./tiktok-sign";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else       { fail++; console.log(`  FAIL  ${name}`); }
}

const creds       = { appKey: "test_app_key", appSecret: "test_app_secret" };
const accessToken = "test_access_token_abc";
const fixedTs     = 1700000000;

// ── B1: method and URL shape ──────────────────────────────────────────────────
{
  const req = buildGetAuthorizedShopsRequest(creds, accessToken, { timestamp: fixedTs });
  const u = new URL(req.url);
  check("B1a method is GET", req.method === "GET");
  check("B1b host is open-api.tiktokglobalshop.com", u.host === "open-api.tiktokglobalshop.com");
  check("B1c path is /authorization/202309/shops", u.pathname === "/authorization/202309/shops");
}

// ── B2: query-param safety ────────────────────────────────────────────────────
{
  const req = buildGetAuthorizedShopsRequest(creds, accessToken, { timestamp: fixedTs });
  const u = new URL(req.url);
  check("B2a app_key in query", u.searchParams.has("app_key"));
  check("B2b timestamp in query", u.searchParams.has("timestamp"));
  check("B2c sign in query", u.searchParams.has("sign"));
  check("B2d no shop_cipher", !u.searchParams.has("shop_cipher"));
  check("B2e no access_token param", !u.searchParams.has("access_token"));
  check("B2f URL does not contain access token string", !req.url.includes("test_access_token_abc"));
}

// ── B3: headers ───────────────────────────────────────────────────────────────
{
  const req = buildGetAuthorizedShopsRequest(creds, accessToken, { timestamp: fixedTs });
  check("B3a content-type: application/json", req.headers["content-type"] === "application/json");
  check("B3b x-tts-access-token matches token", req.headers["x-tts-access-token"] === "test_access_token_abc");
}

// ── B4: sign equals independent computation (proves exactly app_key+timestamp signed) ──
{
  const req = buildGetAuthorizedShopsRequest(creds, accessToken, { timestamp: fixedTs });
  const builderSign = new URL(req.url).searchParams.get("sign")!;
  const refSign = signRequest({
    path: "/authorization/202309/shops",
    queryParams: { app_key: "test_app_key", timestamp: fixedTs },
    body: "",
    contentType: "application/json",
    appSecret: "test_app_secret",
  });
  check("B4 sign equals independent computation", builderSign === refSign);
}

// ── B5: injected timestamp appears verbatim ───────────────────────────────────
{
  const req = buildGetAuthorizedShopsRequest(creds, accessToken, { timestamp: fixedTs });
  const u = new URL(req.url);
  check("B5 timestamp value is 1700000000", u.searchParams.get("timestamp") === "1700000000");
}

// doc example (from TikTok Shop API Reference)
const docExample = {
  code: 0,
  data: {
    shops: [
      {
        id: "7000714532876273420",
        name: "Maomao beauty shop",
        region: "GB",
        seller_type: "CROSS_BORDER",
        cipher: "GCP_XF90igAAAABh00qsWgtvOiGFNqyubMt3",
        code: "CNGBCBA4LLU8",
      },
    ],
  },
  message: "Success",
  request_id: "x",
};

// ── P1: doc example happy path ────────────────────────────────────────────────
{
  const r = parseAuthorizedShopsResponse(docExample);
  check("P1a ok===true", r.ok === true);
  const shop = r.ok ? r.shops[0] : null;
  check("P1b cipher", shop?.cipher === "GCP_XF90igAAAABh00qsWgtvOiGFNqyubMt3");
  check("P1c shopId", shop?.shopId === "7000714532876273420");
  check("P1d region", shop?.region === "GB");
  check("P1e sellerType", shop?.sellerType === "CROSS_BORDER");
  check("P1f shopCode", shop?.shopCode === "CNGBCBA4LLU8");
}

// ── P2: shopCode is the string "CNGBCBA4LLU8" — not 0, not the envelope code ─
{
  const r = parseAuthorizedShopsResponse(docExample);
  const shop = r.ok ? r.shops[0] : null;
  check(
    "P2 shopCode is string 'CNGBCBA4LLU8'",
    typeof shop?.shopCode === "string" && shop.shopCode === "CNGBCBA4LLU8"
  );
}

// ── P3: two shops returns both ────────────────────────────────────────────────
{
  const r = parseAuthorizedShopsResponse({
    code: 0,
    message: "Success",
    data: {
      shops: [
        { id: "1", name: "US Shop", region: "US", seller_type: "LOCAL",        cipher: "cipher_us", code: "CODE_US" },
        { id: "2", name: "GB Shop", region: "GB", seller_type: "CROSS_BORDER", cipher: "cipher_gb", code: "CODE_GB" },
      ],
    },
  });
  check("P3a ok===true", r.ok === true);
  check("P3b shops length 2", r.ok && r.shops.length === 2);
}

// ── P4: api_error path — no throw ─────────────────────────────────────────────
{
  let threw = false;
  let r: ReturnType<typeof parseAuthorizedShopsResponse> | undefined;
  try {
    r = parseAuthorizedShopsResponse({ code: 12345, message: "no auth" });
  } catch {
    threw = true;
  }
  check("P4a no throw on api error", !threw);
  check("P4b ok===false", r !== undefined && r.ok === false);
  check("P4c kind==='api_error'", r !== undefined && !r.ok && r.kind === "api_error");
  check("P4d code===12345", r !== undefined && !r.ok && r.kind === "api_error" && r.code === 12345);
  check("P4e message==='no auth'", r !== undefined && !r.ok && r.kind === "api_error" && r.message === "no auth");
}

// ── P5: malformed cases ───────────────────────────────────────────────────────
{
  const m1 = parseAuthorizedShopsResponse({ code: 0, message: "ok", data: {} });
  check("P5a data.shops missing -> malformed", !m1.ok && m1.kind === "malformed");

  const m2 = parseAuthorizedShopsResponse({ code: 0, message: "ok" });
  check("P5b data missing -> malformed", !m2.ok && m2.kind === "malformed");

  const m3 = parseAuthorizedShopsResponse("a string");
  check("P5c resp is string -> malformed", !m3.ok && m3.kind === "malformed");
}

// ── P6: code:0 with empty shops array is valid ────────────────────────────────
{
  const r = parseAuthorizedShopsResponse({ code: 0, message: "ok", data: { shops: [] } });
  check("P6a ok===true", r.ok === true);
  check("P6b shops length 0", r.ok && r.shops.length === 0);
}

// ── P7: drop rule — missing cipher or missing id ──────────────────────────────
{
  const r = parseAuthorizedShopsResponse({
    code: 0,
    message: "ok",
    data: {
      shops: [
        { id: "100", name: "US Shop", region: "US", seller_type: "LOCAL", cipher: "cipher_valid", code: "CODE1" },
        { id: "x",   name: "n",       region: "GB", seller_type: "LOCAL" },                          // no cipher → drop
        { cipher: "has_cipher_no_id", region: "DE", seller_type: "LOCAL", code: "CODE3" },           // no id → drop
      ],
    },
  });
  check("P7a ok===true", r.ok === true);
  check("P7b only valid shop kept (length 1)", r.ok && r.shops.length === 1);
  check("P7c kept the shop with cipher_valid", r.ok && r.shops[0]?.cipher === "cipher_valid");
}

// picker fixtures
const shopUS: AuthorizedShop = { shopId: "1", name: "US Shop", region: "US", sellerType: "LOCAL",        cipher: "cipher_us", shopCode: null };
const shopGB: AuthorizedShop = { shopId: "2", name: "GB Shop", region: "GB", sellerType: "CROSS_BORDER", cipher: "cipher_gb", shopCode: null };

// ── K1: single shop, no region -> return it ───────────────────────────────────
{
  check("K1 single shop no region -> that shop", selectShopForRegion([shopUS]) === shopUS);
}

// ── K2: two shops, no region -> null (ambiguous) ──────────────────────────────
{
  check("K2 two shops no region -> null", selectShopForRegion([shopUS, shopGB]) === null);
}

// ── K3: two shops, region "US" -> US shop ────────────────────────────────────
{
  check("K3 region 'US' -> US shop", selectShopForRegion([shopUS, shopGB], "US") === shopUS);
}

// ── K4: two shops, region "JP" -> null (no match) ────────────────────────────
{
  check("K4 region 'JP' -> null", selectShopForRegion([shopUS, shopGB], "JP") === null);
}

// ── K5: case-insensitive region match ─────────────────────────────────────────
{
  check("K5 region 'us' matches shop region 'US'", selectShopForRegion([shopUS, shopGB], "us") === shopUS);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`${fail} control(s) failed`);
