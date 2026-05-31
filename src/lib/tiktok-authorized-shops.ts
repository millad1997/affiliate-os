// SERVER-ONLY: this module uses tiktok-sign which relies on node:crypto.
// SECURITY: the access token lives only in the x-tts-access-token header; no caller may log url or headers.
import { signRequest } from "./tiktok-sign";
import type { SignedRequest } from "./tiktok-marketplace-request";

const BASE_URL = "https://open-api.tiktokglobalshop.com";

function toQueryString(pairs: Array<[string, string | number]>): string {
  return pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

export function buildGetAuthorizedShopsRequest(
  creds: { appKey: string; appSecret: string },
  accessToken: string,
  opts?: { timestamp?: number }
): SignedRequest {
  const path = "/authorization/202309/shops";
  const timestamp = opts?.timestamp ?? Math.floor(Date.now() / 1000);

  const signParams: Record<string, string | number> = {
    app_key: creds.appKey,
    timestamp,
  };

  const sign = signRequest({
    path,
    queryParams: signParams,
    body: "",
    contentType: "application/json",
    appSecret: creds.appSecret,
  });

  const urlPairs: Array<[string, string | number]> = [
    ["app_key", creds.appKey],
    ["timestamp", timestamp],
    ["sign", sign],
  ];

  return {
    method: "GET",
    url: `${BASE_URL}${path}?${toQueryString(urlPairs)}`,
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": accessToken,
    },
  };
}

export type AuthorizedShop = {
  shopId: string;
  name: string | null;
  region: string | null;
  sellerType: string | null; // raw CROSS_BORDER | LOCAL; not enum-validated
  cipher: string;            // doc field: cipher — threaded into marketplace_creators shop_cipher param
  shopCode: string | null;   // doc field: code (Seller Center code), renamed to avoid clash with envelope code
};

export type AuthorizedShopsResult =
  | { ok: true; shops: AuthorizedShop[] }
  | { ok: false; kind: "api_error"; code: number; message: string }
  | { ok: false; kind: "malformed"; message: string };

export function parseAuthorizedShopsResponse(resp: unknown): AuthorizedShopsResult {
  if (typeof resp !== "object" || resp === null) {
    return { ok: false, kind: "malformed", message: "response is not an object" };
  }
  const r = resp as Record<string, unknown>;
  if (typeof r.code !== "number") {
    return { ok: false, kind: "malformed", message: "code is not a number" };
  }
  if (r.code !== 0) {
    return {
      ok: false,
      kind: "api_error",
      code: r.code,
      message: typeof r.message === "string" ? r.message : "",
    };
  }
  if (typeof r.data !== "object" || r.data === null) {
    return { ok: false, kind: "malformed", message: "data is not an object" };
  }
  const data = r.data as Record<string, unknown>;
  if (!Array.isArray(data.shops)) {
    return { ok: false, kind: "malformed", message: "data.shops is not an array" };
  }

  const shops: AuthorizedShop[] = [];
  for (const raw of data.shops as unknown[]) {
    if (typeof raw !== "object" || raw === null) continue;
    const shop = raw as Record<string, unknown>;
    // Drop shops missing a non-empty id or cipher — unusable downstream
    if (typeof shop.id !== "string" || shop.id === "") continue;
    if (typeof shop.cipher !== "string" || shop.cipher === "") continue;
    shops.push({
      shopId: shop.id,
      name: typeof shop.name === "string" ? shop.name : null,
      region: typeof shop.region === "string" ? shop.region : null,
      sellerType: typeof shop.seller_type === "string" ? shop.seller_type : null,
      cipher: shop.cipher,
      shopCode: typeof shop.code === "string" ? shop.code : null,
    });
  }
  return { ok: true, shops };
}

export function selectShopForRegion(
  shops: AuthorizedShop[],
  region?: string
): AuthorizedShop | null {
  if (shops.length === 0) return null;
  if (region !== undefined) {
    const target = region.toLowerCase();
    return shops.find((s) => (s.region ?? "").toLowerCase() === target) ?? null;
  }
  // Region omitted: return only when unambiguous (exactly one shop)
  return shops.length === 1 ? shops[0] : null;
}
