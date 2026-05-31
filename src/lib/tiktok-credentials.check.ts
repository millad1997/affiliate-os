// Positive-control script for the tiktok-credentials module.
//
// Realistic-but-synthetic data only — never real secrets. Exercises the full
// store -> read round-trip, proves RLS denies the anon client, and tears the
// test row back down so the script is idempotent across runs.
//
// HOW TO RUN (do not omit --conditions=react-server): importing
// ./tiktok-credentials pulls in `server-only`, whose default export THROWS at
// import time. The react-server export condition resolves it to a no-op, which
// is what lets a server module load under the runner:
//
//   npx tsx --conditions=react-server --env-file=.env.local src/lib/tiktok-credentials.check.ts
//
// --conditions=react-server makes the `server-only` guard a no-op so this server
// module can load under the runner; --env-file supplies NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, and NEXT_PUBLIC_SUPABASE_ANON_KEY; run via npx tsx
// because native node type-stripping won't resolve the extensionless imports.

import { createClient } from "@supabase/supabase-js";
import {
  storeTikTokCredentials,
  getTikTokCredentials,
} from "./tiktok-credentials";
import { getSupabaseServerClient } from "./supabase-server";
import type { TikTokTokenSet } from "./tiktok-auth-token";

// A real existing auth user, so the user_id foreign key on tiktok_credentials
// is satisfied by the insert.
const TEST_USER_ID = "ad993993-46de-49c6-b87f-36cdf1c0cc26";

let anyFailure = false;
function fail(msg: string): void {
  anyFailure = true;
  console.log(msg);
}

async function main(): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);

  // Synthetic token set — clearly fake values, no real secrets.
  const token: TikTokTokenSet = {
    accessToken: "test_access_token_abc",
    accessTokenExpiresAt: nowSec + 86400, // +1 day
    refreshToken: "test_refresh_token_xyz",
    refreshTokenExpiresAt: nowSec + 31536000, // +365 days
    openId: "test_open_id_marcus",
    sellerName: "Vireo Health Co",
    sellerBaseRegion: "US",
    userType: 0,
    userTypeLabel: "seller",
  };

  // ── PART 1: store -> read round-trip ────────────────────────────────────────
  {
    const stored = await storeTikTokCredentials(TEST_USER_ID, token);
    if (!stored.ok) {
      fail(`PART 1 FAIL: store returned ok=false (reason=${stored.reason})`);
    } else {
      const got = await getTikTokCredentials(TEST_USER_ID);
      if (!got.ok) {
        fail(`PART 1 FAIL: read returned ok=false (reason=${got.reason})`);
      } else {
        const c = got.credentials;
        const problems: string[] = [];

        if (c.accessToken !== token.accessToken) problems.push("accessToken mismatch");
        if (c.accessTokenExpiresAt !== token.accessTokenExpiresAt) problems.push("accessTokenExpiresAt mismatch");
        if (c.refreshToken !== token.refreshToken) problems.push("refreshToken mismatch");
        if (c.refreshTokenExpiresAt !== token.refreshTokenExpiresAt) problems.push("refreshTokenExpiresAt mismatch");
        if (c.openId !== token.openId) problems.push("openId mismatch");
        if (c.sellerName !== token.sellerName) problems.push("sellerName mismatch");
        if (c.sellerBaseRegion !== token.sellerBaseRegion) problems.push("sellerBaseRegion mismatch");
        if (c.userType !== token.userType) problems.push("userType mismatch");

        // Prove the bigint expiry columns come back as JS numbers, not strings.
        if (typeof c.accessTokenExpiresAt !== "number") {
          problems.push(`accessTokenExpiresAt is ${typeof c.accessTokenExpiresAt}, expected number`);
        }
        if (typeof c.refreshTokenExpiresAt !== "number") {
          problems.push(`refreshTokenExpiresAt is ${typeof c.refreshTokenExpiresAt}, expected number`);
        }

        if (problems.length > 0) {
          fail(`PART 1 FAIL: ${problems.join("; ")}`);
        } else {
          console.log("PART 1 PASS");
        }
      }
    }
  }

  // ── PART 2: RLS lockdown (the security proof) ───────────────────────────────
  {
    // Positive control: confirm the row genuinely exists via the service-role
    // client before asking whether the anon client can see it.
    const confirm = await getTikTokCredentials(TEST_USER_ID);
    if (!confirm.ok) {
      fail("PART 2 INVALID — row not present");
      // The premise of the security proof is broken, so stop here.
      return;
    }

    // A SEPARATE anon client, built directly from the public anon key. This is
    // the client a browser would use; RLS must hide the row from it.
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await anon
      .from("tiktok_credentials")
      .select("user_id")
      .eq("user_id", TEST_USER_ID)
      .maybeSingle();

    // We just proved the row exists via service-role; the anon client seeing
    // NOTHING (data === null) can only mean RLS denied it.
    if (data === null) {
      console.log("PART 2 PASS — anon client correctly denied");
    } else {
      fail("PART 2 FAIL — anon client could read credentials");
    }
  }

  // ── PART 3: teardown ────────────────────────────────────────────────────────
  {
    const supabase = getSupabaseServerClient();
    const { error: deleteError } = await supabase
      .from("tiktok_credentials")
      .delete()
      .eq("user_id", TEST_USER_ID);

    const after = await getTikTokCredentials(TEST_USER_ID);
    const goneNow = !after.ok && after.reason === "not_found";

    if (!deleteError && goneNow) {
      console.log("TEARDOWN OK");
    } else {
      fail("TEARDOWN FAILED");
    }
  }
}

main()
  .then(() => {
    if (anyFailure) {
      // Exit loudly so a failed control can't be mistaken for success.
      process.exit(1);
    }
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`UNEXPECTED ERROR — ${message}`);
    process.exit(1);
  });
