// src/lib/score-creator.check.ts
// Positive-control fixtures for scoreCreatorFromResponse — the assembled scoring
// pipeline (parse -> transform -> composite). Proves the seams connect: a parse
// failure short-circuits, and a clean envelope flows end to end into a composite,
// including the video-only path the a26e413 fix protects.
// Run: npx tsx src/lib/score-creator.check.ts
import { scoreCreatorFromResponse } from "./score-creator";
import type { GetCreatorApiResponse } from "./tiktok-marketplace-parse";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) { console.log(`PASS  ${name}`); }
  else { console.error(`FAIL  ${name}`); failures++; }
}

// 1 — parse failure (non-zero code) short-circuits at the parse stage.
const apiError: GetCreatorApiResponse = { code: 12345, message: "creator not found" };
const r1 = scoreCreatorFromResponse({ response: apiError, creatorUserId: "c1", fitSubScore: 50 });
check("1: not ok", r1.ok === false);
if (!r1.ok) {
  check("1: stage parse", r1.stage === "parse");
  check("1: code passthrough", r1.code === 12345);
  check("1: message passthrough", r1.message === "creator not found");
}

// 2 — code 0 but data.creator missing also fails at parse.
const emptyData: GetCreatorApiResponse = { code: 0, message: "ok", data: {} };
const r2 = scoreCreatorFromResponse({ response: emptyData, creatorUserId: "c2", fitSubScore: 50 });
check("2: not ok", r2.ok === false);
if (!r2.ok) {
  check("2: stage parse", r2.stage === "parse");
  check("2: missing-creator message", r2.message === "code 0 but data.creator missing");
}

// 3 — happy path, VIDEO-ONLY creator (live fields absent). Full chain, exact end-to-end.
//     metrics: gmv 5000 precise; likes 300*20=6000; comments 50*20=1000;
//     views 5000*20=100000; posts 20 (live coalesces to 0). composite: perf 55, composite 57.
const videoOnly: GetCreatorApiResponse = {
  code: 0,
  message: "ok",
  data: {
    creator: {
      username: "videocreator",
      bio_description: "fitness content",
      follower_count: 50000,
      gmv: { currency: "USD", amount: "5000" },
      ec_video_count: 20,
      avg_ec_video_like_count: 300,
      avg_ec_video_comment_count: 50,
      avg_ec_video_play_count: 5000,
    },
  },
};
const r3 = scoreCreatorFromResponse({ response: videoOnly, creatorUserId: "c3", fitSubScore: 60 });
check("3: ok", r3.ok === true);
if (r3.ok) {
  check("3: gmv precise 5000", r3.metrics.gmvLast30d === 5000 && r3.metrics.gmvSource === "precise");
  check("3: likes carried (video-only)", r3.metrics.likesLast30d === 6000);
  check("3: comments carried", r3.metrics.commentsLast30d === 1000);
  check("3: views carried", r3.metrics.viewsLast30d === 100000);
  check("3: posts carried (video-only)", r3.metrics.postsLast30d === 20);
  check("3: totalGmv null", r3.metrics.totalGmv === null);
  check("3: basis composite", r3.score.scoreBasis === "composite");
  check("3: perf 55", r3.score.performanceSubScore === 55);
  check("3: composite 57", r3.score.composite === 57);
}

// 4 — happy path, VIDEO+LIVE creator with RANGE gmv. Exercises live summation and the
//     range branch through the seam. metrics: likes 2000+500=2500; posts 15; mid 10000.
//     composite: perf 61, composite 53 (range penalty -4).
const videoAndLive: GetCreatorApiResponse = {
  code: 0,
  message: "ok",
  data: {
    creator: {
      username: "hybridcreator",
      bio_description: "wellness",
      follower_count: 100000,
      gmv_range: { currency: "USD", minimum_amount: "8000", maximum_amount: "12000" },
      ec_video_count: 10,
      ec_live_count: 5,
      avg_ec_video_like_count: 200,
      avg_ec_live_like_count: 100,
      avg_ec_video_comment_count: 10,
      avg_ec_live_comment_count: 20,
      avg_ec_video_play_count: 5000,
      avg_ec_live_view_count: 8000,
    },
  },
};
const r4 = scoreCreatorFromResponse({ response: videoAndLive, creatorUserId: "c4", fitSubScore: 50 });
check("4: ok", r4.ok === true);
if (r4.ok) {
  check("4: gmv range", r4.metrics.gmvSource === "range" && r4.metrics.gmvRange?.min === 8000 && r4.metrics.gmvRange?.max === 12000);
  check("4: likes video+live", r4.metrics.likesLast30d === 2500);
  check("4: posts video+live", r4.metrics.postsLast30d === 15);
  check("4: basis composite_range", r4.score.scoreBasis === "composite_range");
  check("4: perf 61", r4.score.performanceSubScore === 61);
  check("4: composite 53", r4.score.composite === 53);
}

if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nAll score-creator pipeline checks passed.");
