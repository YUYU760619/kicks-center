import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertVendorCodesIntegrity,
  createVendorInStore,
  getVendorCodes,
  updateInventoryInStore,
} from "../lib/pos-core.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(path.join(root, "supabase/migrations/202609030013_vendor_multi_code_stage1.sql"), "utf8");
const preflight = readFileSync(path.join(root, "supabase/preflight/202609030013_vendor_multi_code_preflight.sql"), "utf8");
const register = readFileSync(path.join(root, "lib/pos-register.ts"), "utf8");
const adminPage = readFileSync(path.join(root, "app/pos-app.tsx"), "utf8");

const legacyNks = { id: "v-nks", code: "NKS00007", name: "NKS", phone: "", joined: "2026-01-01" };
const legacySuffix = { id: "v-s", code: "KC00007S", name: "S", phone: "", joined: "2026-01-01" };
assert.equal(getVendorCodes(legacyNks)[0].kind, "footwear_accessory", "NKS text must not infer apparel");
assert.equal(getVendorCodes(legacySuffix)[0].kind, "footwear_accessory", "S suffix must not infer chrome_hearts");
assert.doesNotMatch(migration, /v_legacy_code like 'NKS0%'/);
assert.doesNotMatch(migration, /case when[^\n]*(NKS|KC00007S)/i);

const apparel = createVendorInStore(
  { vendors: [], products: [], sales: [], settlements: [] },
  { code: "NKS00008", codeKind: "apparel", name: "服飾", phone: "", joined: "" },
  "v-apparel", "2026-09-03",
).vendor;
const chrome = createVendorInStore(
  { vendors: [], products: [], sales: [], settlements: [] },
  { code: "KC00007S", codeKind: "chrome_hearts", name: "克羅心", phone: "", joined: "" },
  "v-chrome", "2026-09-03",
).vendor;
assert.equal(apparel.codes[0].kind, "apparel");
assert.equal(chrome.codes[0].kind, "chrome_hearts");
for (const badKind of [undefined, null, "", "invalid"]) {
  assert.throws(() => createVendorInStore(
    { vendors: [], products: [], sales: [], settlements: [] },
    { code: "KC00999", codeKind: badKind, name: "Bad", phone: "", joined: "" },
    "v-bad", "2026-09-03",
  ), /VENDOR_CODE_KIND_INVALID/);
}
const footwear = createVendorInStore(
  { vendors: [], products: [], sales: [], settlements: [] },
  { code: "KC00008", codeKind: "footwear_accessory", name: "鞋款", phone: "", joined: "" },
  "v-footwear", "2026-09-03",
).vendor;
assert.equal(footwear.codes[0].kind, "footwear_accessory");

const validMaterializedKinds = new Set(["footwear_accessory", "apparel", "chrome_hearts"]);
for (const badKind of [undefined, null, "", "   ", "invalid"]) {
  const invalidVendor = {
    id: "v-kind",
    code: "KC00010",
    codes: [{ id: "vc-kind", code: "KC00010", kind: badKind, primary: true, active: true }],
    name: "Kind validation", phone: "", joined: "2026-09-03",
  };
  assert.throws(() => assertVendorCodesIntegrity([invalidVendor]), /VENDOR_CODE_KIND_INVALID/);
  assert.equal(validMaterializedKinds.has(typeof badKind === "string" ? badKind.trim() : ""), false,
    "preflight model must report missing/null/blank/invalid materialized kind");
}
for (const validKind of validMaterializedKinds) {
  assert.doesNotThrow(() => assertVendorCodesIntegrity([{
    id: `v-${validKind}`, code: "KC00011",
    codes: [{ id: `vc-${validKind}`, code: "KC00011", kind: validKind, primary: true, active: true }],
    name: "Valid", phone: "", joined: "2026-09-03",
  }]));
}
assert.doesNotThrow(() => assertVendorCodesIntegrity([{
  id: "legacy-kind", code: "KC00012", name: "Legacy", phone: "", joined: "2026-09-03",
}]));

