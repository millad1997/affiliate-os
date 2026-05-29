import { parseGetCreatorResponse, type GetCreatorApiResponse } from "./tiktok-marketplace-parse";
import { transformMarketplaceCreator } from "./tiktok-transform";

let failures = 0;
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stable(o[k])).join(",") + "}";
}
function eq(name: string, got: unknown, want: unknown) {
  const pass = stable(got) === stable(want);
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { console.log(`  got:  ${stable(got)}`); console.log(`  want: ${stable(want)}`); }
}

const fx1: GetCreatorApiResponse = { code: 0, message: "Success", request_id: "req_p1", data: { creator: {
  username: "mens_wellness_marcus", nickname: "Marcus", bio_description: "Supplements & recovery for active men",
  follower_count: 184000, category_ids: ["c"], gmv: { currency: "USD", amount: "48250.75" },
  ec_video_count: 22, ec_live_count: 4, avg_ec_video_like_count: 1850, avg_ec_live_like_count: 320,
  avg_ec_video_comment_count: 95, avg_ec_live_comment_count: 40, avg_ec_video_play_count: 42000, avg_ec_live_view_count: 5600,
  ec_video_engagement_rate: "3000", pps: "8500" } } };
const r1 = parseGetCreatorResponse(fx1, "7502288133456789012");
eq("P1 ok", r1.ok, true);
if (r1.ok) {
  eq("P1 creator", r1.creator, { creator_user_id: "7502288133456789012", username: "mens_wellness_marcus",
    bio: "Supplements & recovery for active men", follower_count: 184000, gmv: { amount: 48250.75, currency: "USD" },
    gmv_range: null, ec_video_count: 22, ec_live_count: 4, avg_ec_video_like_count: 1850, avg_ec_live_like_count: 320,
    avg_ec_video_comment_count: 95, avg_ec_live_comment_count: 40, avg_ec_video_play_count: 42000, avg_ec_live_view_count: 5600 });
  eq("C1 parse->transform", transformMarketplaceCreator(r1.creator), { gmvLast30d: 48250.75, totalGmv: null,
    avgPostsPerWeek12w: 6.0046189376443415, postsLast30d: 26, likesLast30d: 41980, commentsLast30d: 2250,
    viewsLast30d: 946400, gmvRange: null, gmvSource: "precise" });
}

const fx2: GetCreatorApiResponse = { code: 0, message: "Success", data: { creator: {
  username: "clean_beauty_bre", bio_description: "Clean beauty hauls", follower_count: 92000,
  gmv_range: { currency: "USD", minimum_amount: "10000", maximum_amount: "50000", formatted_range: "$10K-$50K" },
  ec_video_count: 15, ec_live_count: 0, avg_ec_video_like_count: 1200, avg_ec_live_like_count: 0,
  avg_ec_video_comment_count: 60, avg_ec_live_comment_count: 0, avg_ec_video_play_count: 30000, avg_ec_live_view_count: 0 } } };
const r2 = parseGetCreatorResponse(fx2, "7503001112223334445");
if (r2.ok) eq("P2 creator (range)", r2.creator, { creator_user_id: "7503001112223334445", username: "clean_beauty_bre",
  bio: "Clean beauty hauls", follower_count: 92000, gmv: null, gmv_range: { min: 10000, max: 50000, currency: "USD" },
  ec_video_count: 15, ec_live_count: 0, avg_ec_video_like_count: 1200, avg_ec_live_like_count: 0,
  avg_ec_video_comment_count: 60, avg_ec_live_comment_count: 0, avg_ec_video_play_count: 30000, avg_ec_live_view_count: 0 });
else { failures++; console.log("FAIL P2 unexpectedly not ok"); }

const fx3: GetCreatorApiResponse = { code: 0, message: "Success", data: { creator: {
  username: "sleep_supps_sana", follower_count: 47000, ec_video_count: 8,
  avg_ec_video_like_count: 400, avg_ec_video_comment_count: 25, avg_ec_video_play_count: 12000 } } };
const r3 = parseGetCreatorResponse(fx3, "7504556667778889990");
if (r3.ok) eq("P3 creator (absent->null)", r3.creator, { creator_user_id: "7504556667778889990", username: "sleep_supps_sana",
  bio: null, follower_count: 47000, gmv: null, gmv_range: null, ec_video_count: 8, ec_live_count: null,
  avg_ec_video_like_count: 400, avg_ec_live_like_count: null, avg_ec_video_comment_count: 25, avg_ec_live_comment_count: null,
  avg_ec_video_play_count: 12000, avg_ec_live_view_count: null });
else { failures++; console.log("FAIL P3 unexpectedly not ok"); }

const fx4: GetCreatorApiResponse = { code: 16032012, message: "only affiliate partner cipher can access this api", request_id: "req_p4" };
eq("P4 error envelope", parseGetCreatorResponse(fx4, "7505000000000000000"),
  { ok: false, code: 16032012, message: "only affiliate partner cipher can access this api" });

const fx5: GetCreatorApiResponse = { code: 0, message: "Success", data: { creator: {
  username: "edge_case_eddie", follower_count: 10000, gmv: { currency: "USD", amount: "N/A" },
  ec_video_count: 5, ec_live_count: 0, avg_ec_video_like_count: 100, avg_ec_live_like_count: 0,
  avg_ec_video_comment_count: 10, avg_ec_live_comment_count: 0, avg_ec_video_play_count: 2000, avg_ec_live_view_count: 0 } } };
const r5 = parseGetCreatorResponse(fx5, "7506000000000000000");
eq("P5 non-numeric gmv -> null", r5.ok ? r5.creator.gmv : "NOT_OK", null);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
