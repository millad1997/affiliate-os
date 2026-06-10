import { makeStubSendAdapter } from "./outreach-send-adapter";

let failures = 0;
function ok(name: string, cond: boolean): void {
  if (cond) console.log(`pass ${name}`);
  else { failures++; console.error(`FAIL ${name}`); }
}

async function main(): Promise<void> {
  const stub = makeStubSendAdapter();
  const r1 = await stub({ creatorOpenId: "ttopen_alpha", message: "hi" });
  ok("default_success", r1.ok === true && r1.providerRef === "stub:ttopen_alpha");

  const stub2 = makeStubSendAdapter({ providerRefPrefix: "demo" });
  const r2 = await stub2({ creatorOpenId: "ttopen_beta", message: "hi" });
  ok("custom_prefix", r2.ok === true && r2.providerRef === "demo:ttopen_beta");

  const stub3 = makeStubSendAdapter({ failFor: new Set(["ttopen_gamma"]) });
  const rFail = await stub3({ creatorOpenId: "ttopen_gamma", message: "hi" });
  ok("forced_failure", rFail.ok === false && rFail.errorCode === "stub_forced_failure");

  const rPass = await stub3({ creatorOpenId: "ttopen_delta", message: "hi" });
  ok("mixed_pass", rPass.ok === true && rPass.providerRef === "stub:ttopen_delta");
}

main().finally(() => {
  if (failures > 0) { console.error(`\n${failures} VECTOR(S) FAILED`); process.exit(1); }
  console.log("\nALL_VECTORS_PASS");
});
