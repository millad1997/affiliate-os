import {
  buildSearchCreatorsRequest,
  buildAdvancedFiltersRequest,
  buildGetCreatorRequest,
  buildTargetCollabSignedRequest,
} from "./tiktok-marketplace-request";
import { buildCreateTargetCollabRequest } from "./tiktok-target-collab";
import { signRequest } from "./tiktok-sign";

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

// T6: target-collab signed request — structural + sign-parity (the sign algorithm itself is
// locked by tiktok-sign.check.ts; what matters here is that the bytes signed === bytes sent).
const collabPath = "/affiliate_seller/202508/target_collaborations";
const collabBody = {
  name: "Vireo Health Co — ttopen_focus_fiona",
  message: "Hi! We'd love to collaborate.",
  end_time: "1701814400",
  products: [{ id: "1729382476051234567", target_commission_rate: 1500 }],
  creator_user_open_ids: ["ttopen_focus_fiona"],
  seller_contact_info: { email: "partnerships@vireohealth.com" },
  free_sample_rule: { has_free_sample: true, is_sample_approval_exempt: false },
};
const r5 = buildTargetCollabSignedRequest({ auth, timestamp: ts, path: collabPath, body: collabBody });
const expectedBody5 = JSON.stringify(collabBody);
const expectedSign5 = signRequest({
  path: collabPath,
  queryParams: { app_key: auth.appKey, timestamp: ts, shop_cipher: auth.shopCipher },
  body: expectedBody5,
  contentType: "application/json",
  appSecret: auth.appSecret,
});
eq("T6 collab method", r5.method, "POST");
eq("T6 collab url", r5.url, `https://open-api.tiktokglobalshop.com${collabPath}?app_key=test_app_key&timestamp=1700000000&shop_cipher=ROW_test_cipher&sign=${expectedSign5}`);
eq("T6 collab body exact bytes", r5.body, expectedBody5);
eq("T6 collab content-type", r5.headers["content-type"], "application/json");
eq("T6 collab token header", r5.headers["x-tts-access-token"], "test_access_token");
ok("T6 accessToken NOT in collab url", !r5.url.includes(auth.accessToken));

// T7: composition with the PURE builder — the exact payload buildCreateTargetCollabRequest
// produces is what gets signed and sent, hundredths conversion and field names included.
const built = buildCreateTargetCollabRequest({
  name: "Vireo Health Co — ttopen_hydration_hank",
  message: null,
  endTimeEpochSeconds: 1701814400,
  products: [{ productId: "1729382476051234567", targetCommissionRatePercent: 15 }],
  creatorOpenIds: ["ttopen_hydration_hank"],
  sellerContactEmail: "partnerships@vireohealth.com",
  freeSampleRule: { hasFreeSample: false, isSampleApprovalExempt: false },
});
ok("T7 pure builder ok", built.ok);
if (built.ok) {
  const r6 = buildTargetCollabSignedRequest({ auth, timestamp: ts, path: built.path, body: built.body });
  eq("T7 composed body bytes", r6.body, JSON.stringify(built.body));
  ok("T7 commission in hundredths", r6.body !== undefined && r6.body.includes('"target_commission_rate":1500'));
  ok("T7 creator_user_open_ids key", r6.body !== undefined && r6.body.includes('"creator_user_open_ids":["ttopen_hydration_hank"]'));
  ok("T7 null message omitted from body", r6.body !== undefined && !r6.body.includes('"message"'));
  const expectedSign7 = signRequest({
    path: built.path,
    queryParams: { app_key: auth.appKey, timestamp: ts, shop_cipher: auth.shopCipher },
    body: JSON.stringify(built.body),
    contentType: "application/json",
    appSecret: auth.appSecret,
  });
  ok("T7 sign parity with signRequest", r6.url.endsWith(`&sign=${expectedSign7}`));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
