// Positive-control script for the tiktok-creator-fetcher module.
//
// Realistic-but-synthetic data only — never real secrets. ALL boundaries are
// injected (getValidToken, getCredentials, fetchImpl), so this never touches
// real Supabase or the real network and needs no env. The request signing path
// (buildGetCreatorRequest -> signRequest) runs for real against synthetic
// secrets so the URL/header assertions exercise the actual wire shape.
//
// HOW TO RUN (do not omit --conditions=react-server): importing
// ./tiktok-creator-fetcher pulls in `server-only`, whose default export THROWS
// at import time. The react-server export condition resolves it to a no-op:
//
//   npx tsx --conditions=react-server src/lib/tiktok-creator-fetcher.check.ts

import { makeFetchCreatorDetail, type CreatorFetcherDeps } from "./tiktok-creator-fetcher";
import type { FetchLike } from "./tiktok-fetch";
import type { getValidAccessToken, ValidAccessTokenResult } from "./tiktok-token-lifecycle";
import type {
  getTikTokCredentials,
  GetCredentialsResult,
  StoredTikTokCredentials,
} from "./tiktok-credentials";

let passed = 0;
// Throw on first mismatch — a failing assertion stops the run with a non-value
// message (the scenario name only, never a secret).
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.log(`FAIL: ${name}`);
    throw new Error(`assertion failed: ${name}`);
  }
  passed++;
  console.log(`PASS: ${name}`);
}

// ── Stubs ─────────────────────────────────────────────────────────────────────

// token-stub typed as the real fn, returning a canned ValidAccessTokenResult.
function tokenStub(result: ValidAccessTokenResult): typeof getValidAccessToken {
  return async () => result;
}

// creds-stub typed as the real fn, returning a canned GetCredentialsResult.
function credsStub(result: GetCredentialsResult): typeof getTikTokCredentials {
  return async () => result;
}

// Probe shared by the fetch stubs: records whether the transport was reached and
// captures the exact url + headers it was handed.
type FetchProbe = {
  called: boolean;
  url: string | null;
  headers: Record<string, string> | null;
};
function makeProbe(): FetchProbe {
  return { called: false, url: null, headers: null };
}

// Transport that records the call then returns a canned status + body. Matches
// FetchLike exactly: (url, init) => Promise<{status, text()}>.
function respondingFetch(probe: FetchProbe, status: number, body: string): FetchLike {
  return async (url, init) => {
    probe.called = true;
    probe.url = url;
    probe.headers = init.headers;
    return { status, text: async () => body };
  };
}

// Transport that records the call then throws, simulating a network failure.
function throwingFetch(probe: FetchProbe, message: string): FetchLike {
  return async (url, init) => {
    probe.called = true;
    probe.url = url;
    probe.headers = init.headers;
    throw new Error(message);
  };
}

// ── Synthetic fixtures ──────────────────────────────────────────────────────────

const USER_ID = "user_synthetic_001";
const APP_KEY = "test_app_key";
const APP_SECRET = "test_app_secret";
const ACCESS_TOKEN = "act_synthetic_LIVE_TOKEN_xyz";
const CREATOR_OPEN_ID = "creator_open_id_42";
const NOW = 1_700_000_000;

const TOKEN_OK: ValidAccessTokenResult = { ok: true, accessToken: ACCESS_TOKEN, refreshed: false };

