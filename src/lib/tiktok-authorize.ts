import { randomBytes } from "node:crypto";

const HOST_US = "https://services.us.tiktokshop.com/open/authorize";
const HOST_INTL = "https://services.tiktokshop.com/open/authorize";

// A cryptographically random, URL-safe CSRF state token — 32 bytes of entropy
// encoded as base64url (no padding, no +, no /).
export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

// Builds the seller authorization URL. region is case-insensitive and defaults
// to "US". Query string is built manually (not URLSearchParams) to guarantee
// exact param order and avoid space-to-plus encoding.
export function buildAuthorizeUrl(params: {
  serviceId: string;
  state: string;
  region?: string;
}): string {
  const { serviceId, state, region = "US" } = params;
  const host =
    region.toUpperCase() === "US" ? HOST_US : HOST_INTL;
  return (
    `${host}` +
    `?service_id=${encodeURIComponent(serviceId)}` +
    `&state=${encodeURIComponent(state.trim())}`
  );
}
