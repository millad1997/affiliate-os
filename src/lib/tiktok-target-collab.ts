// Schema source: documented 202508 Create Target Collaboration endpoint (doc-built, not yet
// live-verified). end_time is a STRING of epoch seconds per docs. Commission is hundredths of
// a percent (3587 = 35.87%), documented range [100, 8000]. Query-level params (app_key, sign,
// timestamp, shop_cipher) are the signed-transport layer's responsibility, not this module's.

export interface TargetCollabProductInput {
  productId: string;
  targetCommissionRatePercent: number;
}

export interface CreateTargetCollabArgs {
  name: string;
  message: string | null;
  endTimeEpochSeconds: number;
  products: TargetCollabProductInput[];
  creatorOpenIds: string[];
  sellerContactEmail: string;
  freeSampleRule: { hasFreeSample: boolean; isSampleApprovalExempt: boolean };
}

export type BuildCreateTargetCollabResult =
  | {
      ok: true;
      method: "POST";
      path: "/affiliate_seller/202508/target_collaborations";
      body: Record<string, unknown>;
    }
  | {
      ok: false;
      reason:
        | "empty_name"
        | "invalid_end_time"
        | "no_products"
        | "too_many_products"
        | "invalid_commission_rate"
        | "no_creators"
        | "too_many_creators"
        | "empty_creator_id"
        | "empty_product_id"
        | "empty_contact_email";
    };

export function buildCreateTargetCollabRequest(
  args: CreateTargetCollabArgs,
): BuildCreateTargetCollabResult {
  const trimmedName = args.name.trim();
  if (trimmedName === "") {
    return { ok: false, reason: "empty_name" };
  }

  if (
    !Number.isInteger(args.endTimeEpochSeconds) ||
    args.endTimeEpochSeconds <= 0
  ) {
    return { ok: false, reason: "invalid_end_time" };
  }

  if (args.products.length === 0) {
    return { ok: false, reason: "no_products" };
  }
  if (args.products.length > 100) {
    return { ok: false, reason: "too_many_products" };
  }

  const mappedProducts: { id: string; target_commission_rate: number }[] = [];
  for (const p of args.products) {
    if (p.productId.trim() === "") {
      return { ok: false, reason: "empty_product_id" };
    }
    const rate = Math.round(p.targetCommissionRatePercent * 100);
    if (rate < 100 || rate > 8000) {
      return { ok: false, reason: "invalid_commission_rate" };
    }
    mappedProducts.push({ id: p.productId, target_commission_rate: rate });
  }

  if (args.creatorOpenIds.length === 0) {
    return { ok: false, reason: "no_creators" };
  }
  if (args.creatorOpenIds.length > 50) {
    return { ok: false, reason: "too_many_creators" };
  }
  for (const id of args.creatorOpenIds) {
    if (id.trim() === "") {
      return { ok: false, reason: "empty_creator_id" };
    }
  }

  const trimmedEmail = args.sellerContactEmail.trim();
  if (trimmedEmail === "") {
    return { ok: false, reason: "empty_contact_email" };
  }

  const body: Record<string, unknown> = {
    name: trimmedName,
    ...(args.message !== null && args.message.trim() !== "" ? { message: args.message } : {}),
    end_time: String(args.endTimeEpochSeconds),
    products: mappedProducts,
    creator_user_open_ids: args.creatorOpenIds,
    seller_contact_info: { email: trimmedEmail },
    free_sample_rule: {
      has_free_sample: args.freeSampleRule.hasFreeSample,
      is_sample_approval_exempt: args.freeSampleRule.isSampleApprovalExempt,
    },
  };

  return {
    ok: true,
    method: "POST",
    path: "/affiliate_seller/202508/target_collaborations",
    body,
  };
}

export interface CreateTargetCollabApiResponse {
  code: number;
  message: string;
  request_id?: string;
  data?: {
    target_collaboration?: { id?: string };
    target_collaboration_conflicts?: {
      creator_open_id?: string;
      creator_user_id?: string;
      product_id?: string;
    }[];
  };
}

export type ParseCreateTargetCollabResult =
  | { ok: true; collaborationId: string }
  | { ok: false; errorCode: string };

const KNOWN_ERROR_CODES: Record<number, string> = {
  16024004: "cross_test_account",
  16024006: "official_creator",
  16024008: "product_not_owned",
  16024016: "creator_shop_linked",
  16024019: "insufficient_quota",
  16024020: "excluded_creator",
  16024021: "follower_limit",
  16024022: "duplicate_creator_product",
  50001702: "unavailable_creator_or_product",
  50001703: "sensitive_words",
  36009003: "tiktok_internal_error",
};

export function parseCreateTargetCollabResponse(
  resp: CreateTargetCollabApiResponse,
): ParseCreateTargetCollabResult {
  if (resp.code !== 0) {
    const errorCode = KNOWN_ERROR_CODES[resp.code] ?? `tiktok_${resp.code}`;
    return { ok: false, errorCode };
  }

  const conflicts = resp.data?.target_collaboration_conflicts;
  if (conflicts !== undefined && conflicts.length > 0) {
    return { ok: false, errorCode: "collaboration_conflict" };
  }

  const id = resp.data?.target_collaboration?.id;
  if (typeof id === "string" && id !== "") {
    return { ok: true, collaborationId: id };
  }

  return { ok: false, errorCode: "malformed_success_response" };
}
