// Golden-vector suite for makeTikTokSendAdapter. No env, no real I/O — every dependency is
// injected. Run with: npx tsx --conditions=react-server src/lib/tiktok-send-adapter.check.ts
import { makeTikTokSendAdapter, type TikTokSendAdapterDeps } from "./tiktok-send-adapter";
import { getValidAccessToken } from "./tiktok-token-lifecycle";
import { getTikTokCredentials, type StoredTikTokCredentials } from "./tiktok-credentials";
import { signRequest } from "./tiktok-sign";
import type { FetchLike } from "./tiktok-fetch";
import type { BrandOutreachConfig } from "./outreach-readiness";

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const pass = g === w;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { console.log(`  got:  ${g}`); console.log(`  want: ${w}`); }
}
function ok(name: string, cond: boolean) {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
}

const baseConfig: BrandOutreachConfig = {
  tiktokProductIds: ["1729382476051234567"],
  sellerContactEmail: "partnerships@vireohealth.com",
  hasFreeSample: true,
  isSampleApprovalExempt: false,
  collaborationDurationDays: 21,
  commissionRatePercent: 15,
};

const credsRow: StoredTikTokCredentials = {
  userId: "user-1",
  accessToken: "test_access_token",
  accessTokenExpiresAt: 9_999_999_999,
  refreshToken: "test_refresh_token",
  refreshTokenExpiresAt: 9_999_999_999,
  openId: "test_open_id",
  sellerName: "Vireo Health Co",
  sellerBaseRegion: "US",
  userType: 1,
  shopCipher: "ROW_test_cipher",
  shopId: "7000000000000000000",
  shopRegion: "US",
  updatedAt: "2026-06-01T00:00:00Z",
};

const tokenOk: typeof getValidAccessToken = async () => ({
  ok: true,
  accessToken: "test_access_token",
  refreshed: false,
});
const credsOk: typeof getTikTokCredentials = async () => ({ ok: true, credentials: credsRow });

function makeCaptureFetch(status: number, bodyText: string) {
  const calls: Array<{
    url: string;
    init: { method: string; headers: Record<string, string>; body?: string };
  }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { status, text: async () => bodyText };
  };
  return { fetchImpl, calls };
}

function makeDeps(overrides: Partial<TikTokSendAdapterDeps>): TikTokSendAdapterDeps {
  return {
    userId: "user-1",
    appKey: "test_app_key",
    appSecret: "test_app_secret",
    brandName: "Vireo Health Co",
    outreachConfig: baseConfig,
    now: () => 1_700_000_000,
    getValidToken: tokenOk,
    getCredentials: credsOk,
    ...overrides,
  };
}

