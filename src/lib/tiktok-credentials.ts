import "server-only";

// SECURITY: This module persists and reads long-lived TikTok Shop OAuth secrets
// (access/refresh tokens). It is server-only (see the import above) and uses the
// service-role Supabase client, which bypasses RLS. It must NEVER be imported into
// client/browser code. It also NEVER logs, throws, or emits any token, secret, or
// full row — error paths return a generic, value-free reason code only.

import { getSupabaseServerClient } from "./supabase-server";
import type { TikTokTokenSet } from "./tiktok-auth-token";

const TABLE = "tiktok_credentials";

// ── Result types ────────────────────────────────────────────────────────────

export type StoreCredentialsResult =
  | { ok: true }
  | { ok: false; reason: string };

export type GetCredentialsResult =
  | { ok: true; credentials: StoredTikTokCredentials }
  | { ok: false; reason: string };

// camelCase view of a persisted row, returned by getTikTokCredentials.
// shop_cipher / shop_id / shop_region are written by a later authorization step,
// so they may be null here until that step has run.
export type StoredTikTokCredentials = {
  userId: string;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  openId: string;
  sellerName: string | null;
  sellerBaseRegion: string | null;
  userType: number | null;
  shopCipher: string | null;
  shopId: string | null;
  shopRegion: string | null;
  updatedAt: string;
};

// ── Explicit DB row shape (snake_case columns) ────────────────────────────────

// Full row as it exists in the tiktok_credentials table. Typed explicitly so the
// untyped service-role client never leaks `any` into this module.
type TikTokCredentialsRow = {
  user_id: string;
  access_token: string;
  access_token_expires_at: number;
  refresh_token: string;
  refresh_token_expires_at: number;
  open_id: string;
  seller_name: string | null;
  seller_base_region: string | null;
  user_type: number | null;
  shop_cipher: string | null;
  shop_id: string | null;
  shop_region: string | null;
  updated_at: string;
};

// The subset of columns this module writes on store/upsert. CRITICAL: shop_cipher,
// shop_id, and shop_region are intentionally absent — they are written by a later
// step and must survive a re-authorization. Omitting them from the on-conflict
// upsert leaves any existing values untouched.
type TikTokCredentialsUpsert = {
  user_id: string;
  access_token: string;
  access_token_expires_at: number;
  refresh_token: string;
  refresh_token_expires_at: number;
  open_id: string;
  seller_name: string | null;
  seller_base_region: string | null;
  user_type: number | null;
  updated_at: string;
};

const SELECT_COLUMNS =
  "user_id, access_token, access_token_expires_at, refresh_token, " +
  "refresh_token_expires_at, open_id, seller_name, seller_base_region, " +
  "user_type, shop_cipher, shop_id, shop_region, updated_at";

// ── Public API ────────────────────────────────────────────────────────────────

// Upsert one row keyed on user_id. Token/secret values are never logged or
// echoed; on failure we return a fixed, value-free reason.
export async function storeTikTokCredentials(
  userId: string,
  parsed: TikTokTokenSet,
): Promise<StoreCredentialsResult> {
  const payload: TikTokCredentialsUpsert = {
    user_id: userId,
    access_token: parsed.accessToken,
    access_token_expires_at: parsed.accessTokenExpiresAt,
    refresh_token: parsed.refreshToken,
    refresh_token_expires_at: parsed.refreshTokenExpiresAt,
    open_id: parsed.openId,
    seller_name: parsed.sellerName,
    seller_base_region: parsed.sellerBaseRegion,
    user_type: parsed.userType,
    updated_at: new Date().toISOString(),
  };

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      return { ok: false, reason: "store_failed" };
    }
    return { ok: true };
  } catch {
    // Swallow any thrown/rejected error without surfacing its contents — the
    // message could conceivably echo request data. Return a generic reason.
    return { ok: false, reason: "store_failed" };
  }
}

// Read the single row for a user_id. Returns 'not_found' when no row exists, and
// a fixed, value-free reason on any error.
export async function getTikTokCredentials(
  userId: string,
): Promise<GetCredentialsResult> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle<TikTokCredentialsRow>();

    if (error) {
      return { ok: false, reason: "query_failed" };
    }
    if (!data) {
      return { ok: false, reason: "not_found" };
    }

    const credentials: StoredTikTokCredentials = {
      userId: data.user_id,
      accessToken: data.access_token,
      accessTokenExpiresAt: data.access_token_expires_at,
      refreshToken: data.refresh_token,
      refreshTokenExpiresAt: data.refresh_token_expires_at,
      openId: data.open_id,
      sellerName: data.seller_name,
      sellerBaseRegion: data.seller_base_region,
      userType: data.user_type,
      shopCipher: data.shop_cipher,
      shopId: data.shop_id,
      shopRegion: data.shop_region,
      updatedAt: data.updated_at,
    };
    return { ok: true, credentials };
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}
