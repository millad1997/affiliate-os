// src/lib/brand-config-input-parse.ts
// Parses + validates the structured brand-config fields out of a raw request body
// into a snake_case object ready to insert into the `brands` table.
// The existing name/category/freeform validation is NOT this module's concern.
// Pure module: no server-only, no DB.

import { DEFAULT_GATES } from "./brand-config";

export type ParsedBrandConfigFields = {
  target_category_ids: string[];
  target_regions: string[];
  min_followers: number | null;
  gate_region: boolean;
  gate_followers: boolean;
  gate_category: boolean;
  max_invites: number;
  commission_rate: number;
  min_gmv_floor: number | null;
  tiktok_product_ids: string[];
  seller_contact_email: string | null;
  has_free_sample: boolean;
  is_sample_approval_exempt: boolean;
  collaboration_duration_days: number;
};

export type ParseBrandConfigResult =
  | { ok: true; fields: ParsedBrandConfigFields }
  | { ok: false; error: string };

function parseStringList(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => String(v).trim()).filter((v) => v.length > 0);
  }
  if (typeof value === "string") {
    return value.split(",").map((v) => v.trim()).filter((v) => v.length > 0);
  }
  return [];
}

export function parseBrandConfigFields(body: Record<string, unknown>): ParseBrandConfigResult {
  const target_category_ids = parseStringList(body.target_category_ids);
  const target_regions = parseStringList(body.target_regions);

  // min_followers: absent/null/"" => null; else finite integer >= 0
  let min_followers: number | null;
  const rawMinFollowers = body.min_followers;
  if (rawMinFollowers === undefined || rawMinFollowers === null || rawMinFollowers === "") {
    min_followers = null;
  } else {
    const n = Number(rawMinFollowers);
    if (!isFinite(n) || !Number.isInteger(n) || n < 0) {
      return { ok: false, error: "min_followers must be a non-negative integer" };
    }
    min_followers = n;
  }

  // gates: only real booleans override the default; absent/non-boolean falls back to DEFAULT_GATES
  const rawGateRegion = body.gate_region;
  const gate_region = typeof rawGateRegion === "boolean" ? rawGateRegion : DEFAULT_GATES.region;

  const rawGateFollowers = body.gate_followers;
  const gate_followers = typeof rawGateFollowers === "boolean" ? rawGateFollowers : DEFAULT_GATES.followers;

  const rawGateCategory = body.gate_category;
  const gate_category = typeof rawGateCategory === "boolean" ? rawGateCategory : DEFAULT_GATES.category;

  // max_invites: absent/null/"" => 50; else finite integer >= 0
  let max_invites: number;
  const rawMaxInvites = body.max_invites;
  if (rawMaxInvites === undefined || rawMaxInvites === null || rawMaxInvites === "") {
    max_invites = 50;
  } else {
    const n = Number(rawMaxInvites);
    if (!isFinite(n) || !Number.isInteger(n) || n < 0) {
      return { ok: false, error: "max_invites must be a non-negative integer" };
    }
    max_invites = n;
  }

  // commission_rate: absent/null/"" => 10; else finite >= 0 (decimals allowed)
  let commission_rate: number;
  const rawCommissionRate = body.commission_rate;
  if (rawCommissionRate === undefined || rawCommissionRate === null || rawCommissionRate === "") {
    commission_rate = 10;
  } else {
    const n = Number(rawCommissionRate);
    if (!isFinite(n) || n < 0) {
      return { ok: false, error: "commission_rate must be a non-negative number" };
    }
    commission_rate = n;
  }

  // min_gmv_floor: absent/null/"" => null; else finite >= 0
  let min_gmv_floor: number | null;
  const rawMinGmvFloor = body.min_gmv_floor;
  if (rawMinGmvFloor === undefined || rawMinGmvFloor === null || rawMinGmvFloor === "") {
    min_gmv_floor = null;
  } else {
    const n = Number(rawMinGmvFloor);
    if (!isFinite(n) || n < 0) {
      return { ok: false, error: "min_gmv_floor must be a non-negative number" };
    }
    min_gmv_floor = n;
  }

  const tiktok_product_ids = parseStringList(body.tiktok_product_ids);

  let seller_contact_email: string | null;
  const rawSellerContactEmail = body.seller_contact_email;
  if (rawSellerContactEmail === undefined || rawSellerContactEmail === null || rawSellerContactEmail === "") {
    seller_contact_email = null;
  } else if (typeof rawSellerContactEmail !== "string") {
    return { ok: false, error: "seller_contact_email must be a string" };
  } else {
    const trimmed = rawSellerContactEmail.trim();
    if (trimmed === "") {
      seller_contact_email = null;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, error: "seller_contact_email must be a valid email address" };
    } else {
      seller_contact_email = trimmed;
    }
  }

  const rawHasFreeSample = body.has_free_sample;
  const has_free_sample = typeof rawHasFreeSample === "boolean" ? rawHasFreeSample : false;

  const rawIsSampleApprovalExempt = body.is_sample_approval_exempt;
  const is_sample_approval_exempt = typeof rawIsSampleApprovalExempt === "boolean" ? rawIsSampleApprovalExempt : false;

  let collaboration_duration_days: number;
  const rawCollaborationDurationDays = body.collaboration_duration_days;
  if (rawCollaborationDurationDays === undefined || rawCollaborationDurationDays === null || rawCollaborationDurationDays === "") {
    collaboration_duration_days = 30;
  } else {
    const n = Number(rawCollaborationDurationDays);
    if (!isFinite(n) || !Number.isInteger(n) || n < 1) {
      return { ok: false, error: "collaboration_duration_days must be a positive integer" };
    }
    collaboration_duration_days = n;
  }

  return {
    ok: true,
    fields: {
      target_category_ids,
      target_regions,
      min_followers,
      gate_region,
      gate_followers,
      gate_category,
      max_invites,
      commission_rate,
      min_gmv_floor,
      tiktok_product_ids,
      seller_contact_email,
      has_free_sample,
      is_sample_approval_exempt,
      collaboration_duration_days,
    },
  };
}