async function main() {
  // V1: success path + full wire-format lock on the captured request.
  {
    const success = JSON.stringify({
      code: 0,
      message: "success",
      request_id: "req-1",
      data: { target_collaboration: { id: "collab_123" } },
    });
    const { fetchImpl, calls } = makeCaptureFetch(200, success);
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl }));
    const res = await adapter({
      creatorOpenId: "ttopen_focus_fiona",
      message: "Hi! We'd love to collaborate.",
    });
    eq("V1 result", res, { ok: true, providerRef: "collab_123" });
    eq("V1 exactly one fetch", calls.length, 1);
    const call = calls[0];
    ok("V1 url has path", call.url.includes("/affiliate_seller/202508/target_collaborations?"));
    ok("V1 url has app_key", call.url.includes("app_key=test_app_key"));
    ok("V1 url has timestamp", call.url.includes("timestamp=1700000000"));
    ok("V1 url has shop_cipher", call.url.includes("shop_cipher=ROW_test_cipher"));
    ok("V1 url has sign", call.url.includes("&sign="));
    ok("V1 accessToken NOT in url", !call.url.includes("test_access_token"));
    eq("V1 method", call.init.method, "POST");
    eq("V1 token header", call.init.headers["x-tts-access-token"], "test_access_token");
    eq("V1 content-type", call.init.headers["content-type"], "application/json");
    const body = JSON.parse(call.init.body ?? "{}") as Record<string, unknown>;
    eq("V1 body name", body.name, "Vireo Health Co — ttopen_focus_fiona");
    eq("V1 body message", body.message, "Hi! We'd love to collaborate.");
    eq("V1 body end_time = now + 21d", body.end_time, String(1_700_000_000 + 21 * 86_400));
    eq("V1 body products", body.products, [
      { id: "1729382476051234567", target_commission_rate: 1500 },
    ]);
    eq("V1 body creators", body.creator_user_open_ids, ["ttopen_focus_fiona"]);
    eq("V1 body contact", body.seller_contact_info, { email: "partnerships@vireohealth.com" });
    eq("V1 body free sample", body.free_sample_rule, {
      has_free_sample: true,
      is_sample_approval_exempt: false,
    });
    const expectedSign = signRequest({
      path: "/affiliate_seller/202508/target_collaborations",
      queryParams: {
        app_key: "test_app_key",
        timestamp: 1_700_000_000,
        shop_cipher: "ROW_test_cipher",
      },
      body: call.init.body ?? "",
      contentType: "application/json",
      appSecret: "test_app_secret",
    });
    ok("V1 sign parity over SENT bytes", call.url.endsWith(`&sign=${expectedSign}`));
  }

  // V2: every token-lifecycle failure maps to the audit vocabulary; no request is ever built.
  for (const [reason, want] of [
    ["not_connected", "not_connected"],
    ["refresh_failed", "token_refresh_failed"],
    ["store_failed", "token_store_failed"],
    ["query_failed", "credentials_query_failed"],
  ] as const) {
    const { fetchImpl, calls } = makeCaptureFetch(200, "{}");
    const tokenFail: typeof getValidAccessToken = async () => ({ ok: false, reason });
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl, getValidToken: tokenFail }));
    eq(`V2 token ${reason}`, await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: want,
    });
    eq(`V2 token ${reason} no fetch`, calls.length, 0);
  }

  // V3: credential-read failures.
  {
    const { fetchImpl, calls } = makeCaptureFetch(200, "{}");
    const credsNotFound: typeof getTikTokCredentials = async () => ({
      ok: false,
      reason: "not_found",
    });
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl, getCredentials: credsNotFound }));
    eq("V3 creds not_found", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "not_connected",
    });
    eq("V3 no fetch", calls.length, 0);
  }
  {
    const { fetchImpl } = makeCaptureFetch(200, "{}");
    const credsErr: typeof getTikTokCredentials = async () => ({
      ok: false,
      reason: "query_failed",
    });
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl, getCredentials: credsErr }));
    eq("V3 creds query_failed", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "credentials_query_failed",
    });
  }

  // V4: unresolved shop cipher.
  {
    const { fetchImpl, calls } = makeCaptureFetch(200, "{}");
    const credsNoCipher: typeof getTikTokCredentials = async () => ({
      ok: true,
      credentials: { ...credsRow, shopCipher: null },
    });
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl, getCredentials: credsNoCipher }));
    eq("V4 cipher unresolved", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "shop_cipher_unresolved",
    });
    eq("V4 no fetch", calls.length, 0);
  }

  // V5: config fail-closed (defense in depth below the route preflight).
  {
    const { fetchImpl, calls } = makeCaptureFetch(200, "{}");
    const adapter = makeTikTokSendAdapter(
      makeDeps({ fetchImpl, outreachConfig: { ...baseConfig, sellerContactEmail: null } }),
    );
    eq("V5 missing email", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "missing_contact_email",
    });
    eq("V5 no fetch (email)", calls.length, 0);
  }
  {
    const { fetchImpl, calls } = makeCaptureFetch(200, "{}");
    const adapter = makeTikTokSendAdapter(
      makeDeps({ fetchImpl, outreachConfig: { ...baseConfig, tiktokProductIds: [] } }),
    );
    eq("V5 missing product ids", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "missing_product_ids",
    });
    eq("V5 no fetch (ids)", calls.length, 0);
  }

  // V6: pure-builder refusal surfaces as build_<reason>; nothing is sent.
  {
    const { fetchImpl, calls } = makeCaptureFetch(200, "{}");
    const adapter = makeTikTokSendAdapter(
      makeDeps({ fetchImpl, outreachConfig: { ...baseConfig, commissionRatePercent: 0.5 } }),
    );
    eq("V6 build invalid commission", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "build_invalid_commission_rate",
    });
    eq("V6 no fetch", calls.length, 0);
  }

  // V7: transport failures are value-free (numeric status only, never body text).
  {
    const throwing: FetchLike = async () => {
      throw new Error("boom");
    };
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl: throwing }));
    eq("V7 network", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "transport_network_error",
    });
  }
  {
    const { fetchImpl } = makeCaptureFetch(500, "Internal Server Error");
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl }));
    eq("V7 http 500", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "transport_http_500",
    });
  }
  {
    const { fetchImpl } = makeCaptureFetch(200, "not json");
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl }));
    eq("V7 invalid json 200", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "transport_invalid_json_200",
    });
  }

  // V8: business-envelope errors pass through the parser's vocabulary.
  {
    const { fetchImpl } = makeCaptureFetch(200, JSON.stringify({ code: 16024019, message: "quota" }));
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl }));
    eq("V8 known code", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "insufficient_quota",
    });
  }
  {
    const { fetchImpl } = makeCaptureFetch(200, JSON.stringify({ code: 99999, message: "??" }));
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl }));
    eq("V8 unknown code", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "tiktok_99999",
    });
  }

  // V9: conflicts array on an otherwise-success envelope is a failure.
  {
    const body = JSON.stringify({
      code: 0,
      message: "success",
      data: {
        target_collaboration: { id: "collab_9" },
        target_collaboration_conflicts: [{ creator_open_id: "c", product_id: "p" }],
      },
    });
    const { fetchImpl } = makeCaptureFetch(200, body);
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl }));
    eq("V9 conflict", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "collaboration_conflict",
    });
  }

  // V10: code 0 with no collaboration id is malformed, never a success.
  {
    const { fetchImpl } = makeCaptureFetch(200, JSON.stringify({ code: 0, message: "success", data: {} }));
    const adapter = makeTikTokSendAdapter(makeDeps({ fetchImpl }));
    eq("V10 malformed success", await adapter({ creatorOpenId: "c", message: "m" }), {
      ok: false,
      errorCode: "malformed_success_response",
    });
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
