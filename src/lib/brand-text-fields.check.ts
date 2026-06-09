// Golden-vector check. Run: npx tsx src/lib/brand-text-fields.check.ts
import { BRAND_TEXT_FIELDS, isBrandTextField } from "./brand-text-fields";

let passed = 0;
let failed = 0;
function expect(name: string, got: boolean, want: boolean): void {
  if (got === want) passed++;
  else { failed++; console.error(`FAIL: ${name} — got ${got}, want ${want}`); }
}

// Valid editable keys
expect("description valid", isBrandTextField("description"), true);
expect("commission_context valid", isBrandTextField("commission_context"), true);
expect("exclusion_list valid", isBrandTextField("exclusion_list"), true);

// approved_claims deliberately NOT editable via this path
expect("approved_claims rejected", isBrandTextField("approved_claims"), false);

// Column-injection boundary: real columns must be rejected
expect("user_id rejected", isBrandTextField("user_id"), false);
expect("name rejected", isBrandTextField("name"), false);

// Edge strings
expect("empty string rejected", isBrandTextField(""), false);
expect("padded value rejected", isBrandTextField(" description "), false);

// Non-string inputs
expect("null rejected", isBrandTextField(null), false);
expect("undefined rejected", isBrandTextField(undefined), false);
expect("number rejected", isBrandTextField(123 as unknown), false);
expect("object rejected", isBrandTextField({} as unknown), false);

// Set integrity
expect("exactly 3 fields", BRAND_TEXT_FIELDS.length === 3, true);

console.log(`\n${passed}/${passed + failed} vectors passed`);
if (failed > 0) process.exit(1);
