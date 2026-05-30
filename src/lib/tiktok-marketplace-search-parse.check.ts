import {
  parseSearchCreatorsResponse,
  type SearchCreatorsApiResponse,
} from "./tiktok-marketplace-search-parse";
import { buildGetCreatorRequest, type MarketplaceAuth } from "./tiktok-marketplace-request";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const happy: SearchCreatorsApiResponse = {
  code: 0,
  message: "Success",
  request_id: "req_s1",
  data: {
    next_page_token: "b2Zmc2V0PTEw",
    search_key: "k1ChOzI9ej5BHHHEnt",
    creators: [
      {
        username: "mens_wellness_marcus",
        nickname: "Marcus | Men's Health",
        avatar: { url: "https://p16.tiktokcdn.com/marcus.jpg" },
        selection_region: "GB",
        category_ids: ["60001", "60002"],
        avg_ec_live_uv: 1331,
        avg_ec_video_view_count: 112,
        follower_count: 23241,
        gmv: { currency: "USD", amount: "1232.90" },
        creator_open_id: "open_marcus_001",
      },
      {
        username: "wellness_kate",
        nickname: "Kate Wellness",
        selection_region: "US",
        category_ids: ["60001"],
        avg_ec_live_uv: 0,
        avg_ec_video_view_count: 88,
        follower_count: 9100,
        creator_open_id: "open_kate_002",
      },
    ],
  },
};

async function main() {
  {
    const r = parseSearchCreatorsResponse(happy);
    check("1a ok=true", r.ok === true);
    check("1b two candidates", r.ok && r.candidates.length === 2);
    check("1c nextPageToken threaded", r.ok && r.nextPageToken === "b2Zmc2V0PTEw");
    check("1d searchKey threaded", r.ok && r.searchKey === "k1ChOzI9ej5BHHHEnt");
  }
  {
    const r = parseSearchCreatorsResponse(happy);
    const c0 = r.ok ? r.candidates[0] : null;
    check("2a creatorOpenId", c0?.creatorOpenId === "open_marcus_001");
    check("2b username", c0?.username === "mens_wellness_marcus");
    check("2c nickname", c0?.nickname === "Marcus | Men's Health");
    check("2d avatarUrl from avatar.url", c0?.avatarUrl === "https://p16.tiktokcdn.com/marcus.jpg");
    check("2e selectionRegion", c0?.selectionRegion === "GB");
    check("2f followerCount int", c0?.followerCount === 23241);
    check("2g avgEcLiveUv int", c0?.avgEcLiveUv === 1331);
  }
  {
    const r = parseSearchCreatorsResponse(happy);
    const c0 = r.ok ? r.candidates[0] : null;
    check("3a gmv.amount parsed to number", c0?.gmv?.amount === 1232.9);
    check("3b gmv.currency preserved", c0?.gmv?.currency === "USD");
  }
  {
    const r = parseSearchCreatorsResponse(happy);
    const c0 = r.ok ? r.candidates[0] : null;
    check("4a categoryIds length 2", c0?.categoryIds.length === 2);
    check("4b categoryIds[0] is the string '60001'", c0?.categoryIds[0] === "60001" && typeof c0?.categoryIds[0] === "string");
  }
  {
    const r = parseSearchCreatorsResponse(happy);
    const c1 = r.ok ? r.candidates[1] : null;
    check("5a gmv absent -> null", c1?.gmv === null);
    check("5b avatar absent -> avatarUrl null", c1?.avatarUrl === null);
    check("5c avgEcLiveUv 0 preserved (not nulled)", c1?.avgEcLiveUv === 0);
  }
  {
    const r = parseSearchCreatorsResponse({ code: 0, message: "Success", data: { creators: [], next_page_token: "", search_key: "" } });
    check("6a ok=true on empty", r.ok === true);
    check("6b zero candidates", r.ok && r.candidates.length === 0);
  }
  {
    const r = parseSearchCreatorsResponse({ code: 0, message: "Success" });
    check("7a ok=true", r.ok === true);
    check("7b zero candidates", r.ok && r.candidates.length === 0);
    check("7c nextPageToken null", r.ok && r.nextPageToken === null);
  }
  {
    const r = parseSearchCreatorsResponse({ code: 45101004, message: "query quota has been reached (10000 requests per day)" });
    check("8a ok=false", r.ok === false);
    check("8b code preserved", !r.ok && r.code === 45101004);
    check("8c message preserved", !r.ok && r.message.includes("query quota"));
  }
  {
    const r = parseSearchCreatorsResponse({
      code: 0, message: "Success",
      data: { creators: [
        { username: "no_id_creator", category_ids: ["60001"] },
        { username: "has_id", creator_open_id: "open_hasid_009" },
      ] },
    });
    check("9a only valid item kept", r.ok && r.candidates.length === 1);
    check("9b kept the one with an id", r.ok && r.candidates[0]?.creatorOpenId === "open_hasid_009");
  }
  {
    const auth: MarketplaceAuth = { appKey: "test_app_key", appSecret: "test_app_secret", accessToken: "test_access_token", shopCipher: "test_shop_cipher" };
    const r = parseSearchCreatorsResponse(happy);
    const id = r.ok ? r.candidates[0]!.creatorOpenId : "";
    const req = buildGetCreatorRequest({ auth, timestamp: 1700000000, creatorUserId: id });
    check("10a get-creator path carries the discovered open id", req.url.includes("/marketplace_creators/open_marcus_001?"));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) throw new Error(`${fail} control(s) failed`);
}
main();
