// Pure golden-vector check for brand-field-route-core.ts. No server-only import;
// run with plain:  npx tsx src/lib/brand-field-route-core.check.ts
// (If this ever demands --conditions=react-server, a server-only value-import leaked in.)

import {
  handleUpdateBrandFieldRequest,
  type UpdateBrandFieldRequestHeaders,
} from "./brand-field-route-core";
import type { UpdateBrandTextFieldResult } from "./brand-content-write";
import type { BrandTextField } from "./brand-text-fields";

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

type UpdateArgs = { brandId: string; userId: string; field: BrandTextField; value: string };
function makeFakeUpdate(result: UpdateBrandTextFieldResult) {
  const calls: UpdateArgs[] = [];
  const update = async (args: UpdateArgs): Promise<UpdateBrandTextFieldResult> => {
    calls.push(args);
    return result;
  };
  return { update, calls };
}

const OK_HEADERS: UpdateBrandFieldRequestHeaders = {
  origin: "https://app.example.com",
  host: "app.example.com",
  secFetchSite: "same-origin",
};
const OK_BODY = { brandId: "brand_1", field: "description", value: "A clear description" };

async function main(): Promise<void> {
  // --- CSRF guard ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
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
    const r = await handleUpdateBrandFieldRequest(
      { origin: "https://sub.app.example.com", host: "app.example.com", secFetchSite: "same-site" },
      OK_BODY,
      { userId: "u", update: f.update },
    );
    expect("2 same-site -> 403", r.status === 403 && f.calls.length === 0);
  }

  // --- Body validation ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(OK_HEADERS, null, { userId: "u", update: f.update });
    expect(
      "3 null body -> 400 invalid_request",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_request" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
      OK_HEADERS,
      { field: "description", value: "x" },
      { userId: "u", update: f.update },
    );
    expect(
      "4 missing brandId -> 400 invalid_brand_id",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_brand_id" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
      OK_HEADERS,
      { brandId: "   ", field: "description", value: "x" },
      { userId: "u", update: f.update },
    );
    expect("5 whitespace brandId -> 400 invalid_brand_id", r.status === 400 && f.calls.length === 0);
  }

  // --- Field allowlist validation ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
      OK_HEADERS,
      { brandId: "b", value: "x" },
      { userId: "u", update: f.update },
    );
    expect(
      "6 missing field -> 400 invalid_field",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_field" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
      OK_HEADERS,
      { brandId: "b", field: "name", value: "x" },
      { userId: "u", update: f.update },
    );
    expect(
      "7 non-allowlisted field 'name' -> 400 invalid_field",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_field" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
      OK_HEADERS,
      { brandId: "b", field: "approved_claims", value: "x" },
      { userId: "u", update: f.update },
    );
    expect(
      "8 'approved_claims' rejected at generic route -> 400 invalid_field",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_field" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
      OK_HEADERS,
      { brandId: "b", field: 123, value: "x" },
      { userId: "u", update: f.update },
    );
    expect("9 non-string field -> 400 invalid_field", r.status === 400 && r.body.ok === false && r.body.error === "invalid_field" && f.calls.length === 0);
  }

  // --- Value validation ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
      OK_HEADERS,
      { brandId: "b", field: "description" },
      { userId: "u", update: f.update },
    );
    expect(
      "10 missing value -> 400 invalid_value",
      r.status === 400 && r.body.ok === false && r.body.error === "invalid_value" && f.calls.length === 0,
    );
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
      OK_HEADERS,
      { brandId: "b", field: "description", value: 123 },
      { userId: "u", update: f.update },
    );
    expect("11 non-string value -> 400 invalid_value", r.status === 400 && r.body.ok === false && r.body.error === "invalid_value" && f.calls.length === 0);
  }

  // --- Empty value allowed (clears the field) ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
      OK_HEADERS,
      { brandId: "b", field: "description", value: "" },
      { userId: "u", update: f.update },
    );
    expect("12 empty value -> 200 ok (clears)", r.status === 200 && r.body.ok === true);
    expect("12 empty value -> update called with empty string", f.calls.length === 1 && f.calls[0].value === "");
  }

  // --- Result mapping ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(OK_HEADERS, OK_BODY, { userId: "u", update: f.update });
    expect("13 ok -> 200 ok:true", r.status === 200 && r.body.ok === true);
    expect("13 ok -> update called once", f.calls.length === 1);
  }
  {
    const f = makeFakeUpdate({ ok: false, reason: "brand_not_found" });
    const r = await handleUpdateBrandFieldRequest(OK_HEADERS, OK_BODY, { userId: "u", update: f.update });
    expect("14 brand_not_found -> 404", r.status === 404 && r.body.ok === false && r.body.error === "brand_not_found");
  }
  {
    const f = makeFakeUpdate({ ok: false, reason: "update_failed" });
    const r = await handleUpdateBrandFieldRequest(OK_HEADERS, OK_BODY, { userId: "u", update: f.update });
    expect("15 update_failed -> 500", r.status === 500 && r.body.ok === false && r.body.error === "update_failed");
  }

  // --- Security provenance: userId from deps; brandId trimmed; field passed; value untrimmed ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandFieldRequest(
      OK_HEADERS,
      { brandId: " brand_1 ", field: "commission_context", value: "  keep my spacing  ", userId: "attacker" },
      { userId: "session_user", update: f.update },
    );
    expect("16 ok despite rogue body userId", r.status === 200);
    expect("16 update got session userId, not body's", f.calls.length === 1 && f.calls[0].userId === "session_user");
    expect("16 update got trimmed brandId", f.calls.length === 1 && f.calls[0].brandId === "brand_1");
    expect("16 update got field passed through", f.calls.length === 1 && f.calls[0].field === "commission_context");
    expect("16 update got value passed through untrimmed", f.calls.length === 1 && f.calls[0].value === "  keep my spacing  ");
  }

  console.log(`\nPASSED ${passed}/${passed + failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("CHECK CRASHED", e);
  process.exit(1);
});
