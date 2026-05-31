import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time CSRF state verifier for the TikTok OAuth callback.
 *
 * Compares the state value stored in the cookie against the state value
 * returned on the callback query string. The comparison runs in constant
 * time (relative to content) to avoid leaking the secret via timing.
 *
 * No DB, no network, no secrets, no logging.
 */
export function verifyState(
  cookieState: string | undefined | null,
  queryState: string | undefined | null,
): boolean {
  // Reject missing/empty values up front. An empty string is never a valid state.
  if (!cookieState || !queryState) {
    return false;
  }

  const a = Buffer.from(cookieState, "utf8");
  const b = Buffer.from(queryState, "utf8");

  // timingSafeEqual throws when byte lengths differ, so guard first.
  // A length mismatch already means they are not equal.
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
