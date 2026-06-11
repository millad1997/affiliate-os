// Pure golden-vector check for brand-config-route-core.ts. No server-only import;
// run with plain:  npx tsx src/lib/brand-config-route-core.check.ts
// (If this ever demands --conditions=react-server, a server-only value-import leaked in.)

import {
  handleUpdateBrandConfigRequest,
  type UpdateBrandConfigRequestHeaders,
} from "./brand-config-route-core";
import type { UpdateBrandConfigResult } from "./brand-config-write";
import type { ParsedBrandConfigFields } from "./brand-config-input-parse";

let passed = 0;
let failed = 0;
function expect(label: string, cond: boolean): void {
  if (cond) { passed++; console.log(`PASS  ${label}`); }
  else { failed++; console.log(`FAIL  ${label}`); }
}

type UpdateArgs = { brandId: string; userId: string; fields: ParsedBrandConfigFields };
function makeFakeUpdate(result: UpdateBrandConfigResult) {
  const calls: UpdateArgs[] = [];
  const update = async (args: UpdateArgs): Promise<UpdateBrandConfigResult> => {
    calls.push(args);
    return result;
  };
  return { update, calls };
}

const OK_HEADERS: UpdateBrandConfigRequestHeaders = {
  origin: "https://app.example.com",
  host: "app.example.com",
  secFetchSite: "same-origin",
};

const FULL_BODY = {
  brandId: "brand_1",
  target_category_ids: "60001, 60002",
  target_regions: "US, CA",
  min_followers: "5000",
  gate_region: true,
  gate_followers: false,
  gate_category: true,
  max_invites: "25",
  commission_rate: "12.5",
  min_gmv_floor: "1000",
};

