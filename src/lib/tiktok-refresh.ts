/**
 * SECURITY: the `detail` string returned on transport failures is intentionally
 * coarse — only kind + HTTP status or network message, never the request URL or
 * response body, which can carry app_secret / tokens. Nothing in this module is
 * ever logged.
 */
import {
  buildRefreshTokenRequest,
  parseTokenResponse,
  type TikTokTokenSet,
} from "./tiktok-auth-token";
import { executeSignedRequest, type FetchLike } from "./tiktok-fetch";

export type RefreshResult =
  | { ok: true; token: TikTokTokenSet }
  | { ok: false; kind: "transport"; detail: string }
  | { ok: false; kind: "api_error"; code: number; message: string }
  | { ok: false; kind: "malformed"; message: string };

/**
 * Exchanges a refresh token for a new TikTok credential set by composing the
 * existing builder -> transport -> parser pipeline.
 */
export async function refreshCredentials(params: {
  refreshToken: string;
  appKey: string;
  appSecret: string;
  fetchImpl?: FetchLike;
}): Promise<RefreshResult> {
  const req = buildRefreshTokenRequest(params.refreshToken, {
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
