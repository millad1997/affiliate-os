import "server-only";

// SECURITY: This server-only module is the LIVE TikTok implementation of the OutreachSendAdapter
// contract — it creates one target collaboration per creator. It composes the token lifecycle,
// the server-only credential read, the pure request builder, the signed transport, and the
// response parser. Like the other tiktok-* modules it NEVER logs, NEVER throws, and NEVER echoes
// any token, secret, shop_cipher, URL, header, or response body — every failure path returns a
// fixed, value-free errorCode in the adapter result union (plus, for transport errors, the
// numeric HTTP status only).
//
// NOT YET WIRED: the send route keeps the stub adapter until TikTok scope activation. This
// module is built and vector-verified ahead of that day; activation is a one-line seam swap.

import type { OutreachSendAdapter, OutreachSendResult } from "./outreach-send-adapter";
import type { BrandOutreachConfig } from "./outreach-readiness";
import {
  buildCreateTargetCollabRequest,
  parseCreateTargetCollabResponse,
  type CreateTargetCollabApiResponse,
} from "./tiktok-target-collab";
import {
  buildTargetCollabSignedRequest,
  type MarketplaceAuth,
} from "./tiktok-marketplace-request";
import { executeSignedRequest, type FetchLike } from "./tiktok-fetch";
import { getValidAccessToken } from "./tiktok-token-lifecycle";
import { getTikTokCredentials } from "./tiktok-credentials";

type CollabData = NonNullable<CreateTargetCollabApiResponse["data"]>;

export type TikTokSendAdapterDeps = {
  userId: string;
  appKey: string;
  appSecret: string;
  // Product-visible: the collaboration name is `${brandName} — ${creatorOpenId}`.
  brandName: string;
  outreachConfig: BrandOutreachConfig;
  fetchImpl?: FetchLike;
  now?: () => number; // epoch SECONDS
  getValidToken?: typeof getValidAccessToken; // DI seam for tests
  getCredentials?: typeof getTikTokCredentials; // DI seam for tests
};

const SECONDS_PER_DAY = 86_400;

// Token-lifecycle reasons mapped to the system-wide errorCode vocabulary (same names the
// creator fetcher uses), since these codes are persisted to the sends audit table.
const TOKEN_REASON_TO_ERROR: Record<
  "not_connected" | "refresh_failed" | "store_failed" | "query_failed",
  string
> = {
  not_connected: "not_connected",
  refresh_failed: "token_refresh_failed",
  store_failed: "token_store_failed",
  query_failed: "credentials_query_failed",
};

export function makeTikTokSendAdapter(deps: TikTokSendAdapterDeps): OutreachSendAdapter {
  const getValidToken = deps.getValidToken ?? getValidAccessToken;
  const getCredentials = deps.getCredentials ?? getTikTokCredentials;
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));

  return async (input): Promise<OutreachSendResult> => {
    const ts = now();

    const tok = await getValidToken(deps.userId, {
      appKey: deps.appKey,
      appSecret: deps.appSecret,
      now: ts,
      fetchImpl: deps.fetchImpl,
    });
    if (!tok.ok) {
      return { ok: false, errorCode: TOKEN_REASON_TO_ERROR[tok.reason] };
    }

    const credsRead = await getCredentials(deps.userId);
    if (!credsRead.ok) {
      return {
        ok: false,
        errorCode: credsRead.reason === "not_found" ? "not_connected" : "credentials_query_failed",
      };
    }
    const shopCipher = credsRead.credentials.shopCipher;
    if (shopCipher === null) {
      return { ok: false, errorCode: "shop_cipher_unresolved" };
    }

    // Defense in depth: the send route's preflight should make these unreachable, but this
    // adapter never trusts its caller — refuse locally before any request is built.
    const config = deps.outreachConfig;
    if (config.sellerContactEmail === null) {
      return { ok: false, errorCode: "missing_contact_email" };
    }
    if (config.tiktokProductIds.length === 0) {
      return { ok: false, errorCode: "missing_product_ids" };
    }

    const built = buildCreateTargetCollabRequest({
      name: `${deps.brandName} — ${input.creatorOpenId}`,
      message: input.message,
      endTimeEpochSeconds: ts + config.collaborationDurationDays * SECONDS_PER_DAY,
      products: config.tiktokProductIds.map((id) => ({
        productId: id,
        targetCommissionRatePercent: config.commissionRatePercent,
      })),
      creatorOpenIds: [input.creatorOpenId],
      sellerContactEmail: config.sellerContactEmail,
      freeSampleRule: {
        hasFreeSample: config.hasFreeSample,
        isSampleApprovalExempt: config.isSampleApprovalExempt,
      },
    });
    if (!built.ok) {
      return { ok: false, errorCode: `build_${built.reason}` };
    }

    const auth: MarketplaceAuth = {
      appKey: deps.appKey,
      appSecret: deps.appSecret,
      accessToken: tok.accessToken,
      shopCipher,
    };
    const signed = buildTargetCollabSignedRequest({
      auth,
      timestamp: ts,
      path: built.path,
      body: built.body,
    });

    const res = deps.fetchImpl
      ? await executeSignedRequest<CollabData>(signed, deps.fetchImpl)
      : await executeSignedRequest<CollabData>(signed);

    if (!res.ok) {
      switch (res.kind) {
        case "network":
          return { ok: false, errorCode: "transport_network_error" };
        case "http":
          return { ok: false, errorCode: `transport_http_${res.status}` };
        case "invalid_json":
          return { ok: false, errorCode: `transport_invalid_json_${res.status}` };
      }
    }

    const parsed = parseCreateTargetCollabResponse({
      code: res.envelope.code,
      message: res.envelope.message,
      request_id: res.envelope.request_id,
      data: res.envelope.data,
    });
    if (!parsed.ok) {
      return { ok: false, errorCode: parsed.errorCode };
    }
    return { ok: true, providerRef: parsed.collaborationId };
  };
}
