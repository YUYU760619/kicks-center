import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { restoreInventoryInStore } from "../lib/pos-core.ts";

const returned = {
  inventory_id: "inv-r", scan_code: "KC-R-001", id: "inv-r", code: "KC-R-001",
  category: "鞋款", name: "Returned", brand: "ASICS", model: "R1", usSize: "8",
  cmSize: "26", color: "Grey", cost: 1000, price: 1800, vendorId: "v1", location: "A-01",
  consignmentStart: "2026-09-01", packaging: "完整鞋盒", note: "", status: "已取回",
  createdAt: "2026-09-01T00:00:00Z",
  history: [{ at: "2026-09-01T01:00:00Z", action: "商品取回", note: "寄賣人取回商品" }],
};
const other = { ...returned, inventory_id: "inv-other", id: "inv-other", scan_code: "OTHER", code: "OTHER", status: "在庫" };
const store = { products: [returned, other], vendors: [], sales: [], settlements: [] };
const restored = restoreInventoryInStore(store, { inventory_id: "inv-r" }, "2026-09-02T01:00:00Z");
assert.equal(restored.product.status, "在庫");
assert.equal(restored.product.history[0].action, "商品取回");
assert.equal(restored.product.history.at(-1).action, "取消取回／恢復在庫");
assert.equal(restored.store.products[1], other, "other inventory must not change");
assert.throws(() => restoreInventoryInStore({ ...store, products: [{ ...returned, status: "在庫" }, other] }, { inventory_id: "inv-r" }, "2026-09-02T01:00:00Z"), /INVENTORY_NOT_RETURNED/);
assert.throws(() => restoreInventoryInStore({ ...store, sales: [{ inventory_id: "inv-r", sale_id: "s1" }] }, { inventory_id: "inv-r" }, "2026-09-02T01:00:00Z"), /INVENTORY_HAS_FINANCIAL_HISTORY/);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(path.join(root, "supabase/migrations/202609010012_admin_inventory_edit_and_restore.sql"), "utf8");
assert.match(sql, /create or replace function public\.kc_admin_restore_inventory_item\(\s*p_inventory_id text,\s*p_expected_updated_at timestamptz/);
assert.match(sql, /if not private\.kc_is_admin\(\)/);
assert.match(sql, /where state\.id = 'main' for update/);
assert.match(sql, /v_current_updated_at is distinct from p_expected_updated_at/);
assert.match(sql, /v_product ->> 'status' <> '已取回'/);
assert.match(sql, /INVENTORY_HAS_FINANCIAL_HISTORY/);
assert.match(sql, /to_jsonb\('在庫'::text\)/);
assert.match(sql, /'action', '取消取回／恢復在庫'/);
assert.match(sql, /coalesce\(product -> 'history'[\s\S]*\|\| jsonb_build_array/);
assert.match(sql, /revoke all on function public\.kc_admin_restore_inventory_item[\s\S]*from public, anon, authenticated/);
assert.match(sql, /grant execute on function public\.kc_admin_restore_inventory_item[\s\S]*to authenticated/);
assert.match(sql, /commit;\s*$/);

console.log("Admin restore inventory PASS: returned-only, no finance, append-only history, one-item mutation, admin RPC security contract");
