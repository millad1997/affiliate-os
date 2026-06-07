// src/lib/compliance-scan.ts
// §3.7 enforcement layer. content-brief.ts guarantees any *referenced* approved claim is resolved
// VERBATIM, but it does NOT police the free prose (hook, talking points, CTA, notes) — a smuggled
// or embellished claim there is the generative model's discretion, unenforced. This module is that
// missing pass: an LLM compliance reviewer scans the brief's free prose against the brand's
// approved-claim library and flags FTC/FDA/off-brief problems.
//
// Trust-minimizing design (mirrors content-brief's compliance-by-construction hinge):
//   - The reviewer returns ONLY findings, each POINTING at offending prose via (field, index,
//     verbatim quote). It does NOT decide the verdict.
//   - This module VERIFIES every finding's quote actually occurs in the named field
//     (whitespace-normalized substring); any finding whose quote can't be located is DROPPED, so
//     the audit trail can never contain a phrase the model fabricated.
//   - The verdict is computed DETERMINISTICALLY here (flagged iff >=1 finding survives), never
//     taken from the model.
//   - category and severity are CLOSED enums; an out-of-set value drops that finding.
// The reviewer's `rationale` is free model text (advisory) and is the one non-verified field; it
// never gates the verdict and always accompanies a module-verified quote.
//
// PURE module: the LLM call is the INJECTED GenerateBriefDraft boundary (the same type the
// content-brief layer uses; real Anthropic wiring is the server adapter). ContentBrief,
// BrandBriefContext, and GenerateBriefDraft are TYPE-ONLY imports (erased at compile time), so this
// module stays pure and runs under plain `npx tsx`.
import type { ContentBrief, GenerateBriefDraft } from "./content-brief";
import type { BrandBriefContext } from "./brand-content-read";

// Which prose field a finding points at. `disclosure` (module-injected, deterministic) and
// `approvedClaimsUsed` (verbatim-resolved, safe by construction) are intentionally NOT scannable.
export type ComplianceField = "hook" | "talkingPoint" | "callToAction" | "notes";

export type ComplianceCategory =
  | "disease_or_treatment_claim" // FDA: implies diagnose / treat / cure / mitigate / prevent disease
  | "unapproved_claim"           // a product/health claim not grounded in the approved library
  | "overstated_claim"           // an approved claim strengthened/broadened beyond its text
  | "disclosure_issue"           // FTC material-connection problem in the prose itself
  | "off_brand";                 // contradicts the brand/category positioning

export type ComplianceSeverity = "high" | "medium" | "low";

export type ComplianceFinding = {
  field: ComplianceField;
  index: number | null; // talkingPoints index when field === "talkingPoint"; null otherwise
  quote: string;        // prose span the reviewer flagged, verified present in the field by this module
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  rationale: string;    // model's explanation (advisory; does not gate the verdict)
};

export type ComplianceScan = {
  verdict: "pass" | "flagged"; // computed here, not by the model
  findings: ComplianceFinding[];
};

export type ScanComplianceResult =
  | { ok: true; scan: ComplianceScan }
  | { ok: false; reason: "llm_parse_failed" | "llm_malformed" };

const FIELDS: ReadonlySet<string> = new Set<ComplianceField>([
  "hook",
  "talkingPoint",
  "callToAction",
  "notes",
]);
const CATEGORIES: ReadonlySet<string> = new Set<ComplianceCategory>([
  "disease_or_treatment_claim",
  "unapproved_claim",
  "overstated_claim",
  "disclosure_issue",
  "off_brand",
]);
const SEVERITIES: ReadonlySet<string> = new Set<ComplianceSeverity>([
  "high",
  "medium",
  "low",
]);

function isField(v: string): v is ComplianceField {
  return FIELDS.has(v);
}
function isCategory(v: string): v is ComplianceCategory {
  return CATEGORIES.has(v);
}
function isSeverity(v: string): v is ComplianceSeverity {
  return SEVERITIES.has(v);
}

// Build the (deterministic) reviewer prompt. Approved claims are listed WITH indices; each prose
// unit is labeled with the exact address the model must use when pointing at a problem.
export function buildScanPrompt(brand: BrandBriefContext, brief: ContentBrief): string {
  const claimsBlock =
    brand.approvedClaims.length > 0
      ? brand.approvedClaims.map((claim, i) => `[${i}] ${claim}`).join("\n")
      : "(no approved claims on file)";
  const description = brand.description ?? "(no product description on file)";

  const proseLines: string[] = [
    `hook: ${brief.hook}`,
    ...brief.talkingPoints.map((tp, i) => `talkingPoint[${i}]: ${tp}`),
    `callToAction: ${brief.callToAction}`,
    `notes: ${brief.notes ?? "(none)"}`,
  ];

  return [
    "You are a compliance reviewer for a TikTok Shop affiliate content brief in a dietary-supplement / health & wellness context.",
    "Review ONLY the brief prose below. Flag anything non-compliant. Be precise and conservative: flag real problems, not stylistic nits.",
    "",
    `BRAND: ${brand.name}`,
    `CATEGORY: ${brand.category}`,
    `PRODUCT: ${description}`,
    "",
    "APPROVED CLAIMS (the ONLY product/health claims this brand may make; referenced by index):",
    claimsBlock,
    "",
    "BRIEF PROSE TO REVIEW (each line is prefixed with its field address):",
    ...proseLines,
    "",
    "FLAG a prose span when it is any of:",
    "- disease_or_treatment_claim: states or implies the product diagnoses, treats, cures, mitigates, or prevents a disease.",
    "- unapproved_claim: makes a product or health claim not grounded in the approved claims above.",
    "- overstated_claim: takes an approved claim but strengthens, broadens, or guarantees it beyond the approved wording.",
    "- disclosure_issue: the prose itself misrepresents or undermines the paid/material-connection relationship.",
    "- off_brand: contradicts the brand or category positioning above.",
    "",
    "Severity: high (regulatory/legal risk, e.g. disease or unapproved health claim), medium (overstated/off-brand), low (minor).",
    "",
    "Return ONLY a JSON object (no prose, no code fences) with exactly this shape:",
    '{"findings": [{"field": "hook" | "talkingPoint" | "callToAction" | "notes", "index": number | null, "quote": string, "category": "disease_or_treatment_claim" | "unapproved_claim" | "overstated_claim" | "disclosure_issue" | "off_brand", "severity": "high" | "medium" | "low", "rationale": string}]}',
    '- "quote": copy the EXACT offending substring from the prose line, character-for-character. Do not paraphrase it.',
    '- "index": for field "talkingPoint", the 0-based index from its address (e.g. talkingPoint[2] => 2); otherwise null.',
    '- If the brief is fully compliant, return {"findings": []}.',
  ].join("\n");
}

