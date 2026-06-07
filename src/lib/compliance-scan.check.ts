// src/lib/compliance-scan.check.ts
// Golden-vector control for compliance-scan.ts. PURE — run with:
//   npx tsx src/lib/compliance-scan.check.ts
// No network, no secrets, no server-only imports (the type imports are erased).
import type { BrandBriefContext } from "./brand-content-read";
import type { ContentBrief } from "./content-brief";
import { buildScanPrompt, parseScanResponse, scanBriefCompliance } from "./compliance-scan";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}`);
  }
}

const brand: BrandBriefContext = {
  name: "Vireo Health Co",
  category: "Men's Wellness Supplements",
  description: "A daily multivitamin for active men.",
  approvedClaims: ["Supports everyday energy.", "Part of a balanced routine."],
};

const brief: ContentBrief = {
  hook: "Tired all the time? This cured my chronic fatigue in a week.",
  talkingPoints: [
    "I take one capsule every morning with breakfast.",
    "It supports everyday energy without the crash.",
    "Guaranteed to triple your testosterone overnight.",
  ],
  approvedClaimsUsed: ["Supports everyday energy."],
  disclosure: "Paid partnership with Vireo Health Co. #ad",
  callToAction: "Tap the orange cart to grab yours.",
  notes: null,
};

function rawFindings(findings: unknown[]): string {
  return JSON.stringify({ findings });
}

async function main(): Promise<void> {
  // T1 — clean pass
  {
    const r = parseScanResponse(rawFindings([]), brief);
    check("T1 ok", r.ok === true);
    check("T1 verdict pass", r.ok === true && r.scan.verdict === "pass");
    check("T1 zero findings", r.ok === true && r.scan.findings.length === 0);
  }

  // T2 — valid disease claim on hook (index null)
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "hook", index: null, quote: "cured my chronic fatigue", category: "disease_or_treatment_claim", severity: "high", rationale: "implies a disease cure" },
      ]),
      brief,
    );
    check("T2 flagged", r.ok === true && r.scan.verdict === "flagged");
    check("T2 one finding", r.ok === true && r.scan.findings.length === 1);
    check("T2 field hook", r.ok === true && r.scan.findings[0].field === "hook");
    check("T2 index null", r.ok === true && r.scan.findings[0].index === null);
    check("T2 category", r.ok === true && r.scan.findings[0].category === "disease_or_treatment_claim");
  }

  // T3 — valid unapproved claim on talkingPoint[2]
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "talkingPoint", index: 2, quote: "triple your testosterone", category: "unapproved_claim", severity: "high", rationale: "not in approved claims" },
      ]),
      brief,
    );
    check("T3 one finding", r.ok === true && r.scan.findings.length === 1);
    check("T3 index 2", r.ok === true && r.scan.findings[0].index === 2);
  }

  // T4 — talkingPoint index out of range => dropped
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "talkingPoint", index: 9, quote: "triple your testosterone", category: "unapproved_claim", severity: "high", rationale: "x" },
      ]),
      brief,
    );
    check("T4 dropped -> pass", r.ok === true && r.scan.verdict === "pass" && r.scan.findings.length === 0);
  }

  // T5 — quote not present in brief => dropped
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "hook", index: null, quote: "miracle weight loss", category: "unapproved_claim", severity: "high", rationale: "x" },
      ]),
      brief,
    );
    check("T5 unverifiable dropped", r.ok === true && r.scan.findings.length === 0);
  }

  // T6 — unknown category => dropped
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "hook", index: null, quote: "cured my chronic fatigue", category: "made_up", severity: "high", rationale: "x" },
      ]),
      brief,
    );
    check("T6 bad category dropped", r.ok === true && r.scan.findings.length === 0);
  }

  // T7 — unknown severity => dropped
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "hook", index: null, quote: "cured my chronic fatigue", category: "disease_or_treatment_claim", severity: "critical", rationale: "x" },
      ]),
      brief,
    );
    check("T7 bad severity dropped", r.ok === true && r.scan.findings.length === 0);
  }

  // T8 — notes finding when notes is null => dropped
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "notes", index: null, quote: "anything", category: "off_brand", severity: "low", rationale: "x" },
      ]),
      brief,
    );
    check("T8 null-notes dropped", r.ok === true && r.scan.findings.length === 0);
  }

  // T9 — hook finding with stray non-null index => kept, stored index forced null
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "hook", index: 5, quote: "cured my chronic fatigue", category: "disease_or_treatment_claim", severity: "high", rationale: "x" },
      ]),
      brief,
    );
    check("T9 kept", r.ok === true && r.scan.findings.length === 1);
    check("T9 index forced null", r.ok === true && r.scan.findings[0].index === null);
  }

  // T10 — whitespace-normalized substring match => kept
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "hook", index: null, quote: "chronic   fatigue", category: "disease_or_treatment_claim", severity: "high", rationale: "x" },
      ]),
      brief,
    );
    check("T10 ws-normalized kept", r.ok === true && r.scan.findings.length === 1);
  }

  // T11 — empty quote => dropped
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "hook", index: null, quote: "   ", category: "off_brand", severity: "low", rationale: "x" },
      ]),
      brief,
    );
    check("T11 empty quote dropped", r.ok === true && r.scan.findings.length === 0);
  }

  // T12 — mixed valid + invalid => only valid kept
  {
    const r = parseScanResponse(
      rawFindings([
        { field: "hook", index: null, quote: "cured my chronic fatigue", category: "disease_or_treatment_claim", severity: "high", rationale: "ok" },
        { field: "talkingPoint", index: 99, quote: "nope", category: "unapproved_claim", severity: "high", rationale: "drop" },
      ]),
      brief,
    );
    check("T12 only valid kept", r.ok === true && r.scan.findings.length === 1 && r.scan.verdict === "flagged");
  }

  // T13 — parse failure
  {
    const r = parseScanResponse("not json {", brief);
    check("T13 parse_failed", r.ok === false && r.reason === "llm_parse_failed");
  }

  // T14 — malformed: missing findings array
  {
    const r = parseScanResponse(JSON.stringify({ oops: 1 }), brief);
    check("T14 malformed (no findings)", r.ok === false && r.reason === "llm_malformed");
  }

  // T15 — malformed: top-level array
  {
    const r = parseScanResponse(JSON.stringify([1, 2]), brief);
    check("T15 malformed (array)", r.ok === false && r.reason === "llm_malformed");
  }

  // T16 — code-fence wrapped JSON parses
  {
    const r = parseScanResponse("```json\n{\"findings\":[]}\n```", brief);
    check("T16 fenced parses", r.ok === true && r.scan.verdict === "pass");
  }

  // T17 — prompt sanity
  {
    const p = buildScanPrompt(brand, brief);
    check("T17 prompt claim 0", p.includes("[0] Supports everyday energy."));
    check("T17 prompt claim 1", p.includes("[1] Part of a balanced routine."));
    check("T17 prompt tp2 label", p.includes("talkingPoint[2]: Guaranteed to triple your testosterone overnight."));
    check("T17 prompt brand", p.includes("BRAND: Vireo Health Co"));
  }

  // T18 — empty-claim brand still scannable
  {
    const p = buildScanPrompt({ ...brand, approvedClaims: [] }, brief);
    check("T18 no-claims prompt", p.includes("(no approved claims on file)"));
  }

  // T-orch — async orchestrator path
  {
    const stub = async (_p: string): Promise<string> =>
      rawFindings([
        { field: "talkingPoint", index: 2, quote: "triple your testosterone", category: "unapproved_claim", severity: "high", rationale: "no approved claim supports this" },
      ]);
    const r = await scanBriefCompliance(brand, brief, stub);
    check("T-orch flagged", r.ok === true && r.scan.verdict === "flagged");
    check("T-orch index 2", r.ok === true && r.scan.findings[0].index === 2);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? "ALL_GREEN" : "HAS_FAILURES");
}

main();
