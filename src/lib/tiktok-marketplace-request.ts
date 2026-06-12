// NOTE: request paths/params are asserted from TikTok Shop API Reference docs and not yet verified against a live API response.
import { signRequest } from "./tiktok-sign";

const BASE_URL = "https://open-api.tiktokglobalshop.com";

export interface MarketplaceAuth {
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopCipher: string;
}

export interface SignedRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export type AgeRange =
  | "AGE_RANGE_18_24"
  | "AGE_RANGE_25_34"
  | "AGE_RANGE_35_44"
  | "AGE_RANGE_45_54"
  | "AGE_RANGE_55_AND_ABOVE";

export type GmvRange =
  | "GMV_RANGE_0_100"
  | "GMV_RANGE_100_1000"
  | "GMV_RANGE_1000_10000"
  | "GMV_RANGE_10000_AND_ABOVE";

export interface MarketplaceSearchBody {
  search_key?: string;
  keyword?: string;
  follower_demographics?: { age_ranges?: AgeRange[] };
  count_range?: { count_ge?: number; count_le?: number };
  gender_distribution?: { gender?: "MALE" | "FEMALE"; percentage_ge?: number };
  gmv_ranges?: GmvRange[];
}

function toQueryString(pairs: Array<[string, string | number]>): string {
  return pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

export function buildSearchCreatorsRequest(args: {
  auth: MarketplaceAuth;
  timestamp: number;
  pageSize: 12 | 20;
  pageToken?: string;
  body?: MarketplaceSearchBody;
}): SignedRequest {
  const { auth, timestamp, pageSize, pageToken, body } = args;
  const path = "/affiliate_seller/202508/marketplace_creators/search";
  const bodyString = JSON.stringify(body ?? {});

  const signParams: Record<string, string | number> = {
    app_key: auth.appKey,
    timestamp,
    shop_cipher: auth.shopCipher,
    page_size: pageSize,
  };
  if (pageToken && pageToken.length > 0) {
    signParams.page_token = pageToken;
  }

  const sign = signRequest({
    path,
    queryParams: signParams,
    body: bodyString,
    contentType: "application/json",
    appSecret: auth.appSecret,
  });

  const urlPairs: Array<[string, string | number]> = [
    ["app_key", auth.appKey],
    ["timestamp", timestamp],
    ["shop_cipher", auth.shopCipher],
    ["page_size", pageSize],
  ];
  if (pageToken && pageToken.length > 0) {
    urlPairs.push(["page_token", pageToken]);
  }
  urlPairs.push(["sign", sign]);

  return {
    method: "POST",
    url: `${BASE_URL}${path}?${toQueryString(urlPairs)}`,
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": auth.accessToken,
    },
    body: bodyString,
  };
}

export function buildAdvancedFiltersRequest(args: {
  auth: MarketplaceAuth;
  timestamp: number;
}): SignedRequest {
  const { auth, timestamp } = args;
  const path = "/affiliate_seller/202601/marketplace_creators/search/filter";
  const bodyString = "{}";

  const signParams: Record<string, string | number> = {
    app_key: auth.appKey,
    timestamp,
    shop_cipher: auth.shopCipher,
  };

  const sign = signRequest({
    path,
    queryParams: signParams,
    body: bodyString,
    contentType: "application/json",
    appSecret: auth.appSecret,
  });

  const urlPairs: Array<[string, string | number]> = [
    ["app_key", auth.appKey],
    ["timestamp", timestamp],
    ["shop_cipher", auth.shopCipher],
    ["sign", sign],
  ];

  return {
    method: "POST",
    url: `${BASE_URL}${path}?${toQueryString(urlPairs)}`,
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": auth.accessToken,
    },
    body: bodyString,
  };
}

export function buildGetCreatorRequest(args: {
  auth: MarketplaceAuth;
  timestamp: number;
  creatorUserId: string;
}): SignedRequest {
  const { auth, timestamp, creatorUserId } = args;
  const path = `/affiliate_seller/202508/marketplace_creators/${creatorUserId}`;

  const signParams: Record<string, string | number> = {
    app_key: auth.appKey,
    timestamp,
    shop_cipher: auth.shopCipher,
  };

  const sign = signRequest({
    path,
    queryParams: signParams,
    body: "",
    contentType: "application/json",
    appSecret: auth.appSecret,
  });

  const urlPairs: Array<[string, string | number]> = [
    ["app_key", auth.appKey],
    ["timestamp", timestamp],
    ["shop_cipher", auth.shopCipher],
    ["sign", sign],
  ];

  return {
    method: "GET",
    url: `${BASE_URL}${path}?${toQueryString(urlPairs)}`,
    headers: {
      "x-tts-access-token": auth.accessToken,
    },
  };
}

// Signs and addresses a Create Target Collaboration request. Takes the {path, body} produced by
// buildCreateTargetCollabRequest (tiktok-target-collab.ts) — the pure builder owns the payload
// shape; this function owns query-level auth params and signing, mirroring
// buildSearchCreatorsRequest exactly. The body is stringified ONCE here; the signature covers
// those exact bytes and the same string is sent unmodified (never re-serialize).
export function buildTargetCollabSignedRequest(args: {
  auth: MarketplaceAuth;
  timestamp: number;
  path: string;
  body: Record<string, unknown>;
}): SignedRequest {
  const { auth, timestamp, path, body } = args;
  const bodyString = JSON.stringify(body);

  const signParams: Record<string, string | number> = {
    app_key: auth.appKey,
    timestamp,
    shop_cipher: auth.shopCipher,
  };

  const sign = signRequest({
    path,
    queryParams: signParams,
    body: bodyString,
    contentType: "application/json",
    appSecret: auth.appSecret,
  });

  const urlPairs: Array<[string, string | number]> = [
    ["app_key", auth.appKey],
    ["timestamp", timestamp],
    ["shop_cipher", auth.shopCipher],
    ["sign", sign],
  ];

  return {
    method: "POST",
    url: `${BASE_URL}${path}?${toQueryString(urlPairs)}`,
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": auth.accessToken,
    },
    body: bodyString,
  };
}
