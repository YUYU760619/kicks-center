import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertVendorCodesIntegrity,
  createInventoryInStore,
  createVendorInStore,
  getProductVendorCode,
  getSaleVendorCode,
  getVendorCodes,
  normalizeVendorCode,
  sellInventoryInStore,
} from "../lib/pos-core.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/202609030013_vendor_multi_code_stage1.sql"),
  "utf8",
);
const register = readFileSync(path.join(root, "lib/pos-register.ts"), "utf8");

const legacyVendor = {
  id: "00000000-0000-4000-8000-000000000008",
  code: "KC00008",
  name: "路易",
  phone: "",
  joined: "2026-01-01",
};
const legacyCodes = getVendorCodes(legacyVendor);
assert.equal(legacyCodes.length, 1);
assert.equal(legacyCodes[0].id, legacyVendor.id);
assert.equal(legacyCodes[0].code, "KC00008");
assert.equal(legacyCodes[0].primary, true);

const multiVendor = {
  ...legacyVendor,
  codes: [
    { id: "10000000-0000-4000-8000-000000000008", code: "KC00008", kind: "footwear_accessory", primary: true, active: true },
    { id: "20000000-0000-4000-8000-000000000008", code: "NKS00008", kind: "apparel", primary: false, active: true },
  ],
};
assert.doesNotThrow(() => assertVendorCodesIntegrity([multiVendor]));
assert.equal(getVendorCodes(multiVendor).length, 2);
assert.equal(normalizeVendorCode("  kc-01061  "), "KC-01061");
assert.notEqual(normalizeVendorCode("KC-01061"), normalizeVendorCode("KC00010-061"));

assert.throws(() => assertVendorCodesIntegrity([
  multiVendor,
  { ...legacyVendor, id: "other", code: "NKS00008", codes: undefined },
]), /VENDOR_CODE_EXISTS/);
assert.throws(() => assertVendorCodesIntegrity([{
  ...multiVendor,
  codes: multiVendor.codes.map((entry) => ({ ...entry, primary: true })),
}]), /VENDOR_PRIMARY_CODE_INVALID/);
assert.throws(() => assertVendorCodesIntegrity([{
  ...multiVendor,
  code: "NKS00008",
}]), /VENDOR_PRIMARY_CODE_MISMATCH/);

const createdVendor = createVendorInStore(
  { products: [], sales: [], settlements: [], vendors: [] },
  { code: " kc00009 ", codeKind: "footwear_accessory", name: "新廠商", phone: "", joined: "" },
  "00000000-0000-4000-8000-000000000009",
  "2026-09-03",
).vendor;
assert.equal(createdVendor.codes?.length, 1);
assert.equal(createdVendor.codes?.[0].code, "KC00009");
assert.equal(createdVendor.codes?.some((entry) => entry.code === "NKS00009"), false);

const baseStore = { products: [], sales: [], settlements: [], vendors: [multiVendor] };
const input = {
  scan_code: " KC-SHOE-001 ", category: "鞋款", name: "鞋", brand: "Nike", model: "A",
  usSize: "9", cmSize: "27", color: "Black", cost: 1000, price: 2000,
  vendorId: multiVendor.id, vendorCodeId: multiVendor.codes[1].id, location: "A-01",
  consignmentStart: "2026-09-03", packaging: "完整鞋盒", note: "",
};
const inventory = createInventoryInStore(baseStore, input, "inventory-1", "2026-09-03T00:00:00Z");
assert.equal(inventory.product.vendorCodeId, multiVendor.codes[1].id);
assert.equal(inventory.product.vendorCode, "NKS00008");
assert.equal(inventory.product.vendorCodeKind, "apparel");

const legacyProduct = { ...inventory.product };
delete legacyProduct.vendorCodeId;
delete legacyProduct.vendorCode;
delete legacyProduct.vendorCodeKind;
assert.equal(getProductVendorCode(legacyProduct, legacyVendor).code, legacyVendor.code);

const sold = sellInventoryInStore(inventory.store, {
  inventory_id: inventory.product.inventory_id,
  sold_price: 1800,
  payment_method: "現金",
  discount: 200,
}, "sale-1", "2026-09-03T01:00:00Z");
assert.equal(sold.sale.vendor_code_id, multiVendor.codes[1].id);
assert.equal(sold.sale.vendor_code, "NKS00008");
assert.equal(sold.sale.vendor_code_kind, "apparel");
assert.equal(getSaleVendorCode(sold.sale, inventory.product, multiVendor).code, "NKS00008");

assert.match(migration, /^begin;/);
assert.match(migration, /commit;\s*$/);
assert.match(migration, /create or replace function private\.kc_assert_vendor_codes/);
assert.match(migration, /create or replace function public\.kc_admin_set_vendor_codes/);
assert.match(migration, /create or replace function public\.kc_admin_set_inventory_vendor_code/);
assert.match(migration, /create or replace function public\.kc_admin_create_vendor/);
assert.match(migration, /if not private\.kc_is_admin\(\)/);
assert.match(migration, /for update/);
assert.match(migration, /security definer/g);
assert.match(migration, /set search_path = ''/g);
assert.match(migration, /kc_pos_state_00_vendor_code_guard_trigger/);
assert.match(migration, /kc_staff_create_inventory_item, kc_pos_complete_sale, and[\s\S]*kc_pos_complete_cart_sale RPCs/);
assert.match(migration, /'vendorCodeId'/);
assert.match(migration, /'vendor_code_id'/);
assert.match(migration, /v_product ->> 'vendorCodeId'/);
assert.match(migration, /jsonb_agg\(private\.kc_guard_vendor_code_sale/);
assert.match(migration, /Do not backfill untouched legacy Product\/Sale snapshots|Do not backfill untouched legacy products|Do not backfill untouched legacy sales/i);
assert.match(migration, /revoke all on function public\.kc_admin_set_vendor_codes[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.kc_admin_set_vendor_codes[\s\S]*to authenticated/);
assert.match(migration, /grant execute on function public\.kc_admin_set_inventory_vendor_code[\s\S]*to authenticated/);

// Staff input contracts remain inventory/price-only. Vendor identity and code
// fields cannot be supplied by the browser and are copied by the DB guard.
assert.doesNotMatch(register, /vendor_code|vendorCode|vendor_id/);
assert.match(register, /p_items: input\.items/);
assert.match(register, /p_inventory_id: input\.inventory_id/);
assert.doesNotMatch(migration, /create or replace function public\.kc_admin_create_settlement/);

console.log("Vendor multi-code Stage 1 PASS: legacy fallback, global uniqueness, primary integrity, Product/Sale snapshots, no inferred NKS, DB-owned Staff snapshots");