// Full StoredTikTokCredentials (camelCase) with an adjustable shop_cipher. The
// stored access/refresh tokens are deliberately distinct from the live token to
// prove the request uses tok.accessToken, not the stored value.
function storedWithCipher(shopCipher: string | null): StoredTikTokCredentials {
  return {
    userId: USER_ID,
    accessToken: "act_stored_unused",
    accessTokenExpiresAt: NOW + 10_000_000,
    refreshToken: "TTP_stored_unused",
    refreshTokenExpiresAt: NOW + 20_000_000,
    openId: "open_synthetic",
    sellerName: null,
    sellerBaseRegion: null,
    userType: null,
    shopCipher,
    shopId: null,
    shopRegion: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// Assemble deps with a fixed clock and the injected boundaries.
function makeDeps(args: {
  token: ValidAccessTokenResult;
  creds: GetCredentialsResult;
  fetchImpl: FetchLike;
}): CreatorFetcherDeps {
  return {
    userId: USER_ID,
    appKey: APP_KEY,
    appSecret: APP_SECRET,
    fetchImpl: args.fetchImpl,
    now: () => NOW,
    getValidToken: tokenStub(args.token),
    getCredentials: credsStub(args.creds),
  };
}

async function main() {
  // ── (1) SUCCESS pass-through + wire-shape assertions ──────────────────────────
  {
    const probe = makeProbe();
    const body = JSON.stringify({
      code: 0,
      message: "success",
      request_id: "req_creator_detail_ok",
      data: { creator: { username: "mens_wellness_marcus" } },
    });
    const fetchDetail = makeFetchCreatorDetail(
      makeDeps({
        token: TOKEN_OK,
        creds: { ok: true, credentials: storedWithCipher("cipher_abc") },
        fetchImpl: respondingFetch(probe, 200, body),
      }),
    );
    const r = await fetchDetail(CREATOR_OPEN_ID);
    check("(1) success -> code===0", r.code === 0);
    check("(1) success -> message==='success'", r.message === "success");
    check("(1) success -> request_id passes through", r.request_id === "req_creator_detail_ok");
    check("(1) success -> data.creator.username passes through", r.data?.creator?.username === "mens_wellness_marcus");
    check(
      "(1) success -> exactly {code,data,message,request_id}",
      JSON.stringify(Object.keys(r).sort()) === JSON.stringify(["code", "data", "message", "request_id"]),
    );
    check("(1) success -> fetch WAS called", probe.called === true);
    check("(1) success -> url carries shop_cipher=cipher_abc", probe.url !== null && probe.url.includes("shop_cipher=cipher_abc"));
    check("(1) success -> url carries sign=", probe.url !== null && probe.url.includes("sign="));
    check("(1) success -> url does NOT leak the access token", probe.url !== null && !probe.url.includes(ACCESS_TOKEN));
    check("(1) success -> header x-tts-access-token === access token", probe.headers?.["x-tts-access-token"] === ACCESS_TOKEN);
  }

  // ── (2) token not_connected -> -10, fetch NOT called ──────────────────────────
  {
    const probe = makeProbe();
    const fetchDetail = makeFetchCreatorDetail(
      makeDeps({
        token: { ok: false, reason: "not_connected" },
        creds: { ok: true, credentials: storedWithCipher("cipher_abc") },
        fetchImpl: respondingFetch(probe, 200, "{}"),
      }),
    );
    const r = await fetchDetail(CREATOR_OPEN_ID);
    check("(2) token not_connected -> code===-10", r.code === -10);
    check("(2) token not_connected -> message==='not_connected'", r.message === "not_connected");
    check("(2) token not_connected -> no data field", !("data" in r));
    check("(2) token not_connected -> fetch NOT called", probe.called === false);
  }

  // ── (3) token refresh_failed -> -11, fetch NOT called ─────────────────────────
  {
    const probe = makeProbe();
    const fetchDetail = makeFetchCreatorDetail(
      makeDeps({
        token: { ok: false, reason: "refresh_failed" },
        creds: { ok: true, credentials: storedWithCipher("cipher_abc") },
        fetchImpl: respondingFetch(probe, 200, "{}"),
      }),
    );
    const r = await fetchDetail(CREATOR_OPEN_ID);
    check("(3) token refresh_failed -> code===-11", r.code === -11);
    check("(3) token refresh_failed -> message==='token_refresh_failed'", r.message === "token_refresh_failed");
    check("(3) token refresh_failed -> fetch NOT called", probe.called === false);
  }

  // ── (4) shopCipher null (token+creds ok) -> -15, fetch NOT called ─────────────
  {
    const probe = makeProbe();
    const fetchDetail = makeFetchCreatorDetail(
      makeDeps({
        token: TOKEN_OK,
        creds: { ok: true, credentials: storedWithCipher(null) },
        fetchImpl: respondingFetch(probe, 200, "{}"),
      }),
    );
    const r = await fetchDetail(CREATOR_OPEN_ID);
    check("(4) cipher null -> code===-15", r.code === -15);
    check("(4) cipher null -> message==='shop_cipher_unresolved'", r.message === "shop_cipher_unresolved");
    check("(4) cipher null -> fetch NOT called", probe.called === false);
  }

  // ── (5) creds read not_found -> -10, fetch NOT called ─────────────────────────
  {
    const probe = makeProbe();
    const fetchDetail = makeFetchCreatorDetail(
      makeDeps({
        token: TOKEN_OK,
        creds: { ok: false, reason: "not_found" },
        fetchImpl: respondingFetch(probe, 200, "{}"),
      }),
    );
    const r = await fetchDetail(CREATOR_OPEN_ID);
    check("(5) creds not_found -> code===-10", r.code === -10);
    check("(5) creds not_found -> message==='not_connected'", r.message === "not_connected");
    check("(5) creds not_found -> fetch NOT called", probe.called === false);
  }

  // ── (6) transport network (fetchImpl throws) -> -1 ────────────────────────────
  {
    const probe = makeProbe();
    const fetchDetail = makeFetchCreatorDetail(
      makeDeps({
        token: TOKEN_OK,
        creds: { ok: true, credentials: storedWithCipher("cipher_abc") },
        fetchImpl: throwingFetch(probe, "ECONNREFUSED 127.0.0.1:443"),
      }),
    );
    const r = await fetchDetail(CREATOR_OPEN_ID);
    check("(6) transport network -> code===-1", r.code === -1);
    check("(6) transport network -> message==='transport_network_error'", r.message === "transport_network_error");
    check("(6) transport network -> message leaks no transport detail", !r.message.includes("ECONNREFUSED"));
  }

  // ── (7) transport http 403 (non-JSON body) -> -2 ─────────────────────────────
  {
    const probe = makeProbe();
    const fetchDetail = makeFetchCreatorDetail(
      makeDeps({
        token: TOKEN_OK,
        creds: { ok: true, credentials: storedWithCipher("cipher_abc") },
        fetchImpl: respondingFetch(probe, 403, "<html>Forbidden</html>"),
      }),
    );
    const r = await fetchDetail(CREATOR_OPEN_ID);
    check("(7) http 403 -> code===-2", r.code === -2);
    check("(7) http 403 -> message==='transport_http_403'", r.message === "transport_http_403");
    check("(7) http 403 -> message leaks no body", !r.message.includes("Forbidden"));
  }

  // ── (8) transport invalid_json (status 200, non-JSON body) -> -3 ─────────────
  {
    const probe = makeProbe();
    const fetchDetail = makeFetchCreatorDetail(
      makeDeps({
        token: TOKEN_OK,
        creds: { ok: true, credentials: storedWithCipher("cipher_abc") },
        fetchImpl: respondingFetch(probe, 200, "not json"),
      }),
    );
    const r = await fetchDetail(CREATOR_OPEN_ID);
    check("(8) invalid_json -> code===-3", r.code === -3);
    check("(8) invalid_json -> message==='transport_invalid_json_200'", r.message === "transport_invalid_json_200");
  }

  // ── (9) business error pass-through (200, non-zero envelope) -> UNCHANGED ──────
  {
    const probe = makeProbe();
    const body = JSON.stringify({ code: 105002, message: "creator not found" });
    const fetchDetail = makeFetchCreatorDetail(
      makeDeps({
        token: TOKEN_OK,
        creds: { ok: true, credentials: storedWithCipher("cipher_abc") },
        fetchImpl: respondingFetch(probe, 200, body),
      }),
    );
    const r = await fetchDetail(CREATOR_OPEN_ID);
    check("(9) business error -> code===105002 (unchanged)", r.code === 105002);
    check("(9) business error -> message==='creator not found' (unchanged)", r.message === "creator not found");
    check("(9) business error -> NOT coerced to a negative sentinel", r.code > 0);
  }

  console.log(`\n(${passed} passed, 0 failed)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
