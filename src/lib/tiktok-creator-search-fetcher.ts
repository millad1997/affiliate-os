import "server-only";

// SECURITY: This server-only module runs a TikTok Shop marketplace creator
// SEARCH on behalf of a connected seller. It composes the token lifecycle, the
// server-only credential read, request signing, and the signed transport, then
// DELEGATES envelope interpretation to parseSearchCreatorsResponse. Like the
// other tiktok-* modules it NEVER logs, NEVER throws, and NEVER echoes any
// token, secret, shop_cipher, URL, header, or response body — every failure
// path returns a fixed, value-free ParseSearchCreatorsResult whose message is
// one of the constant strings below (plus, for transport errors, the numeric
// HTTP status only). The access token stays header-only via the request builder.

import { buildSearchCreatorsRequest, type MarketplaceAuth, type MarketplaceSearchBody } from "./tiktok-marketplace-request";
import { executeSignedRequest, type FetchLike } from "./tiktok-fetch";
import { getValidAccessToken } from "./tiktok-token-lifecycle";
import { getTikTokCredentials } from "./tiktok-credentials";
import { parseSearchCreatorsResponse, type SearchCreatorsApiResponse, type ParseSearchCreatorsResult } from "./tiktok-marketplace-search-parse";

type SearchData = NonNullable<SearchCreatorsApiResponse["data"]>;
type CoercedFailure = Extract<ParseSearchCreatorsResult, { ok: false }>;

export type CreatorSearchFetcherDeps = {
  userId: string;
  appKey: string;
  appSecret: string;
  fetchImpl?: FetchLike;
  now?: () => number; // epoch SECONDS
  getValidToken?: typeof getValidAccessToken; // DI seam for tests
  getCredentials?: typeof getTikTokCredentials; // DI seam for tests
};

export type SearchCreatorsArgs = { pageSize: 12 | 20; pageToken?: string; body?: MarketplaceSearchBody };

export type FetchCreatorSearch = (args: SearchCreatorsArgs) => Promise<ParseSearchCreatorsResult>;

// Named coercion map. Every non-transport failure path returns one of these
// fixed, value-free failures. No message ever carries a token, secret,
// shop_cipher, URL, header, or response body. These mirror tiktok-creator-fetcher.ts
// exactly — a future slice may extract a shared coercion module.
const COERCED = {
  NOT_CONNECTED: { ok: false, code: -10, message: "not_connected" },
  TOKEN_REFRESH_FAILED: { ok: false, code: -11, message: "token_refresh_failed" },
  TOKEN_STORE_FAILED: { ok: false, code: -12, message: "token_store_failed" },
  CREDENTIALS_QUERY: { ok: false, code: -13, message: "credentials_query_failed" },
  CIPHER_UNRESOLVED: { ok: false, code: -15, message: "shop_cipher_unresolved" },
} satisfies Record<string, CoercedFailure>;

// tok.reason (from getValidAccessToken) -> its coerced failure.
const TOKEN_REASON_TO_COERCED: Record<
  "not_connected" | "refresh_failed" | "store_failed" | "query_failed",
  CoercedFailure
> = {
  not_connected: COERCED.NOT_CONNECTED,
  refresh_failed: COERCED.TOKEN_REFRESH_FAILED,
  store_failed: COERCED.TOKEN_STORE_FAILED,
  query_failed: COERCED.CREDENTIALS_QUERY,
};

export function makeFetchCreatorSearch(deps: CreatorSearchFetcherDeps): FetchCreatorSearch {
  const getValidToken = deps.getValidToken ?? getValidAccessToken;
  const getCredentials = deps.getCredentials ?? getTikTokCredentials;
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));

  return async (args: SearchCreatorsArgs): Promise<ParseSearchCreatorsResult> => {
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
    const req = buildSearchCreatorsRequest({
      auth,
      timestamp: ts,
      pageSize: args.pageSize,
      pageToken: args.pageToken,
      body: args.body,
    });

    const res = deps.fetchImpl
      ? await executeSignedRequest<SearchData>(req, deps.fetchImpl)
      : await executeSignedRequest<SearchData>(req);

    if (!res.ok) {
      switch (res.kind) {
        case "network":
          return { ok: false, code: -1, message: "transport_network_error" };
        case "http":
          return { ok: false, code: -2, message: `transport_http_${res.status}` };
        case "invalid_json":
          return { ok: false, code: -3, message: `transport_invalid_json_${res.status}` };
      }
    }

    // Reconstruct the envelope and DELEGATE to the parser. The parser owns
    // code !== 0, so business + quota errors pass through UNCHANGED — they are
    // legitimate API results, not coerced here.
    const apiResp: SearchCreatorsApiResponse = {
      code: res.envelope.code,
      message: res.envelope.message,
      request_id: res.envelope.request_id,
      data: res.envelope.data,
    };
    return parseSearchCreatorsResponse(apiResp);
  };
}
