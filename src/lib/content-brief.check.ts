// src/lib/content-brief.check.ts
// Golden-vector check for content-brief. PURE module (LLM boundary stubbed; no network).
// Run: npx tsx src/lib/content-brief.check.ts
import {
  buildBriefPrompt,
  parseBriefResponse,
  buildContentBrief,
  type CreatorBriefContext,
  type GenerateBriefDraft,
} from "./content-brief";
import type { BrandBriefContext } from "./brand-content-read";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  } else {
    console.log(`ok   ${label}`);
  }
}
function assert(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL ${label}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

const brand: BrandBriefContext = {
  name: "Vireo Health Co",
  category: "Men's Health & Wellness",
  description: "Daily men's multivitamin and testosterone support.",
  approvedClaims: [
    "Supports healthy testosterone levels",
    "Made in a GMP-certified facility",
    "Clinically studied ingredients",
  ],
};
const creator: CreatorBriefContext = {
  handle: "@marcus_mens_wellness",
  niche: "Men's fitness and supplements",
  audienceSummary: "Men 25-40 interested in fitness",
};
const DISCLOSURE = "Paid partnership with Vireo Health Co. #ad";

// --- prompt builder (structural) ---
const promptA = buildBriefPrompt(brand);
assert("prompt A: lists claim index 0", promptA.includes("[0] Supports healthy testosterone levels"));
assert("prompt A: lists claim index 2", promptA.includes("[2] Clinically studied ingredients"));
assert("prompt A: states JSON-only contract", promptA.includes("Return ONLY a JSON object"));
assert("prompt A: no creator block", !promptA.includes("CREATOR"));
const promptB = buildBriefPrompt(brand, creator);
assert("prompt B: has creator block", promptB.includes("CREATOR (tailor"));
assert("prompt B: includes creator handle", promptB.includes("@marcus_mens_wellness"));
assert("prompt B: includes creator niche", promptB.includes("Men's fitness and supplements"));

// --- parse + resolve + assemble (exact) ---
const happyRaw =
  '{"hook":"Stop scrolling if you care about your T levels","talkingPoints":["Point A","Point B"],"approvedClaimIndices":[0,2],"callToAction":"Tap the orange cart to try it","notes":"Keep it punchy"}';
check("parse: happy path, claims resolved verbatim + disclosure injected", parseBriefResponse(happyRaw, brand), {
  ok: true,
  brief: {
    hook: "Stop scrolling if you care about your T levels",
    talkingPoints: ["Point A", "Point B"],
    approvedClaimsUsed: ["Supports healthy testosterone levels", "Clinically studied ingredients"],
    disclosure: DISCLOSURE,
    callToAction: "Tap the orange cart to try it",
    notes: "Keep it punchy",
  },
});
const dupOutRaw =
  '{"hook":"H","talkingPoints":["t"],"approvedClaimIndices":[2,2,5,-1,0],"callToAction":"C","notes":null}';
check("parse: out-of-range + duplicate indices dropped, first-seen order", parseBriefResponse(dupOutRaw, brand), {
  ok: true,
  brief: {
    hook: "H",
    talkingPoints: ["t"],
    approvedClaimsUsed: ["Clinically studied ingredients", "Supports healthy testosterone levels"],
    disclosure: DISCLOSURE,
    callToAction: "C",
    notes: null,
  },
});
check("parse: non-JSON => llm_parse_failed", parseBriefResponse("not json {{", brand), {
  ok: false,
  reason: "llm_parse_failed",
});
check("parse: missing hook => llm_malformed", parseBriefResponse(
  '{"talkingPoints":[],"approvedClaimIndices":[],"callToAction":"x","notes":null}', brand,
), { ok: false, reason: "llm_malformed" });
check("parse: talkingPoints not string[] => llm_malformed", parseBriefResponse(
  '{"hook":"h","talkingPoints":"oops","approvedClaimIndices":[],"callToAction":"x","notes":null}', brand,
), { ok: false, reason: "llm_malformed" });
const fencedRaw =
  '```json\n{"hook":"H","talkingPoints":["t"],"approvedClaimIndices":[1],"callToAction":"C","notes":null}\n```';
check("parse: strips code fences", parseBriefResponse(fencedRaw, brand), {
  ok: true,
  brief: {
    hook: "H",
    talkingPoints: ["t"],
    approvedClaimsUsed: ["Made in a GMP-certified facility"],
    disclosure: DISCLOSURE,
    callToAction: "C",
    notes: null,
  },
});

// --- orchestrator ---
(async () => {
  let calledNoClaims = false;
  const trackGen: GenerateBriefDraft = async () => {
    calledNoClaims = true;
    return "{}";
  };
  const noClaimsBrand: BrandBriefContext = { ...brand, approvedClaims: [] };
  check("orchestrator: no_claims", await buildContentBrief(noClaimsBrand, trackGen), {
    ok: false,
    reason: "no_claims",
  });
  assert("orchestrator: model NOT called when no_claims", calledNoClaims === false);

  let seenPrompt = "";
  const happyGen: GenerateBriefDraft = async (prompt) => {
    seenPrompt = prompt;
    return happyRaw;
  };
  check("orchestrator: happy path assembles brief", await buildContentBrief(brand, happyGen), {
    ok: true,
    brief: {
      hook: "Stop scrolling if you care about your T levels",
      talkingPoints: ["Point A", "Point B"],
      approvedClaimsUsed: ["Supports healthy testosterone levels", "Clinically studied ingredients"],
      disclosure: DISCLOSURE,
      callToAction: "Tap the orange cart to try it",
      notes: "Keep it punchy",
    },
  });
  assert("orchestrator: model received the indexed-claims prompt", seenPrompt.includes("[0] Supports healthy testosterone levels"));

  if (failures > 0) {
    console.error(`\n${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("\nALL_CHECKS_PASSED");
})();
