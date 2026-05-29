import { executeSignedRequest, type FetchLike } from "./tiktok-fetch";
import { buildSearchCreatorsRequest, buildGetCreatorRequest, type MarketplaceAuth } from "./tiktok-marketplace-request";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const auth: MarketplaceAuth = {
  appKey: "test_app_key",
  appSecret: "test_app_secret",
  accessToken: "test_access_token",
  shopCipher: "test_shop_cipher",
};

type Seen = { url: string; init: { method: string; headers: Record<string, string>; body?: string } };
function fakeFetch(status: number, body: string, record?: (c: Seen) => void): FetchLike {
  return async (url, init) => { record?.({ url, init }); return { status, text: async () => body }; };
}

async function main() {
  {
    const req = buildSearchCreatorsRequest({ auth, timestamp: 1700000000, pageSize: 20, body: { keyword: "mens wellness", gmv_ranges: ["GMV_RANGE_1000_10000"] } });
    let seen: Seen | null = null;
    const env = { code: 0, message: "Success", request_id: "req_1", data: { creators: [{ username: "mens_wellness_marcus" }] } };
    const r = await executeSignedRequest(req, fakeFetch(200, JSON.stringify(env), (c) => (seen = c)));
    check("1a ok=true", r.ok === true);
    check("1b status 200", r.ok && r.status === 200);
    check("1c code 0 preserved", r.ok && r.envelope.code === 0);
    check("1d data threads through", r.ok && (r.envelope.data as { creators?: { username?: string }[] })?.creators?.[0]?.username === "mens_wellness_marcus");
    check("1e body byte-identical (no re-serialize)", seen!.init.body === req.body);
    check("1f method+url forwarded", seen!.init.method === "POST" && seen!.url === req.url);
    check("1g token header forwarded", seen!.init.headers["x-tts-access-token"] === "test_access_token");
  }
  {
    const req = buildGetCreatorRequest({ auth, timestamp: 1700000000, creatorUserId: "creator_open_id_123" });
    const env = { code: 16032012, message: "only affiliate partner cipher can access this api", request_id: "req_2" };
    const r = await executeSignedRequest(req, fakeFetch(200, JSON.stringify(env)));
    check("2a ok=true (transport ok)", r.ok === true);
    check("2b business code preserved", r.ok && r.envelope.code === 16032012);
  }
  {
    const req = buildGetCreatorRequest({ auth, timestamp: 1700000000, creatorUserId: "creator_open_id_123" });
    const env = { code: 99999, message: "rate limited", request_id: "req_3" };
    const r = await executeSignedRequest(req, fakeFetch(429, JSON.stringify(env)));
    check("3a ok=true", r.ok === true);
    check("3b status 429 surfaced", r.ok && r.status === 429);
    check("3c code preserved", r.ok && r.envelope.code === 99999);
  }
  {
    const req = buildGetCreatorRequest({ auth, timestamp: 1700000000, creatorUserId: "c" });
    const r = await executeSignedRequest(req, fakeFetch(200, "<html>not json</html>"));
    check("4a ok=false", r.ok === false);
    check("4b kind invalid_json", !r.ok && r.kind === "invalid_json");
    check("4c status 200", !r.ok && r.kind === "invalid_json" && r.status === 200);
  }
  {
    const req = buildGetCreatorRequest({ auth, timestamp: 1700000000, creatorUserId: "c" });
    const r = await executeSignedRequest(req, fakeFetch(503, "<html>Service Unavailable</html>"));
    check("5a ok=false", r.ok === false);
    check("5b kind http", !r.ok && r.kind === "http");
    check("5c status 503", !r.ok && r.kind === "http" && r.status === 503);
  }
  {
    const req = buildGetCreatorRequest({ auth, timestamp: 1700000000, creatorUserId: "c" });
    const throwing: FetchLike = async () => { throw new Error("ECONNREFUSED"); };
    const r = await executeSignedRequest(req, throwing);
    check("6a ok=false", r.ok === false);
    check("6b kind network", !r.ok && r.kind === "network");
  }
  {
    const req = buildGetCreatorRequest({ auth, timestamp: 1700000000, creatorUserId: "creator_open_id_123" });
    let seen: Seen | null = null;
    const env = { code: 0, message: "Success", data: { creator: { username: "wellness_kate" } } };
    await executeSignedRequest(req, fakeFetch(200, JSON.stringify(env), (c) => (seen = c)));
    check("7a GET method forwarded", seen!.init.method === "GET");
    check("7b GET body is undefined", seen!.init.body === undefined);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) throw new Error(`${fail} control(s) failed`);
}
main();
