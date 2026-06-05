// src/lib/anthropic-generate.check.ts
// Golden-vector check for the Anthropic adapter. Injects a fake fetch + apiKey — NO network,
// NO real key. Server-only module, so run with the flag:
//   npx tsx --conditions=react-server --env-file=.env.local src/lib/anthropic-generate.check.ts
import { makeAnthropicGenerate } from "./anthropic-generate";

let failures = 0;
function assert(label: string, cond: boolean) {
  if (!cond) { failures++; console.error(`FAIL ${label}`); }
  else console.log(`ok   ${label}`);
}
async function assertThrows(label: string, fn: () => Promise<unknown>, expected: string) {
  try {
    await fn();
    failures++;
    console.error(`FAIL ${label} (no throw)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === expected) console.log(`ok   ${label}`);
    else { failures++; console.error(`FAIL ${label}\n  expected throw ${expected}\n  actual throw   ${msg}`); }
  }
}

type Captured = { url?: string; headers?: Record<string, string>; body?: string };
function fakeFetch(cap: Captured, responder: () => Response): typeof fetch {
  return (async (url: unknown, init: unknown) => {
    cap.url = String(url);
    const i = (init ?? {}) as { headers?: Record<string, string>; body?: string };
    cap.headers = i.headers;
    cap.body = i.body;
    return responder();
  }) as unknown as typeof fetch;
}

(async () => {
  // --- request shape + happy parse ---
  const cap: Captured = {};
  const gen = makeAnthropicGenerate({
    apiKey: "test-key",
    fetchImpl: fakeFetch(cap, () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "DRAFT" }] }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    ),
  });
  assert("returns the model text", (await gen("PROMPT_BODY")) === "DRAFT");
  assert("posts to the messages endpoint", cap.url === "https://api.anthropic.com/v1/messages");
  assert("sends x-api-key", cap.headers?.["x-api-key"] === "test-key");
  assert("sends anthropic-version", cap.headers?.["anthropic-version"] === "2023-06-01");
  assert("sends json content-type", cap.headers?.["content-type"] === "application/json");
  const body = JSON.parse(cap.body ?? "{}");
  assert("body uses claude-sonnet-4-6", body.model === "claude-sonnet-4-6");
  assert("body carries prompt as a user message",
    body.messages?.[0]?.role === "user" && body.messages?.[0]?.content === "PROMPT_BODY");
  assert("body sets max_tokens", typeof body.max_tokens === "number");

  // --- multi-block parsing ---
  const genMulti = makeAnthropicGenerate({
    apiKey: "k",
    fetchImpl: fakeFetch({}, () =>
      new Response(JSON.stringify({ content: [
        { type: "text", text: "A" },
        { type: "thinking", thinking: "ignore" },
        { type: "text", text: "B" },
      ] }), { status: 200, headers: { "content-type": "application/json" } }),
    ),
  });
  assert("concatenates text blocks, skips non-text", (await genMulti("p")) === "AB");

  // --- error paths ---
  const genHttp = makeAnthropicGenerate({
    apiKey: "k",
    fetchImpl: fakeFetch({}, () => new Response("boom", { status: 529 })),
  });
  await assertThrows("non-2xx throws anthropic_http_<status>", () => genHttp("p"), "anthropic_http_529");

  const genNoText = makeAnthropicGenerate({
    apiKey: "k",
    fetchImpl: fakeFetch({}, () =>
      new Response(JSON.stringify({ content: [{ type: "thinking", thinking: "x" }] }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    ),
  });
  await assertThrows("no text block throws anthropic_no_text", () => genNoText("p"), "anthropic_no_text");

  const genNoKey = makeAnthropicGenerate({
    apiKey: "",
    fetchImpl: fakeFetch({}, () => new Response("{}", { status: 200 })),
  });
  await assertThrows("missing key throws anthropic_api_key_missing", () => genNoKey("p"), "anthropic_api_key_missing");

  if (failures > 0) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
  console.log("\nALL_CHECKS_PASSED");
})();
