import "server-only";
// SECURITY: server-only Anthropic adapter. Reads ANTHROPIC_API_KEY from env and sends it ONLY
// in the x-api-key request header. The key is NEVER logged, never returned, and never placed in
// an error message; thrown errors carry status codes / generic reason strings only. Must never
// be imported into client/browser code.
//
// Implements GenerateBriefDraft (from content-brief): (prompt) => Promise<string>. Returns the
// model's text on success; THROWS on transport / non-2xx / no-text-block failure (a different
// class than content-brief's parse/malformed outcomes — the route layer catches it).
import type { GenerateBriefDraft } from "./content-brief";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 1500;

export type AnthropicGenerateDeps = {
  apiKey?: string;          // defaults to process.env.ANTHROPIC_API_KEY
  fetchImpl?: typeof fetch; // defaults to global fetch (DI seam for tests)
  model?: string;
  maxTokens?: number;
};

// Extract concatenated text from the Messages API response content blocks. Returns null on an
// unexpected shape or when there is no text block.
function extractText(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      parts.push((block as { text: string }).text);
    }
  }
  return parts.length === 0 ? null : parts.join("");
}

export function makeAnthropicGenerate(deps: AnthropicGenerateDeps = {}): GenerateBriefDraft {
  const apiKey = deps.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const model = deps.model ?? DEFAULT_MODEL;
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;

  return async (prompt: string): Promise<string> => {
    if (!apiKey) {
      throw new Error("anthropic_api_key_missing");
    }
    const response = await fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      throw new Error(`anthropic_http_${response.status}`);
    }
    const data: unknown = await response.json();
    const text = extractText(data);
    if (text === null) {
      throw new Error("anthropic_no_text");
    }
    return text;
  };
}
