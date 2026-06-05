// src/lib/content-brief.ts
// First generative module in the codebase: turns a brand's approved-claim library + product
// context (and, optionally, a creator's profile) into a structured TikTok Shop content brief.
// PURE module — the LLM call is an INJECTED async boundary (GenerateBriefDraft); the real
// Anthropic wiring lives in a separate server adapter. Fully fixture-testable without network.
//
// Compliance-by-construction (the FDA-safety hinge, §3.6):
//   - The LLM never emits claim TEXT. It returns the INDICES of the approved claims it drew on;
//     this module resolves them to the VERBATIM strings from the brand's claim library, so a
//     brief can never paraphrase an approved claim into an unapproved one.
//   - The FTC disclosure is injected DETERMINISTICALLY by this module, never LLM-generated, so
//     it can't be omitted or mangled.
// SCOPE BOUNDARY: this guarantees any *referenced* approved claim is verbatim-approved. It does
// NOT guarantee the generated prose contains no unapproved claim — detecting a smuggled claim in
// free text is the compliance-scan layer's job (§3.7), downstream of this module.
//
// BrandBriefContext is imported as a TYPE ONLY from the server-only brand-content-read module;
// the type import is erased at compile time, so this module stays pure (plain `npx tsx`).
import type { BrandBriefContext } from "./brand-content-read";

// Optional creator-side input (Fork B). Absent => brand/product-centric brief (Fork A). Kept
// minimal and decoupled from TikTok response types so this module stays pure; mapping real
// creator detail into this shape happens elsewhere (when the B data path is wired).
export type CreatorBriefContext = {
  handle: string;
  niche: string | null;
  audienceSummary: string | null;
};

export type ContentBrief = {
  hook: string;
  talkingPoints: string[];
  approvedClaimsUsed: string[]; // verbatim, resolved by this module from claim indices
  disclosure: string;           // injected deterministically by this module
  callToAction: string;
  notes: string | null;
};

export type BuildBriefResult =
  | { ok: true; brief: ContentBrief }
  | { ok: false; reason: "no_claims" | "llm_parse_failed" | "llm_malformed" };

// Injected LLM boundary. Given a fully-formed prompt, returns the model's raw text response.
// The real implementation (Anthropic call) is a separate server adapter; tests stub this.
export type GenerateBriefDraft = (prompt: string) => Promise<string>;

// Deterministic FTC material-connection disclosure. Module-owned, never model-generated.
function buildDisclosure(brandName: string): string {
  return `Paid partnership with ${brandName}. #ad`;
}

// Build the (deterministic) prompt. Approved claims are listed WITH indices so the model can
// reference them by index rather than restating text.
export function buildBriefPrompt(
  brand: BrandBriefContext,
  creator?: CreatorBriefContext,
): string {
  const claimsBlock = brand.approvedClaims.map((claim, i) => `[${i}] ${claim}`).join("\n");
  const description = brand.description ?? "(no product description on file)";

  const lines: string[] = [
    "You are writing a content brief for a TikTok Shop affiliate creator promoting a brand's product.",
    "",
    `BRAND: ${brand.name}`,
    `CATEGORY: ${brand.category}`,
    `PRODUCT: ${description}`,
    "",
    "APPROVED CLAIMS (use ONLY these for any product or health claim; reference them by index):",
    claimsBlock,
    "",
    "RULES:",
    "- Any product or health claim in the brief MUST come from the approved claims above. Do not introduce, rephrase, or strengthen any claim.",
    "- This is a dietary supplement context: no disease, treatment, cure, or diagnosis claims.",
    "- Keep it concrete and usable by a creator filming a short video.",
  ];

  if (creator) {
    lines.push(
      "",
      "CREATOR (tailor the hook, talking points, and notes to this creator):",
      `- Handle: ${creator.handle}`,
      `- Niche: ${creator.niche ?? "(unspecified)"}`,
      `- Audience: ${creator.audienceSummary ?? "(unspecified)"}`,
    );
  }

  lines.push(
    "",
    "Return ONLY a JSON object (no prose, no code fences) with exactly these keys:",
    '{"hook": string, "talkingPoints": string[], "approvedClaimIndices": number[], "callToAction": string, "notes": string | null}',
    '- "approvedClaimIndices": the indices of the approved claims your talking points rely on.',
    '- "notes": short tone/format guidance, or null.',
  );

  return lines.join("\n");
}

// Strip an optional ```json ... ``` fence a model may wrap around JSON, then trim.
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

// Resolve model-returned claim indices to VERBATIM approved-claim strings. Drops anything out
// of range, non-integer, or duplicate; preserves first-seen order.
function resolveClaimIndices(indices: number[], claims: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<number>();
  for (const idx of indices) {
    if (!Number.isInteger(idx)) continue;
    if (idx < 0 || idx >= claims.length) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(claims[idx]);
  }
  return out;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === "number");
}

// Parse + validate the model's raw response, then assemble the final brief with the
// module-injected disclosure and verbatim-resolved claims.
export function parseBriefResponse(raw: string, brand: BrandBriefContext): BuildBriefResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return { ok: false, reason: "llm_parse_failed" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "llm_malformed" };
  }
  const obj = parsed as Record<string, unknown>;

  const hook = obj.hook;
  if (typeof hook !== "string") return { ok: false, reason: "llm_malformed" };
  const talkingPoints = obj.talkingPoints;
  if (!isStringArray(talkingPoints)) return { ok: false, reason: "llm_malformed" };
  const approvedClaimIndices = obj.approvedClaimIndices;
  if (!isNumberArray(approvedClaimIndices)) return { ok: false, reason: "llm_malformed" };
  const callToAction = obj.callToAction;
  if (typeof callToAction !== "string") return { ok: false, reason: "llm_malformed" };
  const notes = obj.notes;
  if (notes !== null && typeof notes !== "string") return { ok: false, reason: "llm_malformed" };

  const brief: ContentBrief = {
    hook,
    talkingPoints,
    approvedClaimsUsed: resolveClaimIndices(approvedClaimIndices, brand.approvedClaims),
    disclosure: buildDisclosure(brand.name),
    callToAction,
    notes,
  };
  return { ok: true, brief };
}

// Orchestrator: refuse if there are no approved claims (a compliant brief must be grounded in
// the claim library, §3.6); otherwise build the prompt, call the injected model, parse+assemble.
export async function buildContentBrief(
  brand: BrandBriefContext,
  generate: GenerateBriefDraft,
  creator?: CreatorBriefContext,
): Promise<BuildBriefResult> {
  if (brand.approvedClaims.length === 0) {
    return { ok: false, reason: "no_claims" };
  }
  const prompt = buildBriefPrompt(brand, creator);
  const raw = await generate(prompt);
  return parseBriefResponse(raw, brand);
}
