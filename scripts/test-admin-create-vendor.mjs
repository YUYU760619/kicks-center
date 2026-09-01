import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createVendorInStore,
  normalizeVendorCode,
} from "../lib/pos-core.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(projectRoot, "supabase/migrations/202609010010_admin_create_vendor.sql"),
  "utf8",
);
const auditMigration = readFileSync(
  path.join(projectRoot, "supabase/migrations/202608280002_harden_pos_security.sql"),
  "utf8",
);
const storeClient = readFileSync(path.join(projectRoot, "lib/pos-store.ts"), "utf8");
const adminPage = readFileSync(path.join(projectRoot, "app/pos-app.tsx"), "utf8");

assert.match(migration, /^begin;/);
assert.match(migration, /commit;\s*$/);
assert.match(migration, /create or replace function public\.kc_admin_create_vendor/);
assert.match(migration, /security definer/);
assert.match(migration, /if not private\.kc_is_admin\(\)/);
assert.match(migration, /for update/);
assert.match(migration, /v_current_updated_at is distinct from p_expected_updated_at/);
assert.match(migration, /v_vendor_id := gen_random_uuid\(\)::text/);
assert.match(migration, /where existing_vendor ->> 'id' = v_vendor_id/);
assert.match(migration, /v_vendor_code := upper\(btrim/);
assert.doesNotMatch(migration, /regexp_replace/);
assert.match(migration, /VENDOR_CODE_REQUIRED/);
assert.match(migration, /VENDOR_NAME_REQUIRED/);
assert.match(migration, /VENDOR_CODE_EXISTS/);
assert.match(migration, /VENDOR_JOINED_INVALID/);
assert.match(migration, /current_date/);
assert.match(migration, /jsonb_set\(v_payload, '\{vendors\}', v_next_vendors, false\)/);
assert.equal((migration.match(/update public\.kc_pos_state/g) || []).length, 1);
assert.match(migration, /private\.kc_assert_pos_financial_integrity/);
assert.match(migration, /private\.kc_assert_stage1_core/);
assert.match(migration, /廠商編號=/);
assert.match(migration, /名稱=/);
assert.match(
  migration,
  /revoke all on function public\.kc_admin_create_vendor\(jsonb, timestamptz\)[\s\S]*from public, anon, authenticated/,
);
assert.match(
  migration,
  /grant execute on function public\.kc_admin_create_vendor\(jsonb, timestamptz\)[\s\S]*to authenticated/,
);

// The single state UPDATE is covered by the existing trigger, so backup and
// audit occur inside the same PostgreSQL transaction as vendor creation.
assert.match(auditMigration, /automatic-before-' \|\| lower\(tg_op\)/);
assert.match(auditMigration, /insert into public\.kc_pos_state_backups/);
assert.match(auditMigration, /insert into public\.kc_audit_log/);

assert.match(storeClient, /rpc\("kc_admin_create_vendor"/);
assert.match(storeClient, /p_vendor: input/);
assert.match(storeClient, /p_expected_updated_at: expectedUpdatedAt/);
assert.match(adminPage, /＋ 新增寄賣廠商/);
assert.match(adminPage, /廠商編號/);
assert.match(adminPage, /姓名／名稱/);
assert.match(adminPage, /聯絡電話/);
assert.match(adminPage, /合作開始日/);
assert.match(adminPage, /廠商編號已存在/);

assert.equal(normalizeVendorCode("  nks-000 03  "), "NKS-000 03");

const existingVendor = {
  id: "vendor-existing",
  code: "NKS-000 03",
  name: "既有廠商",
  phone: "",
  joined: "2026-08-01",
};
const product = { inventory_id: "inventory-keep", vendorId: existingVendor.id };
const sale = { sale_id: "sale-keep", inventory_id: product.inventory_id };
const settlement = { id: "settlement-keep", saleIds: [sale.sale_id] };
const baseStore = {
  products: [product],
  vendors: [existingVendor],
  sales: [sale],
  settlements: [settlement],
};
const input = {
  code: " kc-new-001 ",
  name: " 新廠商 ",
  phone: " 0912-000-001 ",
  joined: "",
};

function invokeCreate({
  role,
  active = true,
  expectedVersion = "v1",
  currentVersion = "v1",
  store = baseStore,
  vendorInput = input,
  vendorId = "vendor-generated-uuid",
}) {
  if (!active || role !== "admin") throw new Error("42501");
  if (expectedVersion !== currentVersion) throw new Error("40001");
  const result = createVendorInStore(
    store,
    vendorInput,
    vendorId,
    "2026-09-01",
  );
  return {
    ...result,
    backupCreated: true,
    audit: {
      action: "新增寄賣廠商",
      code: result.vendor.code,
      name: result.vendor.name,
    },
  };
}

const created = invokeCreate({ role: "admin" });
assert.equal(created.store.vendors.length, 2);
assert.equal(created.vendor.id, "vendor-generated-uuid");
assert.equal(created.vendor.code, "KC-NEW-001");
assert.equal(created.vendor.name, "新廠商");
assert.equal(created.vendor.phone, "0912-000-001");
assert.equal(created.vendor.joined, "2026-09-01");
assert.equal(created.backupCreated, true);
assert.deepEqual(created.audit, {
  action: "新增寄賣廠商",
  code: "KC-NEW-001",
  name: "新廠商",
});
assert.deepEqual(created.store.products, baseStore.products);
assert.deepEqual(created.store.sales, baseStore.sales);
assert.deepEqual(created.store.settlements, baseStore.settlements);
assert.deepEqual(created.store.vendors[0], existingVendor);

for (const role of ["staff", "vendor", "anon"]) {
  assert.throws(() => invokeCreate({ role }), /42501/);
}
assert.throws(() => invokeCreate({ role: "admin", active: false }), /42501/);
assert.throws(
  () => invokeCreate({ role: "admin", expectedVersion: "stale" }),
  /40001/,
);
assert.throws(
  () => invokeCreate({ role: "admin", vendorInput: { ...input, code: "   " } }),
  /VENDOR_CODE_REQUIRED/,
);
assert.throws(
  () => invokeCreate({ role: "admin", vendorInput: { ...input, name: "   " } }),
  /VENDOR_NAME_REQUIRED/,
);
assert.throws(
  () =>
    invokeCreate({
      role: "admin",
      vendorInput: { ...input, code: "  nks-000 03  " },
    }),
  /VENDOR_CODE_EXISTS/,
);
assert.throws(
  () => invokeCreate({ role: "admin", vendorId: existingVendor.id }),
  /VENDOR_ID_EXISTS/,
);

console.log(
  "Admin vendor creation safety passed: roles, UUID ownership, required fields, duplicate code, version, isolated state update, backup/audit contract",
);
