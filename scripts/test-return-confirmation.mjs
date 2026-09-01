import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { returnInventoryInStore } from "../lib/pos-core.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(projectRoot, "supabase/migrations/202609010011_inventory_return_and_vendor_accounts.sql"),
  "utf8",
);
const page = readFileSync(path.join(projectRoot, "app/pos-app.tsx"), "utf8");
const storeClient = readFileSync(path.join(projectRoot, "lib/pos-store.ts"), "utf8");

assert.match(page, /setReturnPending\(true\)/);
assert.match(page, /目前尚未修改任何資料/);
assert.match(page, /確認取回/);
for (const label of ["貨號", "商品名稱", "尺寸", "寄賣廠商"]) assert.match(page, new RegExp(label));
assert.match(page, /setReturnPending\(false\)/);
assert.doesNotMatch(page, /update\(\{ status: "已取回" \}/);

assert.match(storeClient, /rpc\("kc_admin_return_inventory_item"/);
assert.match(storeClient, /p_inventory_id: input\.inventory_id/);
assert.match(storeClient, /p_expected_updated_at: expectedUpdatedAt/);
assert.match(migration, /if not private\.kc_is_admin\(\)/);
assert.match(migration, /for update/);
assert.match(migration, /v_current_updated_at is distinct from p_expected_updated_at/);
assert.match(migration, /INVENTORY_NOT_AVAILABLE/);
assert.match(migration, /INVENTORY_HAS_FINANCIAL_HISTORY/);
assert.match(migration, /coalesce\(product -> 'history', '\[\]'::jsonb\) \|\| jsonb_build_array/);
assert.match(migration, /'action', '商品取回'/);
assert.equal((migration.match(/update public\.kc_pos_state/g) || []).length, 1);

const product = {
  inventory_id: "inventory-return-001",
  scan_code: "KC-01061",
  id: "inventory-return-001",
  code: "KC-01061",
  name: "Return Test",
  status: "在庫",
  history: [{ at: "2026-08-01T00:00:00.000Z", action: "商品入庫", note: "A-01" }],
};
const otherProduct = {
  ...product,
  inventory_id: "inventory-keep-002",
  scan_code: "KC00010-061",
  id: "inventory-keep-002",
  code: "KC00010-061",
};
const store = { products: [product, otherProduct], vendors: [], sales: [], settlements: [] };
const original = structuredClone(store);

// Opening/cancelling the UI does not call the pure mutation; the source state
// remains byte-for-byte unchanged until the explicit confirmation operation.
assert.deepEqual(store, original);
const returnedAt = "2026-09-01T12:00:00.000Z";
const result = returnInventoryInStore(store, { inventory_id: product.inventory_id }, returnedAt);
assert.equal(result.product.status, "已取回");
assert.equal(result.product.history.length, 2);
assert.deepEqual(result.product.history[0], product.history[0]);
assert.deepEqual(result.product.history[1], {
  at: returnedAt,
  action: "商品取回",
  note: "寄賣人取回商品",
});
assert.deepEqual(result.store.products[1], otherProduct);
assert.deepEqual(store, original);

assert.throws(
  () => returnInventoryInStore({ ...store, sales: [{ inventory_id: product.inventory_id }] }, { inventory_id: product.inventory_id }, returnedAt),
  /INVENTORY_HAS_FINANCIAL_HISTORY/,
);
assert.throws(
  () => returnInventoryInStore({ ...store, products: [{ ...product, status: "已售出" }] }, { inventory_id: product.inventory_id }, returnedAt),
  /INVENTORY_NOT_AVAILABLE/,
);

console.log("Inventory return confirmation regression PASS: cancel is inert, confirmation is atomic, history is append-only");
