// src/lib/anthropic-generate.live.ts
// LIVE behaviour check — makes a REAL Anthropic API call using ANTHROPIC_API_KEY from env.
// Proves the pure brief core + real adapter end-to-end on SYNTHETIC data, no DB needed.
//   npx tsx --conditions=react-server --env-file=.env.local src/lib/anthropic-generate.live.ts
import { makeAnthropicGenerate } from "./anthropic-generate";
import { buildContentBrief } from "./content-brief";
import type { BrandBriefContext } from "./brand-content-read";

const brand: BrandBriefContext = {
  name: "Vireo Health Co",
  category: "Men's Health & Wellness",
  description: "A daily men's multivitamin with zinc and ashwagandha, formulated for active men.",
  approvedClaims: [
    "Supports healthy testosterone levels already within the normal range",
    "Made in a GMP-certified facility",
    "Contains clinically studied doses of zinc and ashwagandha",
  ],
};

async function main(): Promise<void> {
  try {
    const generate = makeAnthropicGenerate();
    const result = await buildContentBrief(brand, generate);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) { console.error(`\nBRIEF FAILED: ${result.reason}`); process.exit(1); }
    console.log("\nLIVE_BRIEF_OK");
  } catch (e) {
    console.error(`\nADAPTER ERROR: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
main();
