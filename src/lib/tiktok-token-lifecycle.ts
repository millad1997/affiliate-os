import "server-only";

// SECURITY: This module reads and writes long-lived TikTok Shop OAuth secrets
// (access/refresh tokens) through the server-only credential layer. It is
// server-only (see the import above) and must NEVER be imported into client/
// browser code. It NEVER logs, throws, or echoes any token or secret — every
// failure path returns a fixed, value-free reason code only.

import { getTikTokCredentials, storeTikTokCredentials } from "./tiktok-credentials";
import { refreshCredentials } from "./tiktok-refresh";
import type { FetchLike } from "./tiktok-fetch";

const DEFAULT_REFRESH_BUFFER_SECONDS = 24 * 60 * 60; // 86400

export type ValidAccessTokenResult =
  | { ok: true; accessToken: string; refreshed: boolean }
  | { ok: false; reason: "not_connected" | "refresh_failed" | "store_failed" | "query_failed" };

export async function getValidAccessToken(
  userId: string,
  opts: {
    appKey: string;
    appSecret: string;
    now?: number; // epoch SECONDS
    bufferSeconds?: number;
    fetchImpl?: FetchLike;
    getCredentials?: typeof getTikTokCredentials;
    storeCredentials?: typeof storeTikTokCredentials;
  },
): Promise<ValidAccessTokenResult> {
  // All expiry math is in epoch SECONDS. now defaults to seconds — never compare
  // against raw Date.now() (milliseconds), which would treat every token as fresh.
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const bufferSeconds = opts.bufferSeconds ?? DEFAULT_REFRESH_BUFFER_SECONDS;
  const getCredentials = opts.getCredentials ?? getTikTokCredentials;
  const storeCredentials = opts.storeCredentials ?? storeTikTokCredentials;
  const fetchImpl = opts.fetchImpl;

  const read = await getCredentials(userId);
  if (!read.ok) {
    // "not_found" means the user simply never connected; everything else
    // (including "query_failed") is an opaque read failure.
    const reason = read.reason === "not_found" ? "not_connected" : "query_failed";
    return { ok: false, reason };
  }

  const creds = read.credentials;

  // Strictly greater than the buffer boundary = still valid. Equal-to-boundary
  // or earlier => refresh.
  if (creds.accessTokenExpiresAt > now + bufferSeconds) {
    return { ok: true, accessToken: creds.accessToken, refreshed: false };
  }

  const refreshed = await refreshCredentials({
    refreshToken: creds.refreshToken,
    appKey: opts.appKey,
    appSecret: opts.appSecret,
    fetchImpl,
  });
  if (!refreshed.ok) {
    // Collapse api_error / transport / malformed into one value-free reason; the
    // refresh result's detail/message is intentionally not surfaced.
    return { ok: false, reason: "refresh_failed" };
  }

  // FAIL-CLOSED: the refresh may have rotated the refresh token. If we cannot
  // persist the new set, returning the access token risks a hard lockout (the old
  // refresh token is now invalid and the new one is unsaved). Stop instead.
  const stored = await storeCredentials(userId, refreshed.token);
  if (!stored.ok) {
    return { ok: false, reason: "store_failed" };
  }

  return { ok: true, accessToken: refreshed.token.accessToken, refreshed: true };
}
