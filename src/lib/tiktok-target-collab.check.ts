import {
  buildCreateTargetCollabRequest,
  parseCreateTargetCollabResponse,
  type BuildCreateTargetCollabResult,
  type ParseCreateTargetCollabResult,
  type CreateTargetCollabArgs,
} from "./tiktok-target-collab";

let failures = 0;

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function checkBuilder(name: string, args: CreateTargetCollabArgs, want: BuildCreateTargetCollabResult): void {
  const got = buildCreateTargetCollabRequest(args);
  if (!eq(got, want)) {
    failures++;
    console.error(`FAIL ${name}`);
    console.error(`  got=${JSON.stringify(got)}`);
    console.error(`  want=${JSON.stringify(want)}`);
  } else {
    console.log(`pass ${name}`);
  }
}

function checkParser(name: string, resp: Parameters<typeof parseCreateTargetCollabResponse>[0], want: ParseCreateTargetCollabResult): void {
  const got = parseCreateTargetCollabResponse(resp);
  if (!eq(got, want)) {
    failures++;
    console.error(`FAIL ${name}`);
    console.error(`  got=${JSON.stringify(got)}`);
    console.error(`  want=${JSON.stringify(want)}`);
  } else {
    console.log(`pass ${name}`);
  }
}

const baseArgs: CreateTargetCollabArgs = {
  name: "Summer push",
  message: "hello",
  endTimeEpochSeconds: 1715654330,
  products: [{ productId: "prod-1", targetCommissionRatePercent: 20 }],
  creatorOpenIds: ["ttopen_alpha"],
  sellerContactEmail: "seller@example.com",
  freeSampleRule: { hasFreeSample: false, isSampleApprovalExempt: false },
};

checkBuilder("happy_path", baseArgs, {
  ok: true,
  method: "POST",
  path: "/affiliate_seller/202508/target_collaborations",
  body: {
    name: "Summer push",
    message: "hello",
    end_time: "1715654330",
    products: [{ id: "prod-1", target_commission_rate: 2000 }],
    creator_user_open_ids: ["ttopen_alpha"],
    seller_contact_info: { email: "seller@example.com" },
    free_sample_rule: { has_free_sample: false, is_sample_approval_exempt: false },
  },
});

const nullMessage = buildCreateTargetCollabRequest({ ...baseArgs, message: null });
if (nullMessage.ok !== true || "message" in nullMessage.body) {
  failures++;
  console.error("FAIL message_null_omitted");
  console.error(`  got=${JSON.stringify(nullMessage)}`);
} else {
  console.log("pass message_null_omitted");
}

const blankMessage = buildCreateTargetCollabRequest({ ...baseArgs, message: "   " });
if (blankMessage.ok !== true || "message" in blankMessage.body) {
  failures++;
  console.error("FAIL message_whitespace_omitted");
  console.error(`  got=${JSON.stringify(blankMessage)}`);
} else {
  console.log("pass message_whitespace_omitted");
}

checkBuilder("commission_half_percent", { ...baseArgs, products: [{ productId: "p", targetCommissionRatePercent: 0.5 }] }, {
  ok: false,
  reason: "invalid_commission_rate",
});

checkBuilder("commission_3587", { ...baseArgs, products: [{ productId: "p", targetCommissionRatePercent: 35.87 }] }, {
  ok: true,
  method: "POST",
  path: "/affiliate_seller/202508/target_collaborations",
  body: {
    name: "Summer push",
    message: "hello",
    end_time: "1715654330",
    products: [{ id: "p", target_commission_rate: 3587 }],
    creator_user_open_ids: ["ttopen_alpha"],
    seller_contact_info: { email: "seller@example.com" },
    free_sample_rule: { has_free_sample: false, is_sample_approval_exempt: false },
  },
});

checkBuilder("commission_80_ok", { ...baseArgs, products: [{ productId: "p", targetCommissionRatePercent: 80 }] }, {
  ok: true,
  method: "POST",
  path: "/affiliate_seller/202508/target_collaborations",
  body: {
    name: "Summer push",
    message: "hello",
    end_time: "1715654330",
    products: [{ id: "p", target_commission_rate: 8000 }],
    creator_user_open_ids: ["ttopen_alpha"],
    seller_contact_info: { email: "seller@example.com" },
    free_sample_rule: { has_free_sample: false, is_sample_approval_exempt: false },
  },
});

checkBuilder("commission_80_01_invalid", { ...baseArgs, products: [{ productId: "p", targetCommissionRatePercent: 80.01 }] }, {
  ok: false,
  reason: "invalid_commission_rate",
});

checkBuilder("too_many_creators", {
  ...baseArgs,
  creatorOpenIds: Array.from({ length: 51 }, (_, i) => `creator-${i}`),
}, { ok: false, reason: "too_many_creators" });

checkBuilder("no_creators", { ...baseArgs, creatorOpenIds: [] }, { ok: false, reason: "no_creators" });

checkBuilder("no_products", { ...baseArgs, products: [] }, { ok: false, reason: "no_products" });

checkBuilder("empty_product_id", { ...baseArgs, products: [{ productId: "   ", targetCommissionRatePercent: 20 }] }, {
  ok: false,
  reason: "empty_product_id",
});

checkBuilder("end_time_zero", { ...baseArgs, endTimeEpochSeconds: 0 }, { ok: false, reason: "invalid_end_time" });

checkBuilder("end_time_fractional", { ...baseArgs, endTimeEpochSeconds: 1715654330.5 }, {
  ok: false,
  reason: "invalid_end_time",
});

checkParser("parser_success", {
  code: 0,
  message: "ok",
  data: { target_collaboration: { id: "7365861555575916210" } },
}, { ok: true, collaborationId: "7365861555575916210" });

checkParser("parser_duplicate", { code: 16024022, message: "dup" }, {
  ok: false,
  errorCode: "duplicate_creator_product",
});

checkParser("parser_unknown_code", { code: 99999, message: "?" }, { ok: false, errorCode: "tiktok_99999" });

checkParser("parser_conflict", {
  code: 0,
  message: "ok",
  data: { target_collaboration_conflicts: [{ creator_open_id: "x", product_id: "y" }] },
}, { ok: false, errorCode: "collaboration_conflict" });

checkParser("parser_malformed", { code: 0, message: "ok", data: {} }, {
  ok: false,
  errorCode: "malformed_success_response",
});

if (failures > 0) {
  console.error(`\n${failures} VECTOR(S) FAILED`);
  process.exit(1);
}
console.log("\nALL_VECTORS_PASS");