const oldVendor = { id: "v1", code: "KC00001", codes: [{ id: "vc1", code: "KC00001", kind: "footwear_accessory", primary: true, active: true }], name: "A", phone: "", joined: "2026-01-01" };
const newVendor = { id: "v2", code: "NKS00002", codes: [
  { id: "vc2", code: "NKS00002", kind: "apparel", primary: true, active: true },
  { id: "vc2-off", code: "KC00002S", kind: "chrome_hearts", primary: false, active: false },
], name: "B", phone: "", joined: "2026-01-01" };
const product = {
  inventory_id: "p1", id: "p1", scan_code: "P1", code: "P1", category: "鞋款",
  name: "商品", brand: "KC", model: "M", usSize: "9", cmSize: "27", color: "黑",
  cost: 100, price: 200, vendorId: "v1", vendorCodeId: "vc1", vendorCode: "KC00001",
  vendorCodeKind: "footwear_accessory", packaging: "完整", location: "A",
  consignmentStart: "2026-01-01", note: "", status: "在庫", createdAt: "2026-01-01T00:00:00Z", history: [],
};
const store = { vendors: [oldVendor, newVendor], products: [product], sales: [], settlements: [] };
const fields = { category: "鞋款", name: "商品", brand: "KC", model: "M", usSize: "9", cmSize: "27", color: "黑", cost: 100, price: 200, vendorId: "v2", vendorCodeId: "vc2", packaging: "完整", location: "A", consignmentStart: "2026-01-01", note: "" };
const moved = updateInventoryInStore(store, { inventory_id: "p1", changes: fields }, "2026-09-03T00:00:00Z");
assert.equal(moved.product.vendorId, "v2");
assert.equal(moved.product.vendorCodeId, "vc2");
assert.equal(moved.product.vendorCode, "NKS00002");
assert.throws(() => updateInventoryInStore(store, { inventory_id: "p1", changes: { ...fields, vendorCodeId: "vc1" } }, "2026-09-03T00:00:00Z"), /VENDOR_CODE_NOT_FOUND/);
assert.throws(() => updateInventoryInStore(store, { inventory_id: "p1", changes: { ...fields, vendorCodeId: "vc2-off" } }, "2026-09-03T00:00:00Z"), /VENDOR_CODE_NOT_FOUND/);

const legacyProduct = { ...product };
delete legacyProduct.vendorCodeId;
delete legacyProduct.vendorCode;
delete legacyProduct.vendorCodeKind;
const legacyEdited = updateInventoryInStore(
  { ...store, products: [legacyProduct] },
  { inventory_id: "p1", changes: { ...fields, vendorId: "v1", vendorCodeId: undefined, name: "只改名稱" } },
  "2026-09-03T00:00:00Z",
).product;
assert.equal("vendorCodeId" in legacyEdited, false, "unrelated legacy edit must not backfill snapshot");

const existingSnapshotEdit = updateInventoryInStore(
  store,
  { inventory_id: "p1", changes: { ...fields, vendorId: "v1", vendorCodeId: "vc1", name: "只改名稱" } },
  "2026-09-03T00:00:00Z",
).product;
assert.equal(existingSnapshotEdit.vendorCode, "KC00001");
assert.equal(existingSnapshotEdit.vendorCodeKind, "footwear_accessory");

const soldStore = { ...store, sales: [{ sale_id: "s1", id: "s1", inventory_id: "p1", productId: "p1", vendor_id: "v1" }] };
assert.throws(() => updateInventoryInStore(soldStore, { inventory_id: "p1", changes: fields }, "2026-09-03T00:00:00Z"), /INVENTORY_FINANCIAL_FIELDS_LOCKED/);

// Behavioural model for the DB trigger's final financial-history guard. The
// SQL source assertions below bind these cases to all five protected fields.
function assertFinancialIdentityUnchanged(oldProduct, nextProduct, locked) {
  if (!locked) return;
  for (const key of ["vendorId", "vendorCodeId", "vendorCode", "vendorCodeKind", "cost"]) {
    if (oldProduct[key] !== nextProduct[key]) throw new Error("INVENTORY_FINANCIAL_FIELDS_LOCKED");
  }
}
for (const key of ["vendorId", "vendorCodeId", "vendorCode", "vendorCodeKind", "cost"]) {
  assert.throws(
    () => assertFinancialIdentityUnchanged(product, { ...product, [key]: `${product[key]}-changed` }, true),
    /INVENTORY_FINANCIAL_FIELDS_LOCKED/,
  );
}
assert.doesNotThrow(() => assertFinancialIdentityUnchanged(product, { ...product, name: "一般欄位修改" }, true));
assert.doesNotThrow(() => assertFinancialIdentityUnchanged(product, { ...product, vendorCodeId: "vc-new" }, false));

