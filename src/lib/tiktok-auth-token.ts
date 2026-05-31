// SECURITY: The URLs built by this module carry app_secret and auth_code / refresh_token in
// plaintext query parameters. No caller may ever log, persist, or transmit the full URL.
// This is the TikTok-mandated flow for auth.tiktok-shops.com — it is NOT a signing-based path.

import type { SignedRequest } from "./tiktok-marketplace-request";

const AUTH_BASE = "https://auth.tiktok-shops.com";

function toEncodedQuery(pairs: Array<[string, string]>): string {
  return pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

// Exchanges a one-time auth code for an access + refresh token pair.
// grant_type is literally "authorized_code" per TikTok Shop OAuth spec (not "authorization_code").
// auth code param is "auth_code" (not "code"). GET, no body, no signing, no token header.
export function buildTokenExchangeRequest(
  authCode: string,
  creds: { appKey: string; appSecret: string },
): SignedRequest {
  const query = toEncodedQuery([
    ["app_key", creds.appKey],
    ["app_secret", creds.appSecret],
    ["auth_code", authCode],
    ["grant_type", "authorized_code"],
  ]);
  return {
    method: "GET",
    url: `${AUTH_BASE}/api/v2/token/get?${query}`,
    headers: {},
    body: undefined,
  };
}

// Exchanges a refresh token for a new access + refresh token pair.
export function buildRefreshTokenRequest(
  refreshToken: string,
  creds: { appKey: string; appSecret: string },
): SignedRequest {
  const query = toEncodedQuery([
    ["app_key", creds.appKey],
    ["app_secret", creds.appSecret],
    ["refresh_token", refreshToken],
    ["grant_type", "refresh_token"],
  ]);
  return {
    method: "GET",
    url: `${AUTH_BASE}/api/v2/token/refresh?${query}`,
    headers: {},
    body: undefined,
  };
}

// ── Response types ────────────────────────────────────────────────────────────

// Covers both token/get and token/refresh — the data schema is identical for both endpoints.
// Field-name note: the API doc names the expiry fields "*_expire_in", but the values are
// absolute Unix epoch seconds (an instant), not a TTL duration. We rename them to "*ExpiresAt"
// to make that semantics clear to callers.
export type TikTokTokenSet = {
  accessToken: string;
  accessTokenExpiresAt: number;   // absolute Unix epoch seconds (doc field: access_token_expire_in)
  refreshToken: string;
  refreshTokenExpiresAt: number;  // absolute Unix epoch seconds (doc field: refresh_token_expire_in)
  openId: string;
  sellerName: string | null;
  sellerBaseRegion: string | null;
  userType: number | null;
  // 0 -> seller, 1 -> creator, 3 -> partner (there is no 2 in the current enum);
  // anything not in {0,1,3} (including 2, null, non-finite) -> 'unknown' for forward-compat.
  userTypeLabel: "seller" | "creator" | "partner" | "unknown";
};

export type TokenParseResult =
  | { ok: true; token: TikTokTokenSet }
  | { ok: false; kind: "api_error"; code: number; message: string }
  | { ok: false; kind: "malformed"; message: string };

// ── Response parser ───────────────────────────────────────────────────────────

function malformed(message: string): TokenParseResult {
  return { ok: false, kind: "malformed", message };
}

function coerceInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function coerceString(v: unknown): string | null {
  if (typeof v === "string") return v;
  return null;
}

function userTypeLabel(userType: number | null): TikTokTokenSet["userTypeLabel"] {
  if (userType === 0) return "seller";
  if (userType === 1) return "creator";
  if (userType === 3) return "partner";
  return "unknown";
}

export function parseTokenResponse(resp: unknown): TokenParseResult {
  if (typeof resp !== "object" || resp === null) {
    return malformed("response is not an object");
  }
  const r = resp as Record<string, unknown>;

  if (typeof r["code"] !== "number") {
    return malformed("missing numeric 'code' field");
  }
  const code = r["code"] as number;

  if (code !== 0) {
    const message = typeof r["message"] === "string" ? r["message"] : "";
    return { ok: false, kind: "api_error", code, message };
  }

  // code === 0: data must be present and be an object
  if (typeof r["data"] !== "object" || r["data"] === null) {
    return malformed("code is 0 but 'data' is missing or not an object");
  }
  const d = r["data"] as Record<string, unknown>;

  // Mandatory fields
  const accessToken = d["access_token"];
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return malformed("data.access_token is missing or empty");
  }

  const refreshToken = d["refresh_token"];
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    return malformed("data.refresh_token is missing or empty");
  }

  const openId = d["open_id"];
  if (typeof openId !== "string" || openId.length === 0) {
    return malformed("data.open_id is missing or empty");
  }

  const accessTokenExpiresAt = coerceInt(d["access_token_expire_in"]);
  if (accessTokenExpiresAt === null || accessTokenExpiresAt <= 0) {
    return malformed("data.access_token_expire_in is missing, non-finite, or not > 0");
  }

  const refreshTokenExpiresAt = coerceInt(d["refresh_token_expire_in"]);
  if (refreshTokenExpiresAt === null || refreshTokenExpiresAt <= 0) {
    return malformed("data.refresh_token_expire_in is missing, non-finite, or not > 0");
  }

  // Peripheral fields (null-tolerant)
  const sellerName = coerceString(d["seller_name"]);
  const sellerBaseRegion = coerceString(d["seller_base_region"]);
  const userTypeRaw = coerceInt(d["user_type"]);
  const label = userTypeLabel(userTypeRaw);

  return {
    ok: true,
    token: {
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      openId,
      sellerName,
      sellerBaseRegion,
      userType: userTypeRaw,
      userTypeLabel: label,
    },
  };
}
