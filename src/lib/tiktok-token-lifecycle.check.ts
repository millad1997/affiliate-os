// Positive-control script for the tiktok-token-lifecycle module.
//
// Realistic-but-synthetic data only — never real secrets. ALL boundaries are
// injected (getCredentials, storeCredentials, fetchImpl), so this never touches
// real Supabase or the real network and needs no env.
//
// HOW TO RUN (do not omit --conditions=react-server): importing
// ./tiktok-token-lifecycle pulls in `server-only`, whose default export THROWS at
// import time. The react-server export condition resolves it to a no-op:
//
//   npx tsx --conditions=react-server src/lib/tiktok-token-lifecycle.check.ts

import { getValidAccessToken } from "./tiktok-token-lifecycle";
import type {
  GetCredentialsResult,
  StoreCredentialsResult,
  StoredTikTokCredentials,
  getTikTokCredentials,
  storeTikTokCredentials,
} from "./tiktok-credentials";
import type { TikTokTokenSet } from "./tiktok-auth-token";
import type { FetchLike } from "./tiktok-fetch";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}`);
  }
}

// ── Stubs ─────────────────────────────────────────────────────────────────────

// Stub transport: returns a canned status + body, optionally recording each call.
// Matches FetchLike exactly: (url, init) => Promise<{status, text()}>.
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

// get-stub typed as the real fn, returning a canned GetCredentialsResult.
function getStub(result: GetCredentialsResult): typeof getTikTokCredentials {
  return async () => result;
}

// store-stub typed as the real fn; records call count + the last token handed in.
function makeStoreStub(result: StoreCredentialsResult): {
  fn: typeof storeTikTokCredentials;
  state: { calls: number; lastToken: TikTokTokenSet | null };
} {
  const state: { calls: number; lastToken: TikTokTokenSet | null } = { calls: 0, lastToken: null };
  const fn: typeof storeTikTokCredentials = async (_userId, token) => {
    state.calls += 1;
    state.lastToken = token;
    return result;
  };
  return { fn, state };
}

// ── Synthetic fixtures ──────────────────────────────────────────────────────────

const NOW = 1_700_000_000;
const BUFFER = 24 * 60 * 60; // matches DEFAULT_REFRESH_BUFFER_SECONDS
const APP_KEY = "test_app_key";
const APP_SECRET = "test_app_secret";
const USER_ID = "user_synthetic_001";

// Full StoredTikTokCredentials (camelCase) with an adjustable access-token expiry.
function makeStored(accessTokenExpiresAt: number): StoredTikTokCredentials {
  return {
    userId: USER_ID,
    accessToken: "act_stored_OLD",
    accessTokenExpiresAt,
    refreshToken: "TTP_stored_refresh_OLD",
    refreshTokenExpiresAt: accessTokenExpiresAt + 31_536_000,
    openId: "open_synthetic_stored",
    sellerName: null,
    sellerBaseRegion: null,
    userType: null,
    shopCipher: null,
    shopId: null,
    shopRegion: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// Happy refresh envelope (code 0). The fresh refresh_token differs from the stored
// one so we can prove the RESPONSE set is what gets persisted.
const happyEnvelope = JSON.stringify({
  code: 0,
  message: "Success",
  request_id: "req_refresh_happy",
  data: {
    access_token: "act_refreshed_NEW",
    access_token_expire_in: 1_900_000_000,
    refresh_token: "TTP_refresh_NEW",
    refresh_token_expire_in: 1_931_536_000,
    open_id: "open_refreshed_001",
    seller_name: "Refreshed Synthetic Shop",
    seller_base_region: "US",
    user_type: 1,
  },
});

async function main() {
  // ── (1) Fresh, no refresh ─────────────────────────────────────────────────────
  {
    const store = makeStoreStub({ ok: true });
    const fetchState = { calls: 0 };
    const r = await getValidAccessToken(USER_ID, {
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      now: NOW,
      fetchImpl: mockFetch(200, happyEnvelope, () => (fetchState.calls += 1)),
      getCredentials: getStub({ ok: true, credentials: makeStored(NOW + BUFFER + 100) }),
      storeCredentials: store.fn,
    });
    check("(1) fresh -> ok===true", r.ok === true);
    check("(1) fresh -> refreshed===false", r.ok && r.refreshed === false);
    check("(1) fresh -> accessToken is stored OLD", r.ok && r.accessToken === "act_stored_OLD");
    check("(1) fresh -> store NOT called", store.state.calls === 0);
    check("(1) fresh -> fetch NOT called", fetchState.calls === 0);
  }

  // ── (2) Stale -> refresh -> store ok ──────────────────────────────────────────
  {
    const store = makeStoreStub({ ok: true });
    const r = await getValidAccessToken(USER_ID, {
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      now: NOW,
      fetchImpl: mockFetch(200, happyEnvelope),
      getCredentials: getStub({ ok: true, credentials: makeStored(NOW + 100) }),
      storeCredentials: store.fn,
    });
    check("(2) stale -> ok===true", r.ok === true);
    check("(2) stale -> refreshed===true", r.ok && r.refreshed === true);
    check("(2) stale -> accessToken is refreshed NEW", r.ok && r.accessToken === "act_refreshed_NEW");
    check("(2) stale -> persisted token.refreshToken is the NEW one", store.state.lastToken?.refreshToken === "TTP_refresh_NEW");
    check("(2) stale -> store called exactly once", store.state.calls === 1);
  }

  // ── (3) Boundary: expiresAt === now + buffer EXACTLY -> stale ─────────────────
  {
    const store = makeStoreStub({ ok: true });
    const r = await getValidAccessToken(USER_ID, {
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      now: NOW,
      fetchImpl: mockFetch(200, happyEnvelope),
      getCredentials: getStub({ ok: true, credentials: makeStored(NOW + BUFFER) }),
      storeCredentials: store.fn,
    });
    check("(3) boundary -> ok===true", r.ok === true);
    check("(3) boundary counts as stale -> refreshed===true", r.ok && r.refreshed === true);
  }

  // ── (4) Not connected (not_found -> not_connected) ───────────────────────────
  {
    const r = await getValidAccessToken(USER_ID, {
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      now: NOW,
      getCredentials: getStub({ ok: false, reason: "not_found" }),
      storeCredentials: makeStoreStub({ ok: true }).fn,
    });
    check("(4) not_found -> ok===false", r.ok === false);
    check("(4) not_found -> reason==='not_connected'", !r.ok && r.reason === "not_connected");
  }

  // ── (5) Query failed (query_failed -> query_failed) ──────────────────────────
  {
    const r = await getValidAccessToken(USER_ID, {
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      now: NOW,
      getCredentials: getStub({ ok: false, reason: "query_failed" }),
      storeCredentials: makeStoreStub({ ok: true }).fn,
    });
    check("(5) query_failed -> ok===false", r.ok === false);
    check("(5) query_failed -> reason==='query_failed'", !r.ok && r.reason === "query_failed");
  }

  // ── (6) Refresh api_error -> refresh_failed, store NOT called ────────────────
  {
    const store = makeStoreStub({ ok: true });
    const r = await getValidAccessToken(USER_ID, {
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      now: NOW,
      fetchImpl: mockFetch(200, JSON.stringify({ code: 36004004, message: "expired" })),
      getCredentials: getStub({ ok: true, credentials: makeStored(NOW + 100) }),
      storeCredentials: store.fn,
    });
    check("(6) refresh api_error -> ok===false", r.ok === false);
    check("(6) refresh api_error -> reason==='refresh_failed'", !r.ok && r.reason === "refresh_failed");
    check("(6) refresh api_error -> store NOT called", store.state.calls === 0);
  }

  // ── (7) Refresh transport (network throw) -> refresh_failed ──────────────────
  {
    const r = await getValidAccessToken(USER_ID, {
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      now: NOW,
      fetchImpl: throwingFetch("ECONNREFUSED"),
      getCredentials: getStub({ ok: true, credentials: makeStored(NOW + 100) }),
      storeCredentials: makeStoreStub({ ok: true }).fn,
    });
    check("(7) transport -> ok===false", r.ok === false);
    check("(7) transport -> reason==='refresh_failed'", !r.ok && r.reason === "refresh_failed");
  }

  // ── (8) FAIL-CLOSED: store fails -> store_failed, no token leaked ────────────
  {
    const store = makeStoreStub({ ok: false, reason: "store_failed" });
    const r = await getValidAccessToken(USER_ID, {
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      now: NOW,
      fetchImpl: mockFetch(200, happyEnvelope),
      getCredentials: getStub({ ok: true, credentials: makeStored(NOW + 100) }),
      storeCredentials: store.fn,
    });
    check("(8) fail-closed -> ok===false", r.ok === false);
    check("(8) fail-closed -> reason==='store_failed'", !r.ok && r.reason === "store_failed");
    check("(8) fail-closed -> no accessToken on result (token not leaked)", !("accessToken" in r));
  }

  // ── (9) Custom buffer honored ─────────────────────────────────────────────────
  // expiresAt = now + 7200: would refresh under the 24h default, but is fresh under
  // a 1h buffer.
  {
    const store = makeStoreStub({ ok: true });
    const fetchState = { calls: 0 };
    const r = await getValidAccessToken(USER_ID, {
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      now: NOW,
      bufferSeconds: 3600,
      fetchImpl: mockFetch(200, happyEnvelope, () => (fetchState.calls += 1)),
      getCredentials: getStub({ ok: true, credentials: makeStored(NOW + 7200) }),
      storeCredentials: store.fn,
    });
    check("(9) custom buffer 1h -> refreshed===false", r.ok && r.refreshed === false);
    check("(9) custom buffer 1h -> fetch NOT called", fetchState.calls === 0);
  }

  // ── (10) Epoch-SECONDS units guard (omit now) ────────────────────────────────
  // A real far-future epoch-seconds expiry. With the default now (seconds) this is
  // fresh. If the code wrongly compared against Date.now() (ms), now+buffer would be
  // ~1.7e12 and this ~1.7e9 expiry would be treated as stale -> wrongly refreshed.
  {
    const nowSecondsReal = Math.floor(Date.now() / 1000);
    const store = makeStoreStub({ ok: true });
    const fetchState = { calls: 0 };
    const r = await getValidAccessToken(USER_ID, {
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      // now omitted -> defaults to Math.floor(Date.now() / 1000)
      fetchImpl: mockFetch(200, happyEnvelope, () => (fetchState.calls += 1)),
      getCredentials: getStub({ ok: true, credentials: makeStored(nowSecondsReal + 31_536_000) }),
      storeCredentials: store.fn,
    });
    check("(10) epoch-seconds guard -> refreshed===false", r.ok && r.refreshed === false);
    check("(10) epoch-seconds guard -> fetch NOT called", fetchState.calls === 0);
  }

  console.log(`\n(${passed} passed, ${failed} failed)`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
