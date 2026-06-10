import { briefToPlainText } from "./brief-plain-text";
import type { ContentBrief } from "./content-brief";

let failures = 0;
function ok(name: string, cond: boolean): void {
  if (cond) console.log(`pass ${name}`);
  else { failures++; console.error(`FAIL ${name}`); }
}

const full: ContentBrief = {
  hook: "Morning routine upgrade",
  talkingPoints: ["Point one", "Point two"],
  approvedClaimsUsed: ["Claim A", "Claim B"],
  disclosure: "#ad Paid partnership",
  callToAction: "Tap the link",
  notes: "Keep it under 60s",
};

const expectedFull = [
  "Hook", "Morning routine upgrade", "",
  "Talking points", "- Point one", "- Point two", "",
  "Approved claims used", "- Claim A", "- Claim B", "",
  "Call to action", "Tap the link", "",
  "Disclosure", "#ad Paid partnership", "",
  "Notes", "Keep it under 60s",
].join("\n");

ok("full_brief_exact", briefToPlainText(full) === expectedFull);

const minimal: ContentBrief = {
  hook: "H",
  talkingPoints: ["Only point"],
  approvedClaimsUsed: [],
  disclosure: "#ad",
  callToAction: "CTA",
  notes: null,
};

const expectedMinimal = [
  "Hook", "H", "",
  "Talking points", "- Only point", "",
  "Approved claims used", "None referenced", "",
  "Call to action", "CTA", "",
  "Disclosure", "#ad",
].join("\n");

ok("minimal_no_claims_no_notes", briefToPlainText(minimal) === expectedMinimal);
ok("no_trailing_newline_without_notes", !briefToPlainText(minimal).endsWith("\n"));

if (failures > 0) { console.error(`\n${failures} VECTOR(S) FAILED`); process.exit(1); }
console.log("\nALL_VECTORS_PASS");
