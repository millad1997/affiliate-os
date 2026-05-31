import { timingSafeEqual } from "node:crypto";
import {
  buildTokenExchangeRequest,
  parseTokenResponse,
  type TikTokTokenSet,
} from "./tiktok-auth-token";
import { executeSignedRequest, type FetchLike } from "./tiktok-fetch";

/**
 * Constant-time CSRF state verifier for the TikTok OAuth callback.
 *
 * Compares the state value stored in the cookie against the state value
 * returned on the callback query string. The comparison runs in constant
 * time (relative to content) to avoid leaking the secret via timing.
 *
 * No DB, no network, no secrets, no logging.
 */
export function verifyState(
  cookieState: string | undefined | null,
  queryState: string | undefined | null,
): boolean {
  // Reject missing/empty values up front. An empty string is never a valid state.
  if (!cookieState || !queryState) {
    return false;
  }

  const a = Buffer.from(cookieState, "utf8");
  const b = Buffer.from(queryState, "utf8");

  // timingSafeEqual throws when byte lengths differ, so guard first.
  // A length mismatch already means they are not equal.
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

export type ExchangeResult =
  | { ok: true; token: TikTokTokenSet }
  | { ok: false; kind: "transport"; detail: string }
  | { ok: false; kind: "api_error"; code: number; message: string }
  | { ok: false; kind: "malformed"; message: string };

/**
 * Exchanges a one-time OAuth auth code for a TikTok credential set by composing
 * the existing builder -> transport -> parser pipeline.
 *
 * SECURITY: the returned `detail` string for transport failures is intentionally
 * coarse — only kind + status/network message, never request URLs or response
 * bodies, which can carry app_secret / tokens. Nothing here is ever logged.
 */
export async function exchangeCodeForCredentials(params: {
  code: string;
  appKey: string;
  appSecret: string;
  fetchImpl?: FetchLike;
}): Promise<ExchangeResult> {
  const req = buildTokenExchangeRequest(params.code, {
    appKey: params.appKey,
    appSecret: params.appSecret,
  });

  // undefined fetchImpl -> executeSignedRequest falls back to its own default fetch.
  const result = await executeSignedRequest(req, params.fetchImpl);

  if (result.ok === false) {
    let detail: string;
    switch (result.kind) {
      case "network":
        detail = `network: ${result.message}`;
        break;
      case "http":
        detail = `http ${result.status}`;
        break;
      case "invalid_json":
        detail = `invalid_json ${result.status}`;
        break;
    }
    return { ok: false, kind: "transport", detail };
  }

  // Transport succeeded but does NOT inspect envelope.code; the parser is what
  // distinguishes api_error vs success vs malformed.
  const parsed = parseTokenResponse(result.envelope);
  if (parsed.ok) {
    return { ok: true, token: parsed.token };
  }
  if (parsed.kind === "api_error") {
    return { ok: false, kind: "api_error", code: parsed.code, message: parsed.message };
  }
  return { ok: false, kind: "malformed", message: parsed.message };
}
