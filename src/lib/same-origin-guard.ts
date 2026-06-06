// src/lib/same-origin-guard.ts
//
// SECURITY: Shared same-origin guard (CSRF defense-in-depth atop the SameSite=Lax
// session cookie). Pure — no `import "server-only"`, safe under plain npx tsx.
// Extracted verbatim from invite-decision-route-core.ts so multiple write routes
// (invite-decision, brief generation, discover) share one audited implementation.
//
// Sec-Fetch-Site (when present) is the strongest signal: only same-origin and none
// (direct navigation / non-browser) are allowed. Origin (when present) must match the
// request Host (scheme-agnostic host compare). When neither header is present, allow —
// browser CSRF is additionally gated by the SameSite session cookie.

export type SameOriginHeaders = {
  origin: string | null;
  host: string | null;
  secFetchSite: string | null;
};

// Returns true if the request is allowed to proceed.
export function isSameOrigin(headers: SameOriginHeaders): boolean {
  const { origin, host, secFetchSite } = headers;
  if (secFetchSite !== null) {
    if (secFetchSite !== "same-origin" && secFetchSite !== "none") {
      return false;
    }
  }
  if (origin !== null) {
    if (host === null) return false;
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }
    if (originHost !== host) return false;
  }
  return true;
}
