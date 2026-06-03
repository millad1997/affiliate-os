import "server-only";

// SECURITY: This server-only module fetches a single TikTok Shop marketplace
// creator detail on behalf of a connected seller. It composes the token
// lifecycle, the server-only credential read, request signing, and the signed
// transport. Like the other tiktok-* modules it NEVER logs, NEVER throws, and
// NEVER echoes any token, secret, shop_cipher, URL, header, or response body —
// every failure path returns a fixed, value-free GetCreatorApiResponse whose
// message is one of the constant strings below (plus, for transport errors, the
// numeric HTTP status only).

import { buildGetCreatorRequest, type MarketplaceAuth } from "./tiktok-marketplace-request";
import { executeSignedRequest, type FetchLike } from "./tiktok-fetch";
import { getValidAccessToken } from "./tiktok-token-lifecycle";
import { getTikTokCredentials } from "./tiktok-credentials";
import type { GetCreatorApiResponse } from "./tiktok-marketplace-parse";
import type { FetchCreatorDetail } from "./score-candidate";

type CreatorData = NonNullable<GetCreatorApiResponse["data"]>;

export type CreatorFetcherDeps = {
  userId: string;
  appKey: string;
  appSecret: string;
  fetchImpl?: FetchLike;
  now?: () => number; // epoch SECONDS
  getValidToken?: typeof getValidAccessToken; // DI seam for tests
  getCredentials?: typeof getTikTokCredentials; // DI seam for tests
};

// Named coercion map. Every non-transport failure path returns one of these
// fixed, value-free responses. There is intentionally no `data` field on an
// error, and no message ever carries a token, secret, shop_cipher, URL, header,
// or response body.
const COERCED = {
  NOT_CONNECTED: { code: -10, message: "not_connected" },
  TOKEN_REFRESH_FAILED: { code: -11, message: "token_refresh_failed" },
  TOKEN_STORE_FAILED: { code: -12, message: "token_store_failed" },
  CREDENTIALS_QUERY: { code: -13, message: "credentials_query_failed" },
  CIPHER_UNRESOLVED: { code: -15, message: "shop_cipher_unresolved" },
} satisfies Record<string, GetCreatorApiResponse>;

// tok.reason (from getValidAccessToken) -> its coerced response.
const TOKEN_REASON_TO_COERCED: Record<
  "not_connected" | "refresh_failed" | "store_failed" | "query_failed",
  GetCreatorApiResponse
> = {
  not_connected: COERCED.NOT_CONNECTED,
  refresh_failed: COERCED.TOKEN_REFRESH_FAILED,
  store_failed: COERCED.TOKEN_STORE_FAILED,
  query_failed: COERCED.CREDENTIALS_QUERY,
};

export function makeFetchCreatorDetail(deps: CreatorFetcherDeps): FetchCreatorDetail {
  const getValidToken = deps.getValidToken ?? getValidAccessToken;
  const getCredentials = deps.getCredentials ?? getTikTokCredentials;
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));

  return async (creatorOpenId: string): Promise<GetCreatorApiResponse> => {
    const ts = now();

    const tok = await getValidToken(deps.userId, {
      appKey: deps.appKey,
      appSecret: deps.appSecret,
      now: ts,
      fetchImpl: deps.fetchImpl,
    });
    if (!tok.ok) {
      return TOKEN_REASON_TO_COERCED[tok.reason];
    }

    const credsRead = await getCredentials(deps.userId);
    if (!credsRead.ok) {
      return credsRead.reason === "not_found" ? COERCED.NOT_CONNECTED : COERCED.CREDENTIALS_QUERY;
    }

    const shopCipher = credsRead.credentials.shopCipher;
    if (shopCipher === null) {
      return COERCED.CIPHER_UNRESOLVED;
    }

    const auth: MarketplaceAuth = {
      appKey: deps.appKey,
      appSecret: deps.appSecret,
      accessToken: tok.accessToken,
      shopCipher,
    };
    const req = buildGetCreatorRequest({ auth, timestamp: ts, creatorUserId: creatorOpenId });

    const res = deps.fetchImpl
      ? await executeSignedRequest<CreatorData>(req, deps.fetchImpl)
      : await executeSignedRequest<CreatorData>(req);

    if (!res.ok) {
      switch (res.kind) {
        case "network":
          return { code: -1, message: "transport_network_error" };
        case "http":
          return { code: -2, message: `transport_http_${res.status}` };
        case "invalid_json":
          return { code: -3, message: `transport_invalid_json_${res.status}` };
      }
    }

    // Real business envelopes pass through UNCHANGED — a non-zero envelope code
    // (e.g. "creator not found") is a legitimate API result, not coerced here.
    return {
      code: res.envelope.code,
      message: res.envelope.message,
      request_id: res.envelope.request_id,
      data: res.envelope.data,
    };
  };
}
