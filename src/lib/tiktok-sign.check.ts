import { signRequest } from "./tiktok-sign";

let failures = 0;
function check(name: string, got: string, want: string) {
  const pass = got === want;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  console.log(`  got:  ${got}`);
  console.log(`  want: ${want}`);
}

check("T1 doc golden vector",
  signRequest({ path: "/authorization/202309/shops",
    queryParams: { app_key: "29a39d", timestamp: "1623812664" },
    body: "", contentType: "application/json", appSecret: "e59af819cc" }),
  "b596b73e0cc6de07ac26f036364178ab16b0a907af13d43f0a0cd2345f582dc8");

check("T2 excludes sign + access_token",
  signRequest({ path: "/authorization/202309/shops",
    queryParams: { app_key: "29a39d", timestamp: "1623812664",
      sign: "JUNK_SHOULD_BE_IGNORED", access_token: "JUNK_SHOULD_BE_IGNORED" },
    body: "", contentType: "application/json", appSecret: "e59af819cc" }),
  "b596b73e0cc6de07ac26f036364178ab16b0a907af13d43f0a0cd2345f582dc8");

check("T3 body included (json)",
  signRequest({ path: "/event/202309/webhooks",
    queryParams: { app_key: "test_app_key", shop_cipher: "ROW_testcipher", timestamp: "1696909000" },
    body: '{"event_type":"ORDER_STATUS_CHANGE"}',
    contentType: "application/json", appSecret: "test_app_secret" }),
  "2a8655fde4b65689de75ee7a6b78b523ed7f8ed269fe2217c3dd402df5dc85bd");

check("T4 body excluded (multipart)",
  signRequest({ path: "/event/202309/webhooks",
    queryParams: { app_key: "test_app_key", shop_cipher: "ROW_testcipher", timestamp: "1696909000" },
    body: '{"event_type":"ORDER_STATUS_CHANGE"}',
    contentType: "multipart/form-data; boundary=xyz", appSecret: "test_app_secret" }),
  "d17ab3f29f2aca224005db6fea46cc2809eb56308a9028843c7cc2cf2acb2865");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
