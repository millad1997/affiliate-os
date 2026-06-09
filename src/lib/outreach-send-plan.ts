// Pure send-plan core. NO I/O, NO server-only import — safe to import anywhere and to
// exercise under plain `npx tsx`. This unit is the SAFETY SPINE of the (irreversible) SEND
// path: it is the single place that decides who actually gets messaged. It guarantees two
// invariants, both locked by golden vectors:
//   1. ONLY APPROVED are ever eligible. A creator that is rejected, pending (absent from
//      `decisions`), or otherwise not explicitly approved NEVER appears in `toSend`.
//   2. NEVER TWICE. A creator already present in `sentCreatorOpenIds` is excluded from
//      `toSend` and reported in `alreadySent` instead (idempotency skip).
// Output order follows plan rank (the order of `planCreatorOpenIds`), so the send batch and
// any operator-facing preview are deterministic. `alreadySent` likewise only ever contains
// approved creators — a stray sent id that was never approved (or is not in the plan) is
// ignored entirely, never silently "sent".

import type { InviteDecisionValue } from "./invite-decisions";

export type SendPlan = {
  toSend: string[];
  alreadySent: string[];
};

export function buildSendPlan(args: {
  planCreatorOpenIds: ReadonlyArray<string>;
  decisions: ReadonlyArray<{ creatorOpenId: string; decision: InviteDecisionValue }>;
  sentCreatorOpenIds: ReadonlyArray<string>;
}): SendPlan {
  const approved = new Set(
    args.decisions
      .filter((d) => d.decision === "approved")
      .map((d) => d.creatorOpenId),
  );
  const sent = new Set(args.sentCreatorOpenIds);

  const toSend: string[] = [];
  const alreadySent: string[] = [];

  for (const creatorOpenId of args.planCreatorOpenIds) {
    if (!approved.has(creatorOpenId)) continue; // invariant 1: only approved
    if (sent.has(creatorOpenId)) {
      alreadySent.push(creatorOpenId); // invariant 2: never twice
    } else {
      toSend.push(creatorOpenId);
    }
  }

  return { toSend, alreadySent };
}