// Strip an optional ```json ... ``` fence a model may wrap around JSON, then trim.
// (Same proven behavior as content-brief.ts.)
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

// Whitespace-normalize for substring verification: trim + collapse internal whitespace runs to a
// single space. Lets a verbatim quote survive trivial spacing/newline noise WITHOUT permitting
// semantic drift — the words must still appear, in order, inside the named field.
function normalizeWs(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// Resolve a finding's named field to its source prose text, or null if the address is invalid
// (out-of-range talkingPoint index, or notes when notes is null).
function resolveFieldText(
  field: ComplianceField,
  index: number | null,
  brief: ContentBrief,
): string | null {
  switch (field) {
    case "hook":
      return brief.hook;
    case "callToAction":
      return brief.callToAction;
    case "notes":
      return brief.notes; // null => unresolved => finding dropped
    case "talkingPoint": {
      if (index === null || !Number.isInteger(index)) return null;
      if (index < 0 || index >= brief.talkingPoints.length) return null;
      return brief.talkingPoints[index];
    }
  }
}

// Validate one raw finding from the model and verify its quote against the brief. Returns a clean
// ComplianceFinding, or null to DROP it (malformed, out-of-set, or unverifiable quote).
function validateFinding(raw: unknown, brief: ContentBrief): ComplianceFinding | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const fieldRaw = obj.field;
  if (typeof fieldRaw !== "string" || !isField(fieldRaw)) return null;
  const field = fieldRaw;

  const categoryRaw = obj.category;
  if (typeof categoryRaw !== "string" || !isCategory(categoryRaw)) return null;
  const category = categoryRaw;

  const severityRaw = obj.severity;
  if (typeof severityRaw !== "string" || !isSeverity(severityRaw)) return null;
  const severity = severityRaw;

  const quote = obj.quote;
  if (typeof quote !== "string" || quote.trim().length === 0) return null;

  const rationale = obj.rationale;
  if (typeof rationale !== "string") return null;

  // index is only meaningful for talkingPoint; validated there, forced null elsewhere.
  let index: number | null = null;
  if (field === "talkingPoint") {
    const rawIndex = obj.index;
    if (typeof rawIndex !== "number" || !Number.isInteger(rawIndex)) return null;
    if (rawIndex < 0 || rawIndex >= brief.talkingPoints.length) return null;
    index = rawIndex;
  }

  const source = resolveFieldText(field, index, brief);
  if (source === null) return null; // unresolved address (bad index, null notes)

  // Verify the flagged quote actually occurs in the named field (whitespace-normalized).
  if (!normalizeWs(source).includes(normalizeWs(quote))) return null;

  return { field, index, quote, category, severity, rationale };
}

// Parse + validate the model's raw response, verify each finding against the brief, and compute the
// verdict deterministically (flagged iff >=1 finding survives).
export function parseScanResponse(raw: string, brief: ContentBrief): ScanComplianceResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return { ok: false, reason: "llm_parse_failed" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "llm_malformed" };
  }
  const rawFindings = (parsed as Record<string, unknown>).findings;
  if (!Array.isArray(rawFindings)) {
    return { ok: false, reason: "llm_malformed" };
  }

  const findings: ComplianceFinding[] = [];
  for (const rf of rawFindings) {
    const finding = validateFinding(rf, brief);
    if (finding !== null) findings.push(finding);
  }

  return {
    ok: true,
    scan: { verdict: findings.length > 0 ? "flagged" : "pass", findings },
  };
}

// Orchestrator: build the prompt, call the injected reviewer model, parse + verify. The brief is
// assumed already built by content-brief; there's no "no claims" short-circuit (an empty claim
// library is itself something the reviewer can flag as unapproved-claim risk).
export async function scanBriefCompliance(
  brand: BrandBriefContext,
  brief: ContentBrief,
  generate: GenerateBriefDraft,
): Promise<ScanComplianceResult> {
  const prompt = buildScanPrompt(brand, brief);
  const raw = await generate(prompt);
  return parseScanResponse(raw, brief);
}
