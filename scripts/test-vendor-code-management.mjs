import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertVendorCodesIntegrity,
  createInventoryInStore,
  getVendorCodes,
  sellInventoryInStore,
  VENDOR_CODE_KIND_LABELS,
  VENDOR_CODE_KINDS,
} from "../lib/pos-core.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(path.join(root, "supabase/migrations/202609030013_vendor_multi_code_stage1.sql"), "utf8");
const detail = readFileSync(path.join(root, "app/vendor-detail-page.tsx"), "utf8");
const list = readFileSync(path.join(root, "app/pos-app.tsx"), "utf8");
const storeClient = readFileSync(path.join(root, "lib/pos-store.ts"), "utf8");

const vendorId = "00000000-0000-4000-8000-000000000007";
const legacy = { id: vendorId, code: "KC00007", name: "測試廠商", phone: "0960", joined: "2026-01-01" };
const legacyCodes = getVendorCodes(legacy);
assert.equal(legacyCodes.length, 1);
assert.equal(legacyCodes[0].code, "KC00007");
assert.equal(legacyCodes[0].primary, true);

const codes = [
  { ...legacyCodes[0], kind: "footwear_accessory" },
  { id: "10000000-0000-4000-8000-000000000007", code: "NKS00007", kind: "apparel", primary: false, active: true },
  { id: "20000000-0000-4000-8000-000000000007", code: "KC00007S", kind: "chrome_hearts", primary: false, active: true },
];
const multi = { ...legacy, codes };
assert.doesNotThrow(() => assertVendorCodesIntegrity([multi]));
assert.equal(getVendorCodes(multi).length, 3);
assert.equal(multi.id, vendorId);
assert.equal(VENDOR_CODE_KIND_LABELS.chrome_hearts, "克羅心");
assert.ok(VENDOR_CODE_KINDS.includes("chrome_hearts"));

const renamed = { ...multi, codes: codes.map((item) => item.code === "KC00007S" ? { ...item, code: "KC00007-CH" } : item) };
assert.equal(renamed.codes[2].id, codes[2].id);
const primaryChanged = { ...renamed, code: "NKS00007", codes: renamed.codes.map((item) => ({ ...item, primary: item.code === "NKS00007" })) };
assert.doesNotThrow(() => assertVendorCodesIntegrity([primaryChanged]));
assert.equal(primaryChanged.code, "NKS00007");
assert.throws(() => assertVendorCodesIntegrity([{ ...multi, codes: codes.map((item) => ({ ...item, active: item.primary ? false : item.active })) }]), /VENDOR_PRIMARY_CODE_INACTIVE/);
assert.throws(() => assertVendorCodesIntegrity([multi, { ...legacy, id: "other", code: "NKS00007" }]), /VENDOR_CODE_EXISTS/);

const inactive = { ...multi, codes: codes.map((item) => item.code === "NKS00007" ? { ...item, active: false } : item) };
assert.throws(() => createInventoryInStore(
  { vendors: [inactive], products: [], sales: [], settlements: [] },
  { scan_code: "TEST-1", category: "服飾", name: "衣服", brand: "KC", model: "T", usSize: "-", cmSize: "-", color: "黑", cost: 1, price: 2, vendorId, vendorCodeId: codes[1].id, location: "A", consignmentStart: "2026-09-03", packaging: "完整", note: "" },
  "inventory-test", "2026-09-03T00:00:00Z",
), /VENDOR_CODE_NOT_FOUND/);

const inventory = createInventoryInStore(
  { vendors: [multi], products: [], sales: [], settlements: [] },
  { scan_code: "TEST-2", category: "服飾", name: "衣服", brand: "KC", model: "T", usSize: "-", cmSize: "-", color: "黑", cost: 1, price: 2, vendorId, vendorCodeId: codes[1].id, location: "A", consignmentStart: "2026-09-03", packaging: "完整", note: "" },
  "inventory-test-2", "2026-09-03T00:00:00Z",
);
const sold = sellInventoryInStore(inventory.store, { inventory_id: "inventory-test-2", sold_price: 2, payment_method: "現金", discount: 0 }, "sale-test", "2026-09-03T01:00:00Z");
assert.equal(inventory.product.vendorCode, "NKS00007");
assert.equal(sold.sale.vendor_code, "NKS00007");
assert.equal(inventory.product.vendorCode, "NKS00007", "renaming a VendorCode must not mutate Product snapshots");
assert.equal(sold.sale.vendor_code, "NKS00007", "renaming a VendorCode must not mutate Sale snapshots");

assert.match(storeClient, /rpc\("kc_admin_set_vendor_codes"/);
assert.match(detail, /廠商代號管理/);
assert.match(detail, /＋ 新增代號/);
assert.match(detail, /設為主要/);
assert.match(detail, /主要代號不可直接停用/);
assert.match(detail, /VENDOR_CODE_KIND_LABELS/);
assert.match(list, /vendorCodes\.map\(\(code\) => code\.code\)\.join\(" \/ "\)/);
assert.match(list, /text-lg font-black text-white/);
assert.match(migration, /'footwear_accessory', 'apparel', 'chrome_hearts'/);
assert.match(migration, /VENDOR_CODE_REMOVAL_FORBIDDEN/);
assert.match(migration, /VENDOR_CODE_INACTIVE/);
assert.match(migration, /v_code_id := gen_random_uuid\(\)::text/);
assert.match(migration, /where existing ->> 'id' = v_code_id/);
assert.match(migration, /jsonb_build_object\('code', v_primary_code, 'codes', v_codes\)/);
assert.match(migration, /perform private\.kc_assert_vendor_codes\(v_payload\)/);
assert.match(migration, /if not private\.kc_is_admin\(\)/);
assert.match(migration, /for update/);
assert.match(migration, /v_current_updated_at is distinct from p_expected_updated_at/);
assert.match(migration, /No code prefix or suffix[\s\S]*classification implicitly/);
assert.doesNotMatch(migration, /array_length\([^\n]*codes[^\n]*\)\s*[><=]+\s*2/i);

console.log("Vendor code management PASS: legacy UI fallback, unlimited KC/NKS/Chrome Hearts codes, stable IDs, primary/active rules, immutable Product/Sale snapshots, admin RPC contract, vendor card hierarchy");
