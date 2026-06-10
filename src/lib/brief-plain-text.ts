// Pure brief -> plain-text serializer. NO server-only, NO I/O — safe in client components
// (the copy-brief button) and server code (the SEND path's composeMessage) alike, so the
// message a creator receives is byte-identical to what the operator sees on Copy. Moved
// verbatim from GenerateBriefControl.tsx; the format is locked by golden vectors — change
// it only deliberately, in lockstep with the vectors.
//
// Faithful to the brief object: hook, talking points, approved claims used, CTA, disclosure,
// and notes when present. Compliance findings are internal and deliberately omitted.

import type { ContentBrief } from "./content-brief";

export function briefToPlainText(brief: ContentBrief): string {
  const lines: string[] = [];
  lines.push("Hook", brief.hook, "");
  lines.push("Talking points");
  for (const point of brief.talkingPoints) lines.push(`- ${point}`);
  lines.push("");
  lines.push("Approved claims used");
  if (brief.approvedClaimsUsed.length === 0) {
    lines.push("None referenced");
  } else {
    for (const claim of brief.approvedClaimsUsed) lines.push(`- ${claim}`);
  }
  lines.push("");
  lines.push("Call to action", brief.callToAction, "");
  lines.push("Disclosure", brief.disclosure);
  if (brief.notes) {
    lines.push("", "Notes", brief.notes);
  }
  return lines.join("\n");
}