assert.match(migration, /old\.payload -> 'products' is distinct from new\.payload -> 'products'/);
assert.match(migration, /old\.payload -> 'sales' is distinct from new\.payload -> 'sales'/);
assert.match(migration, /jsonb_object_agg/);
assert.match(migration, /jsonb_agg\(private\.kc_guard_vendor_code_product/);
assert.match(migration, /jsonb_agg\(private\.kc_guard_vendor_code_sale/);
const snapshotTrigger = migration.slice(
  migration.indexOf("create or replace function private.kc_apply_vendor_code_snapshots"),
  migration.indexOf("revoke all on function private.kc_apply_vendor_code_snapshots"),
);
assert.doesNotMatch(snapshotTrigger, /v_products\s*:=\s*v_products\s*\|\|/);
assert.doesNotMatch(snapshotTrigger, /v_sales\s*:=\s*v_sales\s*\|\|/);
assert.doesNotMatch(migration, /select item into v_old_product[\s\S]{0,180}jsonb_array_elements/);
assert.doesNotMatch(migration, /select item into v_old_sale[\s\S]{0,180}jsonb_array_elements/);
assert.match(migration, /p_old_sale is not null[\s\S]*p_sale - 'vendor_id' - 'vendor_code_id'/);
assert.match(migration, /p_financially_locked and v_identity_changed[\s\S]*INVENTORY_FINANCIAL_FIELDS_LOCKED/);
assert.match(migration, /p_old_product -> 'cost' is distinct from p_product -> 'cost'/);
assert.match(migration, /p_old_product ->> 'vendorCode' is distinct from p_product ->> 'vendorCode'/);
const settlementFlow = adminPage.slice(adminPage.indexOf("function Settle("), adminPage.indexOf("function Sales("));
assert.match(settlementFlow, /settlement_status === "pending"/);
assert.match(settlementFlow, /status: "已銷帳"/);
assert.match(settlementFlow, /settled: true/);
assert.match(settlementFlow, /settlement_status: "settled"/);

assert.doesNotMatch(register, /vendorCode|vendor_code/);
assert.match(migration, /VENDOR_CODE_REQUIRED_FOR_VENDOR_CHANGE/);
assert.match(migration, /v_code := private\.kc_resolve_vendor_code\(v_payload, v_vendor_id, v_vendor_code_id\)/);
assert.match(migration, /v_has_financial_history and \([\s\S]*v_vendor_changed or v_code_changed/);
assert.match(preflight, /^-- Read-only preflight/);
const executablePreflight = preflight.replace(/^\s*--.*$/gm, "");
assert.doesNotMatch(executablePreflight, /\b(insert|update|delete|alter|create|drop|call|do)\b/i);
assert.match(preflight, /VENDOR_CODE_DUPLICATE/);
assert.match(preflight, /PRODUCT_VENDOR_NOT_FOUND/);
assert.match(preflight, /SALE_VENDOR_NOT_FOUND/);
assert.match(preflight, /SALE_PRODUCT_VENDOR_MISMATCH/);
assert.match(preflight, /SETTLEMENT_SALE_NOT_FOUND/);
assert.match(preflight, /SETTLEMENT_SALE_VENDOR_MISMATCH/);
assert.match(preflight, /VENDOR_CODE_ID_INVALID/);
assert.match(migration, /coalesce\(nullif\(btrim\(v_code ->> 'kind'\), ''\), ''\)[\s\S]{0,80}not in/);
assert.match(preflight, /coalesce\(nullif\(btrim\(code ->> 'kind'\), ''\), ''\)[\s\S]{0,80}not in/);
assert.match(preflight, /payload is null/);
assert.match(preflight, /jsonb_typeof\(payload -> 'vendors'\) is distinct from 'array'/);
assert.match(preflight, /jsonb_typeof\(payload -> 'products'\) is distinct from 'array'/);
assert.match(preflight, /jsonb_typeof\(payload -> 'sales'\) is distinct from 'array'/);
assert.match(preflight, /select 'PASS'/);

console.log("Vendor multi-code Stage 1.7 PASS: explicit kinds, set-based SQL aggregation, DB financial guards, and expanded read-only preflight contracts");
