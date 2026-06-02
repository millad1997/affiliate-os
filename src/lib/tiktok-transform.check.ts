// src/lib/tiktok-transform.check.ts
// Positive-control fixtures for transformMarketplaceCreator.
// Focus: the no-lives (video-only) coalescing fix — absent live fields must NOT
// null out present video-derived engagement/consistency metrics.
// Run: npx tsx src/lib/tiktok-transform.check.ts
import { transformMarketplaceCreator, type MarketplaceCreatorRaw } from "./tiktok-transform";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); }
  else { console.error(`FAIL  ${name}`); failures++; }
}

// A — video-only creator (no lives). The bug case.
const videoOnly: MarketplaceCreatorRaw = {
  creator_user_id: "c_video_only", username: "videocreator", bio: null, follower_count: 50000,
  gmv: { amount: 8000, currency: "USD" }, gmv_range: null,
  ec_video_count: 20, ec_live_count: null,
  avg_ec_video_like_count: 300, avg_ec_live_like_count: null,
  avg_ec_video_comment_count: 25, avg_ec_live_comment_count: null,
  avg_ec_video_play_count: 10000, avg_ec_live_view_count: null,
};
const a = transformMarketplaceCreator(videoOnly);
check("A: likes survive (video-only)", a.likesLast30d === 6000);
check("A: comments survive (video-only)", a.commentsLast30d === 500);
check("A: views survive (video-only)", a.viewsLast30d === 200000);
check("A: posts survive (video-only)", a.postsLast30d === 20);
check("A: consistency survives (video-only)", a.avgPostsPerWeek12w !== null);
check("A: gmv precise", a.gmvLast30d === 8000 && a.gmvSource === "precise");

// B — video + live present (regression guard for summation).
const both: MarketplaceCreatorRaw = {
  creator_user_id: "c_both", username: "bothcreator", bio: null, follower_count: 100000,
  gmv: { amount: 12000, currency: "USD" }, gmv_range: null,
  ec_video_count: 10, ec_live_count: 5,
  avg_ec_video_like_count: 200, avg_ec_live_like_count: 100,
  avg_ec_video_comment_count: 10, avg_ec_live_comment_count: 20,
  avg_ec_video_play_count: 5000, avg_ec_live_view_count: 8000,
};
const b = transformMarketplaceCreator(both);
check("B: likes = video+live", b.likesLast30d === 2500);
check("B: comments = video+live", b.commentsLast30d === 200);
check("B: views = video+live", b.viewsLast30d === 90000);
check("B: posts = video+live", b.postsLast30d === 15);

// C — no data at all (both video and live absent). Must stay null.
const empty: MarketplaceCreatorRaw = {
  creator_user_id: "c_empty", username: "emptycreator", bio: null, follower_count: null,
  gmv: null, gmv_range: null,
  ec_video_count: null, ec_live_count: null,
  avg_ec_video_like_count: null, avg_ec_live_like_count: null,
  avg_ec_video_comment_count: null, avg_ec_live_comment_count: null,
  avg_ec_video_play_count: null, avg_ec_live_view_count: null,
};
const c = transformMarketplaceCreator(empty);
check("C: likes null (no data)", c.likesLast30d === null);
check("C: comments null (no data)", c.commentsLast30d === null);
check("C: views null (no data)", c.viewsLast30d === null);
check("C: posts null (no data)", c.postsLast30d === null);
check("C: consistency null (no data)", c.avgPostsPerWeek12w === null);
check("C: gmv none", c.gmvSource === "none");

// D — range-only GMV (gmv branch), also video-only.
const rangeOnly: MarketplaceCreatorRaw = {
  creator_user_id: "c_range", username: "rangecreator", bio: null, follower_count: 30000,
  gmv: null, gmv_range: { min: 5000, max: 10000, currency: "USD" },
  ec_video_count: 8, ec_live_count: null,
  avg_ec_video_like_count: 150, avg_ec_live_like_count: null,
  avg_ec_video_comment_count: 12, avg_ec_live_comment_count: null,
  avg_ec_video_play_count: 4000, avg_ec_live_view_count: null,
};
const d = transformMarketplaceCreator(rangeOnly);
check("D: gmv range source", d.gmvSource === "range");
check("D: gmv range values", d.gmvRange !== null && d.gmvRange.min === 5000 && d.gmvRange.max === 10000);
check("D: gmvLast30d null when range-only", d.gmvLast30d === null);
check("D: video metrics survive (range-only)", d.likesLast30d === 1200 && d.postsLast30d === 8);

if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nAll transform checks passed.");
