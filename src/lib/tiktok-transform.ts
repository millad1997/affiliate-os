// TODO: schema asserted from TikTok docs, not yet verified against a live API response. Adjust field names if real responses differ.

export interface MarketplaceCreatorRaw {
  creator_user_id: string;
  username: string;
  bio: string | null;
  follower_count: number | null;
  gmv: { amount: number; currency: string } | null;
  gmv_range: { min: number; max: number; currency: string } | null;
  ec_video_count: number | null;
  ec_live_count: number | null;
  avg_ec_video_like_count: number | null;
  avg_ec_live_like_count: number | null;
  avg_ec_video_comment_count: number | null;
  avg_ec_live_comment_count: number | null;
  avg_ec_video_play_count: number | null;
  avg_ec_live_view_count: number | null;
}

export interface TransformedCreatorMetrics {
  gmvLast30d: number | null;
  totalGmv: number | null;
  avgPostsPerWeek12w: number | null;
  postsLast30d: number | null;
  likesLast30d: number | null;
  commentsLast30d: number | null;
  viewsLast30d: number | null;
  gmvRange: { min: number; max: number } | null;
  gmvSource: "precise" | "range" | "none";
}

function nullableProduct(avg: number | null, count: number | null): number | null {
  if (avg === null || count === null) return null;
  return avg * count;
}

// Coalescing sum for the video+live metric pair. Treats a null side as a 0
// contribution, returning null ONLY when BOTH sides are null (neither a video nor a
// live signal). Prevents a no-lives (video-only) creator's absent live fields from
// nulling out otherwise-valid video metrics. Semantic basis: no livestream activity
// == zero live contribution, not "unknown".
// First-live watch: assumes the live family is absent *together* for no-lives creators,
// not mixed-partial. A live count present without its paired avg (or vice versa) yields
// a null product that is coalesced to 0 here, slightly understating — revisit if real
// responses show mixed-partial live fields.
function coalescingSum(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

export function transformMarketplaceCreator(raw: MarketplaceCreatorRaw): TransformedCreatorMetrics {
  let gmvLast30d: number | null = null;
  let gmvRange: { min: number; max: number } | null = null;
  let gmvSource: "precise" | "range" | "none" = "none";

  if (raw.gmv !== null && Number.isFinite(raw.gmv.amount)) {
    gmvLast30d = raw.gmv.amount;
    gmvSource = "precise";
  } else if (
    raw.gmv_range !== null &&
    Number.isFinite(raw.gmv_range.min) &&
    Number.isFinite(raw.gmv_range.max)
  ) {
    gmvRange = { min: raw.gmv_range.min, max: raw.gmv_range.max };
    gmvSource = "range";
  }

  const videoLikes = nullableProduct(raw.avg_ec_video_like_count, raw.ec_video_count);
  const liveLikes = nullableProduct(raw.avg_ec_live_like_count, raw.ec_live_count);
  const likesLast30d = coalescingSum(videoLikes, liveLikes);

  const videoComments = nullableProduct(raw.avg_ec_video_comment_count, raw.ec_video_count);
  const liveComments = nullableProduct(raw.avg_ec_live_comment_count, raw.ec_live_count);
  const commentsLast30d = coalescingSum(videoComments, liveComments);

  const videoViews = nullableProduct(raw.avg_ec_video_play_count, raw.ec_video_count);
  const liveViews = nullableProduct(raw.avg_ec_live_view_count, raw.ec_live_count);
  const viewsLast30d = coalescingSum(videoViews, liveViews);

  const postsLast30d = coalescingSum(raw.ec_video_count, raw.ec_live_count);

  // First-call proxy: real 12-week accumulation not yet available from this endpoint.
  const avgPostsPerWeek12w = postsLast30d !== null ? postsLast30d / 4.33 : null;

  return {
    gmvLast30d,
    totalGmv: null,
    avgPostsPerWeek12w,
    postsLast30d,
    likesLast30d,
    commentsLast30d,
    viewsLast30d,
    gmvRange,
    gmvSource,
  };
}
