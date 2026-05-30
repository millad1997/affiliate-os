// src/lib/tiktok-marketplace-search-parse.ts
// Normalization boundary for the marketplace_creators/search (202508) response.
// Produces a LIGHT discovery candidate list (NOT composite input — the composite consumes the
// richer get-creator detail). Maps the literal API item into MarketplaceCandidate.
//
// Doc-reconciled (search 202508). Corrections vs the older §8.7 capture:
//   - identifier is `creator_open_id` (string), NOT `creator_user_id`; it threads into the
//     get-creator {creator_user_id} path segment (same id, different name).
//   - gmv is { currency, amount }, both STRINGS (NOT `value`); amount is a quoted decimal.
//   - category_ids are STRINGS ("60001") — do NOT coerce to number.
//   - the money set (gmv/live_gmv/video_gmv/gmv_range/units_sold_range) is OMITTED (absent),
//     not null, without precise-data permission -> absent maps to null here (conservative).
// Deliberately NOT parsed (no consumer yet; expand when one exists): live_gmv, video_gmv,
//   gmv_range, units_sold_range, top_follower_demographics.

interface ApiMoney { currency?: string; amount?: string }
interface ApiSearchCreator {
  username?: string;
  nickname?: string;
  avatar?: { url?: string };
  selection_region?: string;
  category_ids?: unknown;
  avg_ec_live_uv?: number;
  avg_ec_video_view_count?: number;
  follower_count?: number;
  gmv?: ApiMoney;
  creator_open_id?: string;
  [k: string]: unknown; // tolerate documented fields we don't consume
}

export interface SearchCreatorsApiResponse {
  code: number;
  message: string;
  request_id?: string;
  data?: {
    next_page_token?: string;
    search_key?: string;
    creators?: ApiSearchCreator[];
  };
}

export interface MarketplaceCandidate {
  creatorOpenId: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  selectionRegion: string | null;
  categoryIds: string[];
  avgEcLiveUv: number | null;
  avgEcVideoViewCount: number | null;
  followerCount: number | null;
  gmv: { amount: number; currency: string } | null;
}

export type ParseSearchCreatorsResult =
  | { ok: true; candidates: MarketplaceCandidate[]; nextPageToken: string | null; searchKey: string | null }
  | { ok: false; code: number; message: string };

function parseFiniteFloat(s: string | undefined): number | null {
  if (typeof s !== "string") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
function numOrNull(n: number | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
function strOrNull(s: string | undefined): string | null {
  return typeof s === "string" ? s : null;
}
function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function parseSearchCreatorsResponse(
  resp: SearchCreatorsApiResponse,
): ParseSearchCreatorsResult {
  if (resp.code !== 0) {
    return { ok: false, code: resp.code, message: resp.message };
  }

  const data = resp.data;
  const rawCreators = data?.creators ?? [];

  const candidates: MarketplaceCandidate[] = [];
  for (const c of rawCreators) {
    const id = c.creator_open_id;
    if (typeof id !== "string" || id.length === 0) {
      // No usable identifier -> cannot feed the get-creator detail call -> skip this item.
      continue;
    }
    const amount = parseFiniteFloat(c.gmv?.amount);
    const gmv = amount === null ? null : { amount, currency: c.gmv?.currency ?? "" };
    candidates.push({
      creatorOpenId: id,
      username: c.username ?? "",
      nickname: strOrNull(c.nickname),
      avatarUrl: strOrNull(c.avatar?.url),
      selectionRegion: strOrNull(c.selection_region),
      categoryIds: stringArray(c.category_ids),
      avgEcLiveUv: numOrNull(c.avg_ec_live_uv),
      avgEcVideoViewCount: numOrNull(c.avg_ec_video_view_count),
      followerCount: numOrNull(c.follower_count),
      gmv,
    });
  }

  return {
    ok: true,
    candidates,
    nextPageToken: strOrNull(data?.next_page_token),
    searchKey: strOrNull(data?.search_key),
  };
}
