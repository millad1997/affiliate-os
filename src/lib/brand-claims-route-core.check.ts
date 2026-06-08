// Pure golden-vector check for brand-claims-route-core.ts. No server-only import;
// run with plain:  npx tsx src/lib/brand-claims-route-core.check.ts
// (If this ever demands --conditions=react-server, a server-only value-import leaked in.)

import {
  handleUpdateBrandClaimsRequest,
  type UpdateBrandClaimsRequestHeaders,
} from "./brand-claims-route-core";
import type { UpdateBrandApprovedClaimsResult } from "./brand-content-write";

let passed = 0;
let failed = 0;
function expect(label: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}`);
  }
}

type UpdateArgs = { brandId: string; userId: string; approvedClaims: string };
function makeFakeUpdate(result: UpdateBrandApprovedClaimsResult) {
  const calls: UpdateArgs[] = [];
  const update = async (args: UpdateArgs): Promise<UpdateBrandApprovedClaimsResult> => {
    calls.push(args);
    return result;
  };
  return { update, calls };
}

const OK_HEADERS: UpdateBrandClaimsRequestHeaders = {
  origin: "https://app.example.com",
  host: "app.example.com",
  secFetchSite: "same-origin",
};
const OK_BODY = { brandId: "brand_1", approvedClaims: "Claim one\nClaim two" };

async function main(): Promise<void> {
  // --- CSRF guard ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandClaimsRequest(
      { origin: "https://evil.com", host: "app.example.com", secFetchSite: "cross-site" },
      OK_BODY,
      { userId: "u", update: f.update },
    );
    expect(
      "1 cross-site -> 403 forbidden",
      r.status === 403 && r.body.ok === false && r.body.error === "forbidden",
    );
    expect("1 cross-site -> update NOT called", f.calls.length === 0);
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandClaimsRequest(
      { origin: "https://sub.app.example.com", host: "app.example.com", secFetchSite: "same-site" },
      OK_BODY,
      { userId: "u", update: f.update },
    );
    expect("2 same-site -> 403", r.status === 403 && f.calls.length === 0);
  }

  // --- Body validation ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandClaimsRequest(OK_HEADERS, null, { userId: "u", update: f.update });
    expect(
      "3 null body -> 400 invalid_request",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_request" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandClaimsRequest(
      OK_HEADERS,
      { approvedClaims: "x" },
      { userId: "u", update: f.update },
    );
    expect(
      "4 missing brandId -> 400 invalid_brand_id",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_brand_id" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandClaimsRequest(
      OK_HEADERS,
      { brandId: "   ", approvedClaims: "x" },
      { userId: "u", update: f.update },
    );
    expect("5 whitespace brandId -> 400 invalid_brand_id", r.status === 400 && f.calls.length === 0);
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandClaimsRequest(
      OK_HEADERS,
      { brandId: "b", approvedClaims: 123 },
      { userId: "u", update: f.update },
    );
    expect(
      "6 non-string approvedClaims -> 400 invalid_approved_claims",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_approved_claims" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandClaimsRequest(
      OK_HEADERS,
      { brandId: "b" },
      { userId: "u", update: f.update },
    );
    expect(
      "7 missing approvedClaims -> 400 invalid_approved_claims",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_approved_claims" && f.calls.length === 0,
    );
  }

  // --- Empty claims is allowed (clears the library) ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandClaimsRequest(
      OK_HEADERS,
      { brandId: "b", approvedClaims: "" },
      { userId: "u", update: f.update },
    );
    expect("8 empty approvedClaims -> 200 ok (clears)", r.status === 200 && r.body.ok === true);
    expect("8 empty approvedClaims -> update called with empty string", f.calls.length === 1 && f.calls[0].approvedClaims === "");
  }

  // --- Result mapping ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandClaimsRequest(OK_HEADERS, OK_BODY, { userId: "u", update: f.update });
    expect("9 ok -> 200 ok:true", r.status === 200 && r.body.ok === true);
    expect("9 ok -> update called once", f.calls.length === 1);
  }
  {
    const f = makeFakeUpdate({ ok: false, reason: "brand_not_found" });
    const r = await handleUpdateBrandClaimsRequest(OK_HEADERS, OK_BODY, { userId: "u", update: f.update });
    expect("10 brand_not_found -> 404", r.status === 404 && r.body.ok === false && r.body.error === "brand_not_found");
  }
  {
    const f = makeFakeUpdate({ ok: false, reason: "update_failed" });
    const r = await handleUpdateBrandClaimsRequest(OK_HEADERS, OK_BODY, { userId: "u", update: f.update });
    expect("11 update_failed -> 500", r.status === 500 && r.body.ok === false && r.body.error === "update_failed");
  }

  // --- Security provenance: userId from deps; brandId trimmed; approvedClaims passed through ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandClaimsRequest(
      OK_HEADERS,
      { brandId: " brand_1 ", approvedClaims: "  keep my spacing  ", userId: "attacker" },
      { userId: "session_user", update: f.update },
    );
    expect("12 ok despite rogue body userId", r.status === 200);
    expect("12 update got session userId, not body's", f.calls.length === 1 && f.calls[0].userId === "session_user");
    expect("12 update got trimmed brandId", f.calls.length === 1 && f.calls[0].brandId === "brand_1");
    expect("12 update got approvedClaims passed through untrimmed", f.calls.length === 1 && f.calls[0].approvedClaims === "  keep my spacing  ");
  }

  console.log(`\nPASSED ${passed}/${passed + failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("CHECK CRASHED", e);
  process.exit(1);
});