async function main(): Promise<void> {
  // --- CSRF guard ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(
      { origin: "https://evil.com", host: "app.example.com", secFetchSite: "cross-site" },
      FULL_BODY,
      { userId: "u", update: f.update },
    );
    expect("1 cross-site -> 403 forbidden", r.status === 403 && r.body.ok === false && r.body.error === "forbidden");
    expect("1 cross-site -> update NOT called", f.calls.length === 0);
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(
      { origin: "https://sub.app.example.com", host: "app.example.com", secFetchSite: "same-site" },
      FULL_BODY,
      { userId: "u", update: f.update },
    );
    expect("2 same-site -> 403", r.status === 403 && f.calls.length === 0);
  }

  // --- Body / brandId validation ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, null, { userId: "u", update: f.update });
    expect("3 null body -> 400 invalid_request", r.status === 400 && r.body.ok === false && r.body.error === "invalid_request" && f.calls.length === 0);
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, { target_regions: "US" }, { userId: "u", update: f.update });
    expect("4 missing brandId -> 400 invalid_brand_id", r.status === 400 && r.body.ok === false && r.body.error === "invalid_brand_id" && f.calls.length === 0);
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, { brandId: "   " }, { userId: "u", update: f.update });
    expect("5 whitespace brandId -> 400 invalid_brand_id", r.status === 400 && f.calls.length === 0);
  }

  // --- Config validation errors pass through from parseBrandConfigFields ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, { brandId: "b", min_followers: "abc" }, { userId: "u", update: f.update });
    expect("6 bad min_followers -> 400 + parser error", r.status === 400 && r.body.ok === false && r.body.error === "min_followers must be a non-negative integer" && f.calls.length === 0);
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, { brandId: "b", max_invites: "1.5" }, { userId: "u", update: f.update });
    expect("7 non-integer max_invites -> 400 + parser error", r.status === 400 && r.body.ok === false && r.body.error === "max_invites must be a non-negative integer" && f.calls.length === 0);
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, { brandId: "b", commission_rate: "-1" }, { userId: "u", update: f.update });
    expect("8 negative commission_rate -> 400 + parser error", r.status === 400 && r.body.ok === false && r.body.error === "commission_rate must be a non-negative number" && f.calls.length === 0);
  }
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, { brandId: "b", min_gmv_floor: "abc" }, { userId: "u", update: f.update });
    expect("9 bad min_gmv_floor -> 400 + parser error", r.status === 400 && r.body.ok === false && r.body.error === "min_gmv_floor must be a non-negative number" && f.calls.length === 0);
  }

  // --- Valid full config: parsed correctly + forwarded ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, FULL_BODY, { userId: "u", update: f.update });
    expect("10 valid full config -> 200 ok:true", r.status === 200 && r.body.ok === true);
    expect("10 update called once", f.calls.length === 1);
    const fields = f.calls[0]?.fields;
    expect("10 target_category_ids parsed", JSON.stringify(fields?.target_category_ids) === JSON.stringify(["60001", "60002"]));
    expect("10 target_regions parsed", JSON.stringify(fields?.target_regions) === JSON.stringify(["US", "CA"]));
    expect("10 min_followers parsed", fields?.min_followers === 5000);
    expect("10 gates forwarded", fields?.gate_region === true && fields?.gate_followers === false && fields?.gate_category === true);
    expect("10 max_invites parsed", fields?.max_invites === 25);
    expect("10 commission_rate parsed", fields?.commission_rate === 12.5);
    expect("10 min_gmv_floor parsed", fields?.min_gmv_floor === 1000);
  }

  // --- Defaults flow through when config keys are blank/absent ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, { brandId: "b" }, { userId: "u", update: f.update });
    expect("11 minimal body -> 200 ok", r.status === 200 && f.calls.length === 1);
    const fields = f.calls[0]?.fields;
    expect("11 empty arrays default", JSON.stringify(fields?.target_category_ids) === "[]" && JSON.stringify(fields?.target_regions) === "[]");
    expect("11 min_followers default null", fields?.min_followers === null);
    expect("11 gate defaults (region true, others false)", fields?.gate_region === true && fields?.gate_followers === false && fields?.gate_category === false);
    expect("11 max_invites default 50", fields?.max_invites === 50);
    expect("11 commission_rate default 10", fields?.commission_rate === 10);
    expect("11 min_gmv_floor default null", fields?.min_gmv_floor === null);
    expect("11 tiktok_product_ids default []", JSON.stringify(fields?.tiktok_product_ids) === "[]");
    expect("11 seller_contact_email default null", fields?.seller_contact_email === null);
    expect("11 has_free_sample default false", fields?.has_free_sample === false);
    expect("11 is_sample_approval_exempt default false", fields?.is_sample_approval_exempt === false);
    expect("11 collaboration_duration_days default 30", fields?.collaboration_duration_days === 30);
  }

  // --- Result mapping ---
  {
    const f = makeFakeUpdate({ ok: false, reason: "brand_not_found" });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, FULL_BODY, { userId: "u", update: f.update });
    expect("12 brand_not_found -> 404", r.status === 404 && r.body.ok === false && r.body.error === "brand_not_found");
  }
  {
    const f = makeFakeUpdate({ ok: false, reason: "update_failed" });
    const r = await handleUpdateBrandConfigRequest(OK_HEADERS, FULL_BODY, { userId: "u", update: f.update });
    expect("13 update_failed -> 500", r.status === 500 && r.body.ok === false && r.body.error === "update_failed");
  }

  // --- Security provenance: userId from deps; brandId trimmed ---
  {
    const f = makeFakeUpdate({ ok: true });
    const r = await handleUpdateBrandConfigRequest(
      OK_HEADERS,
      { ...FULL_BODY, brandId: " brand_1 ", userId: "attacker" },
      { userId: "session_user", update: f.update },
    );
    expect("14 ok despite rogue body userId", r.status === 200);
    expect("14 update got session userId, not body's", f.calls[0]?.userId === "session_user");
    expect("14 update got trimmed brandId", f.calls[0]?.brandId === "brand_1");
  }

  console.log(`\nPASSED ${passed}/${passed + failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("CHECK CRASHED", e);
  process.exit(1);
});
