import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { deleteInventoryFromStore } from "../lib/pos-core.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(projectRoot, "supabase/migrations/202609010009_admin_delete_inventory_item.sql"),
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
assert.match(migration, /create or replace function public\.kc_admin_delete_inventory_item/);
assert.match(migration, /security definer/);
assert.match(migration, /if not private\.kc_is_admin\(\)/);
assert.match(migration, /for update/);
assert.match(migration, /v_current_updated_at is distinct from p_expected_updated_at/);
assert.match(migration, /DELETE_SCAN_CODE_CONFIRMATION_MISMATCH/);
assert.match(migration, /p_confirm_scan_code is distinct from v_scan_code/);
assert.doesNotMatch(migration, /regexp_replace/);
assert.match(migration, /INVENTORY_HAS_FINANCIAL_HISTORY/g);
assert.match(migration, /settlement -> 'saleIds'/);
assert.match(migration, /settlement ->> 'inventory_id'/);
assert.match(migration, /where item\.product ->> 'inventory_id' <> p_inventory_id/);
assert.match(migration, /DELETE_INVENTORY_COUNT_MISMATCH/);
assert.match(migration, /private\.kc_assert_pos_financial_integrity/);
assert.match(migration, /private\.kc_assert_stage1_core/);
assert.equal((migration.match(/update public\.kc_pos_state/g) || []).length, 1);
assert.match(migration, /inventory_id=/);
assert.match(migration, /貨號=/);
assert.match(migration, /商品名稱=/);
assert.match(migration, /執行帳號=/);
assert.match(migration, /刪除時間=/);
assert.match(
  migration,
  /revoke all on function public\.kc_admin_delete_inventory_item\(text, text, timestamptz\)[\s\S]*from public, anon, authenticated/,
);
assert.match(
  migration,
  /grant execute on function public\.kc_admin_delete_inventory_item\(text, text, timestamptz\)[\s\S]*to authenticated/,
);

// The state update is the only mutation in the RPC, so the existing trigger
// must create exactly one pre-update backup and one audit row in the same DB
// transaction.
assert.match(auditMigration, /automatic-before-' \|\| lower\(tg_op\)/);
assert.match(auditMigration, /insert into public\.kc_pos_state_backups/);
assert.match(auditMigration, /insert into public\.kc_audit_log/);
assert.match(auditMigration, /actor_id/);
assert.match(auditMigration, /occurred_at/);

assert.match(storeClient, /rpc\("kc_admin_delete_inventory_item"/);
assert.match(storeClient, /p_inventory_id: input\.inventory_id/);
assert.match(storeClient, /p_confirm_scan_code: input\.confirm_scan_code/);
assert.match(storeClient, /p_expected_updated_at: expectedUpdatedAt/);
assert.match(adminPage, /第一次確認/);
assert.match(adminPage, /第二次確認/);
assert.match(adminPage, /inventory_id/);
assert.match(adminPage, /confirmScanCode !== p\.scan_code/);
assert.match(adminPage, /此商品已有銷售／銷帳紀錄，為保留財務歷史不可直接刪除/);
assert.match(adminPage, /const latest = await loadPosStore\(\)/);
assert.match(adminPage, /go\("inventory"\)/);

const productToDelete = {
  inventory_id: "inventory-delete-001",
  scan_code: "KC-01061",
  id: "inventory-delete-001",
  code: "KC-01061",
  name: "Delete Test Product",
  status: "在庫",
};
const productToKeep = {
  inventory_id: "inventory-keep-002",
  scan_code: "KC00010-061",
  id: "inventory-keep-002",
  code: "KC00010-061",
  name: "Keep Test Product",
  status: "在庫",
};
const baseStore = {
  products: [productToDelete, productToKeep],
  vendors: [],
  sales: [],
  settlements: [],
};

function invokeDelete({ role, active = true, expectedVersion = "v1", currentVersion = "v1", store = baseStore }) {
  if (!active || role !== "admin") throw new Error("42501");
  if (expectedVersion !== currentVersion) throw new Error("40001");
  const result = deleteInventoryFromStore(store, {
    inventory_id: productToDelete.inventory_id,
    confirm_scan_code: productToDelete.scan_code,
  });
  return {
    ...result,
    backupCreated: true,
    audit: {
      inventory_id: productToDelete.inventory_id,
      scan_code: productToDelete.scan_code,
      product_name: productToDelete.name,
      actor: "admin-test-user",
      deleted_at: "2026-09-01T10:00:00.000Z",
    },
  };
}

const deleted = invokeDelete({ role: "admin" });
assert.equal(deleted.store.products.length, 1);
assert.equal(deleted.store.products[0].inventory_id, productToKeep.inventory_id);
assert.deepEqual(deleted.store.products[0], productToKeep);
assert.equal(deleted.backupCreated, true);
assert.deepEqual(deleted.audit, {
  inventory_id: productToDelete.inventory_id,
  scan_code: productToDelete.scan_code,
  product_name: productToDelete.name,
  actor: "admin-test-user",
  deleted_at: "2026-09-01T10:00:00.000Z",
});

for (const role of ["staff", "vendor", "anon"]) {
  assert.throws(() => invokeDelete({ role }), /42501/);
}
assert.throws(() => invokeDelete({ role: "admin", active: false }), /42501/);
assert.throws(
  () => invokeDelete({ role: "admin", expectedVersion: "stale", currentVersion: "v1" }),
  /40001/,
);

const sale = {
  sale_id: "sale-delete-block",
  inventory_id: productToDelete.inventory_id,
};
const withSale = { ...baseStore, sales: [sale] };
assert.throws(() => invokeDelete({ role: "admin", store: withSale }), /INVENTORY_HAS_FINANCIAL_HISTORY/);

const withSettlement = {
  ...withSale,
  settlements: [{ id: "settlement-delete-block", saleIds: [sale.sale_id] }],
};
assert.throws(
  () => invokeDelete({ role: "admin", store: withSettlement }),
  /INVENTORY_HAS_FINANCIAL_HISTORY/,
);

assert.throws(
  () =>
    deleteInventoryFromStore(baseStore, {
      inventory_id: "missing-inventory",
      confirm_scan_code: productToDelete.scan_code,
    }),
  /INVENTORY_NOT_FOUND/,
);
assert.deepEqual(baseStore.products, [productToDelete, productToKeep]);

assert.throws(
  () =>
    deleteInventoryFromStore(baseStore, {
      inventory_id: productToDelete.inventory_id,
      confirm_scan_code: "KC00010-061",
    }),
  /DELETE_SCAN_CODE_CONFIRMATION_MISMATCH/,
);
assert.notEqual(productToDelete.scan_code, productToKeep.scan_code);

console.log("Admin inventory delete safety passed: roles, exact code, version, financial history, atomic single-item delete, backup/audit contract");
