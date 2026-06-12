// Pure readiness assessment for outreach config. Owns the BrandOutreachConfig type so both
// the server-only read module and the pure send route-core can depend on it. Deliberately
// MINIMAL: it flags only fields whose absence makes a send unattemptable. Deeper validation
// (commission range, product-id format, creator limits) is the pure TikTok adapter layer's
// first-failure-wins job — never duplicated here.

export type BrandOutreachConfig = {
  tiktokProductIds: string[];
  sellerContactEmail: string | null;
  hasFreeSample: boolean;
  isSampleApprovalExempt: boolean;
  collaborationDurationDays: number;
  commissionRatePercent: number;
};

export type OutreachMissingField = "tiktok_product_ids" | "seller_contact_email";

export type OutreachReadiness =
  | { ready: true }
  | { ready: false; missing: OutreachMissingField[] };

export function assessOutreachReadiness(config: BrandOutreachConfig): OutreachReadiness {
  const missing: OutreachMissingField[] = [];
  if (config.tiktokProductIds.length === 0) missing.push("tiktok_product_ids");
  if (config.sellerContactEmail === null) missing.push("seller_contact_email");
  return missing.length === 0 ? { ready: true } : { ready: false, missing };
}
