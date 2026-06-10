// Outreach SEND adapter boundary — the seam between SEND orchestration and the mechanism that
// actually delivers outreach to a creator. The contract (OutreachSendAdapter) is a per-creator
// async call returning an EXPECTED-outcome result union (not a throw): a send batch processes
// creators independently, so one creator's failure is a normal, recordable outcome — it maps
// 1:1 onto storeSend (ok -> status 'sent' + providerRef; failure -> status 'failed' + errorCode),
// not an exception that aborts the batch. Contrast the Anthropic brief adapter, which throws
// because brief generation is a single all-or-nothing route operation.
//
// This file is PURE (no server-only, no I/O, no secrets): it defines the contract and a STUB
// implementation used until TikTok scope activation. The real signed-TikTok adapter will live in
// its own server-only module implementing the same OutreachSendAdapter type and slot into the
// same injection seam — orchestration never changes. errorCode is always a generic machine code,
// never a secret or raw provider payload.

export type OutreachSendInput = {
  creatorOpenId: string;
  message: string;
};

export type OutreachSendResult =
  | { ok: true; providerRef: string | null }
  | { ok: false; errorCode: string };

export type OutreachSendAdapter = (input: OutreachSendInput) => Promise<OutreachSendResult>;

export type StubSendAdapterDeps = {
  // Creators whose send should return a failure result — exercises the failed path in tests.
  failFor?: ReadonlySet<string>;
  // Prefix for the synthetic providerRef on success (default "stub").
  providerRefPrefix?: string;
};

// Stub adapter: succeeds for every creator by default, returning a synthetic providerRef. Any
// creatorOpenId in `failFor` returns a failure result instead. No I/O — deterministic, for use
// until the live TikTok write path is enabled.
export function makeStubSendAdapter(deps: StubSendAdapterDeps = {}): OutreachSendAdapter {
  const failFor = deps.failFor ?? new Set<string>();
  const prefix = deps.providerRefPrefix ?? "stub";
  return async (input: OutreachSendInput): Promise<OutreachSendResult> => {
    if (failFor.has(input.creatorOpenId)) {
      return { ok: false, errorCode: "stub_forced_failure" };
    }
    return { ok: true, providerRef: `${prefix}:${input.creatorOpenId}` };
  };
}
