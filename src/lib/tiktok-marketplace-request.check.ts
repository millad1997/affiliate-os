import {
  buildSearchCreatorsRequest,
  buildAdvancedFiltersRequest,
  buildGetCreatorRequest,
} from "./tiktok-marketplace-request";

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const pass = g === w;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { console.log(`  got:  ${g}`); console.log(`  want: ${w}`); }
}
function ok(name: string, cond: boolean) {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
}

const auth = {
  appKey: "test_app_key",
  appSecret: "test_app_secret",
  accessToken: "test_access_token",
  shopCipher: "ROW_test_cipher",
};
const ts = 1700000000;

const r1 = buildSearchCreatorsRequest({ auth, timestamp: ts, pageSize: 20, body: { keyword: "wellness" } });
eq("T1 search method", r1.method, "POST");
eq("T1 search url", r1.url, "https://open-api.tiktokglobalshop.com/affiliate_seller/202508/marketplace_creators/search?app_key=test_app_key&timestamp=1700000000&shop_cipher=ROW_test_cipher&page_size=20&sign=5e3ab609d268b0381e751bf743491d7ab6eab69efa2648348a121283792cbc92");
eq("T1 search body", r1.body, '{"keyword":"wellness"}');
eq("T1 header content-type", r1.headers["content-type"], "application/json");
eq("T1 header token", r1.headers["x-tts-access-token"], "test_access_token");

const r2 = buildAdvancedFiltersRequest({ auth, timestamp: ts });
eq("T2 filter method", r2.method, "POST");
eq("T2 filter url", r2.url, "https://open-api.tiktokglobalshop.com/affiliate_seller/202601/marketplace_creators/search/filter?app_key=test_app_key&timestamp=1700000000&shop_cipher=ROW_test_cipher&sign=6c8ed398c6a04c62441a5fe1426b0b4ec78b7102ac6a849c85f2608fa5d28b65");
eq("T2 filter body", r2.body, "{}");

const r3 = buildGetCreatorRequest({ auth, timestamp: ts, creatorUserId: "7501234567890123456" });
eq("T3 creator method", r3.method, "GET");
eq("T3 creator url", r3.url, "https://open-api.tiktokglobalshop.com/affiliate_seller/202508/marketplace_creators/7501234567890123456?app_key=test_app_key&timestamp=1700000000&shop_cipher=ROW_test_cipher&sign=b786961112b626589ea6a8dcc7f9e53a8f4feb93b399d29aa72af890f69387c0");
eq("T3 creator body undefined", r3.body, undefined);
eq("T3 creator token header", r3.headers["x-tts-access-token"], "test_access_token");
ok("T3 creator has NO content-type", r3.headers["content-type"] === undefined);

const r4 = buildSearchCreatorsRequest({ auth, timestamp: ts, pageSize: 12, pageToken: "abc=def" });
eq("T4 search+pageToken url (raw signed, %3D encoded in url)", r4.url, "https://open-api.tiktokglobalshop.com/affiliate_seller/202508/marketplace_creators/search?app_key=test_app_key&timestamp=1700000000&shop_cipher=ROW_test_cipher&page_size=12&page_token=abc%3Ddef&sign=f3200cab53844852313692450601328a2dd1589cd2e9e2d432bed641ba3b40fe");
eq("T4 search+pageToken body default", r4.body, "{}");

ok("T5 accessToken NOT in search url", !r1.url.includes(auth.accessToken));
ok("T5 accessToken NOT in filter url", !r2.url.includes(auth.accessToken));
ok("T5 accessToken NOT in creator url", !r3.url.includes(auth.accessToken));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
