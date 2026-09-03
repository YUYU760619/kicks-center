import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { updateInventoryInStore } from "../lib/pos-core.ts";

const product = {
  inventory_id: "inv-1", scan_code: "KC-01061", id: "inv-1", code: "KC-01061",
  category: "鞋款", name: "Original", brand: "Nike", model: "M1", usSize: "9",
  cmSize: "27", color: "Black", cost: 1000, price: 2000, vendorId: "v1",
  location: "A-01", consignmentStart: "2026-09-01", packaging: "完整鞋盒", note: "",
  status: "在庫", createdAt: "2026-09-01T00:00:00Z",
  history: [{ at: "2026-09-01T00:00:00Z", action: "商品入庫", note: "created" }],
};
const other = { ...product, inventory_id: "inv-2", id: "inv-2", scan_code: "OTHER-01", code: "OTHER-01" };
const base = { products: [product, other], vendors: [
  { id: "v1", code: "V001", codes: [{ id: "vc1", code: "V001", kind: "footwear_accessory", primary: true, active: true }], name: "Vendor 1", phone: "", joined: "2026-01-01" },
  { id: "v2", code: "V002", codes: [{ id: "vc2", code: "V002", kind: "apparel", primary: true, active: true }], name: "Vendor 2", phone: "", joined: "2026-01-01" },
], sales: [], settlements: [] };
const changes = {
  category: "服飾", name: "Updated", brand: "Jordan", model: "M2", usSize: "10",
  cmSize: "28", color: "White", cost: 1200, price: 2300, vendorId: "v2", vendorCodeId: "vc2",
  packaging: "袋裝", location: "B-02", consignmentStart: "2026-09-02", note: "edited",
};

const edited = updateInventoryInStore(base, { inventory_id: "inv-1", changes }, "2026-09-02T01:00:00Z");
assert.equal(edited.product.name, "Updated");
assert.equal(edited.product.inventory_id, "inv-1");
assert.equal(edited.product.status, "在庫");
assert.equal(edited.product.history.length, 2);
assert.equal(edited.store.products[1], other, "unrelated inventory must not change");

const rescanned = updateInventoryInStore(base, {
  inventory_id: "inv-1", changes: { ...changes, scan_code: "  kc-00010-061  " },
  confirm_new_scan_code: "KC-00010-061",
}, "2026-09-02T02:00:00Z");
assert.equal(rescanned.product.scan_code, "KC-00010-061");
assert.equal(rescanned.product.code, "KC-00010-061");
assert.equal(rescanned.product.history.at(-1).action, "修改貨號");
assert.throws(() => updateInventoryInStore(base, {
  inventory_id: "inv-1", changes: { ...changes, scan_code: "OTHER-01" },
  confirm_new_scan_code: "OTHER-01",
}, "2026-09-02T02:00:00Z"), /SCAN_CODE_EXISTS/);
assert.throws(() => updateInventoryInStore(base, {
  inventory_id: "inv-1", changes: { ...changes, scan_code: "NEW-01" },
  confirm_new_scan_code: "WRONG",
}, "2026-09-02T02:00:00Z"), /SCAN_CODE_CONFIRMATION_MISMATCH/);

const soldStore = { ...base, sales: [{
  sale_id: "sale-1", id: "sale-1", inventory_id: "inv-1", productId: "inv-1",
  sold_at: "2026-09-02T00:00:00Z", soldAt: "2026-09-02T00:00:00Z", sold_price: 2000,
  price: 2000, return_price: 1000, cost: 1000, profit: 1000, vendor_id: "v1",
  payment_method: "現金", payment: "現金", settlement_status: "pending", discount: 0,
  settled: false,
}] };
assert.throws(() => updateInventoryInStore(soldStore, {
  inventory_id: "inv-1", changes,
}, "2026-09-02T03:00:00Z"), /INVENTORY_FINANCIAL_FIELDS_LOCKED/);
const typoFix = updateInventoryInStore(soldStore, {
  inventory_id: "inv-1", changes: { ...changes, cost: 1000, vendorId: "v1", vendorCodeId: undefined },
}, "2026-09-02T03:00:00Z");
assert.equal(typoFix.product.name, "Updated");
assert.equal(typoFix.store.sales, soldStore.sales, "sales must never be rewritten");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(path.join(root, "supabase/migrations/202609010012_admin_inventory_edit_and_restore.sql"), "utf8");
const multiCodeSql = readFileSync(path.join(root, "supabase/migrations/202609030013_vendor_multi_code_stage1.sql"), "utf8");
assert.match(sql, /create or replace function public\.kc_admin_update_inventory_item\(/);
assert.match(sql, /if not private\.kc_is_admin\(\)/);
assert.match(sql, /for update;/i);
assert.match(sql, /v_current_updated_at is distinct from p_expected_updated_at/);
assert.match(sql, /INVENTORY_EDIT_FIELD_NOT_ALLOWED/);
assert.match(sql, /INVENTORY_FINANCIAL_FIELDS_LOCKED/);
assert.match(sql, /SCAN_CODE_EXISTS/);
assert.match(sql, /'scan_code', v_new_scan_code,[\s\S]*'code', v_new_scan_code/);
assert.match(sql, /coalesce\(v_product -> 'history'[\s\S]*\|\| jsonb_build_array/);
assert.match(sql, /revoke all on function public\.kc_admin_update_inventory_item[\s\S]*from public, anon, authenticated/);
assert.match(sql, /perform private\.kc_assert_pos_financial_integrity/);
assert.match(sql, /perform private\.kc_assert_stage1_core/);
assert.match(sql, /perform set_config\([\s\S]*kc\.action_summary/);
assert.match(multiCodeSql, /'vendorId','vendorCodeId'/);
assert.match(multiCodeSql, /VENDOR_CODE_REQUIRED_FOR_VENDOR_CHANGE/);
assert.match(multiCodeSql, /private\.kc_resolve_vendor_code\(v_payload, v_vendor_id, v_vendor_code_id\)/);

console.log("Admin inventory edit PASS: atomic whitelist, immutable IDs/status/history, scan confirmation/uniqueness, financial locks, audit contract");
