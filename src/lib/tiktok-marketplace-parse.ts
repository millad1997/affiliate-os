// response schema asserted from TikTok Shop API Reference docs, not yet verified vs a live response.
// Watch (1): "no-lives" creators may return absent / null / 0 for the avg_ec_live_* family —
//   this parser faithfully maps absent->null; whether live wants 0 instead is a real-data decision for later.
// Watch (2): pps is a 90-day field; everything else is 30-day; pps is not consumed here.

import type { MarketplaceCreatorRaw } from "./tiktok-transform";

// Literal API shapes — field names + STRING types exactly as documented.
interface ApiMoney { currency?: string; amount?: string }
interface ApiGmvRange { currency?: string; minimum_amount?: string; maximum_amount?: string; formatted_range?: string }
interface ApiCreator {
  username?: string;
  bio_description?: string;
  follower_count?: number;
  gmv?: ApiMoney;
  gmv_range?: ApiGmvRange;
  ec_video_count?: number;
  ec_live_count?: number;
  avg_ec_video_like_count?: number;
  avg_ec_live_like_count?: number;
  avg_ec_video_comment_count?: number;
  avg_ec_live_comment_count?: number;
  avg_ec_video_play_count?: number;
  avg_ec_live_view_count?: number;
  [k: string]: unknown; // tolerate extra documented fields we don't consume
}
export interface GetCreatorApiResponse {
  code: number;
  message: string;
  request_id?: string;
  data?: { creator?: ApiCreator };
}
export type ParseGetCreatorResult =
  | { ok: true; creator: MarketplaceCreatorRaw }
  | { ok: false; code: number; message: string };

function parseFiniteFloat(s: string | undefined): number | null {
  if (typeof s !== "string") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function numOrNull(n: number | undefined): number | null {
  return (typeof n === "number" && Number.isFinite(n)) ? n : null;
}

function strOrNull(s: string | undefined): string | null {
  return typeof s === "string" ? s : null;
}

export function parseGetCreatorResponse(
  resp: GetCreatorApiResponse,
  creatorUserId: string,
): ParseGetCreatorResult {
  if (resp.code !== 0) {
    return { ok: false, code: resp.code, message: resp.message };
  }

  const c = resp.data?.creator;
  if (!c) {
    return { ok: false, code: resp.code, message: "code 0 but data.creator missing" };
  }

  const a = parseFiniteFloat(c.gmv?.amount);
  const gmv = a === null ? null : { amount: a, currency: c.gmv?.currency ?? "" };

  const mn = parseFiniteFloat(c.gmv_range?.minimum_amount);
  const mx = parseFiniteFloat(c.gmv_range?.maximum_amount);
  const gmv_range = (mn === null || mx === null) ? null : { min: mn, max: mx, currency: c.gmv_range?.currency ?? "" };

  return {
    ok: true,
    creator: {
      creator_user_id: creatorUserId,
      username: c.username ?? "",
      bio: strOrNull(c.bio_description),
      follower_count: numOrNull(c.follower_count),
      gmv,
      gmv_range,
      ec_video_count: numOrNull(c.ec_video_count),
      ec_live_count: numOrNull(c.ec_live_count),
      avg_ec_video_like_count: numOrNull(c.avg_ec_video_like_count),
      avg_ec_live_like_count: numOrNull(c.avg_ec_live_like_count),
      avg_ec_video_comment_count: numOrNull(c.avg_ec_video_comment_count),
      avg_ec_live_comment_count: numOrNull(c.avg_ec_live_comment_count),
      avg_ec_video_play_count: numOrNull(c.avg_ec_video_play_count),
      avg_ec_live_view_count: numOrNull(c.avg_ec_live_view_count),
    },
  };
}
