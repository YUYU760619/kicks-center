import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeStoreSchema, sellInventoryInStore } from "../lib/pos-core.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/202609050016_vendor_sale_visibility.sql");
const preflight = read("supabase/preflight/202609050016_vendor_sale_visibility_preflight.sql");
const postflight = read("supabase/postflight/202609050016_vendor_sale_visibility_post_migration_validation.sql");
const core = read("lib/pos-core.ts");
const storeClient = read("lib/pos-store.ts");
const admin = read("app/pos-app.tsx");
const previewMigration = read("supabase/migrations/202609040014_admin_vendor_preview.sql");

assert.match(migration, /^begin;/);
assert.match(migration, /commit;\s*$/);
assert.match(migration, /create or replace function private\.kc_guard_sale_vendor_visibility\(\)/);
assert.match(migration, /create trigger kc_pos_state_01_sale_vendor_visibility_guard/);
assert.match(migration, /create or replace function public\.kc_admin_set_sale_vendor_visibility/);
assert.match(migration, /language plpgsql\s+volatile\s+security definer\s+set search_path = ''/);
assert.match(migration, /if not private\.kc_is_admin\(\) then/);
assert.match(migration, /for update/);
assert.match(migration, /p_expected_updated_at/);
assert.match(migration, /SALE_VENDOR_VISIBILITY_REQUIRES_DEDICATED_ADMIN_OPERATION/);
assert.match(migration, /set_config\('kc\.allow_sale_vendor_visibility_change', 'on', true\)/);
assert.match(migration, /set_config\(\s*'kc\.action_summary'/);
assert.match(migration, /revoke all on function public\.kc_admin_set_sale_vendor_visibility[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.kc_admin_set_sale_vendor_visibility[\s\S]*to authenticated/);
assert.doesNotMatch(migration, /grant execute on function public\.kc_admin_set_sale_vendor_visibility[\s\S]*to (anon|public)/i);

assert.match(migration, /not \(hidden_sale \? 'vendorVisible'\) then false/);
assert.match(migration, /then to_jsonb\('在庫'::text\) else item -> 'status' end/);
assert.match(migration, /jsonb_array_length\(projected\.visible_sale_ids\) > 0/);
assert.match(migration, /'saleIds', projected\.visible_sale_ids/);
assert.match(migration, /'payout', projected\.visible_payout/);
assert.match(migration, /sum\(coalesce\(nullif\(sale ->> 'return_price'/);

for (const forbidden of [
  /'price', item -> 'price'/,
  /'history', item -> 'history'/,
  /'price', sale -> 'price'/,
  /'totalSales', settlement -> 'totalSales'/,
]) assert.doesNotMatch(migration, forbidden);
for (const allowed of [/'cost', item -> 'cost'/, /'cost', sale -> 'cost'/, /'payout', projected\.visible_payout/]) {
  assert.match(migration, allowed);
}

assert.match(preflight, /oidvectortypes\(p\.proargtypes\)/);
assert.match(postflight, /oidvectortypes\(p\.proargtypes\)/);
assert.match(preflight, /pg_catalog\.aclexplode\([\s\S]*pg_catalog\.acldefault\('f', p\.proowner\)/);
assert.match(postflight, /pg_catalog\.aclexplode\([\s\S]*pg_catalog\.acldefault\('f', p\.proowner\)/);
assert.match(preflight, /0 issues; migration 016 preflight ready/);
assert.match(postflight, /0 issues; migration 016 installed and visibility\/privacy contracts verified/);
assert.doesNotMatch(preflight, /pg_get_function_identity_arguments/);
assert.doesNotMatch(postflight, /pg_get_function_identity_arguments/);
for (const validator of [preflight, postflight]) {
  assert.doesNotMatch(validator, /^\s*(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|call|do)\b/im);
  const ctes = [...validator.matchAll(/^([a-z_]+)(?:\([^\n]*\))? as \($/gm)].map((match) => match[1]);
  assert.equal(new Set(ctes).size, ctes.length, "validator CTE names must be unique");
}

for (const validator of [preflight, postflight]) {
  for (const contract of [
    "VENDOR_RECORD_INVALID", "VENDOR_CODES_SHAPE_INVALID", "VENDOR_ID_DUPLICATE",
    "VENDOR_CODE_ID_INVALID", "VENDOR_CODE_ID_DUPLICATE", "VENDOR_CODE_INVALID",
    "VENDOR_PRIMARY_INVALID", "VENDOR_CODE_DUPLICATE", "PRODUCT_VENDOR_NOT_FOUND",
    "PRODUCT_SNAPSHOT_PARTIAL_OR_INVALID", "PRODUCT_VENDOR_CODE_NOT_FOUND",
    "PRODUCT_VENDOR_CODE_SNAPSHOT_MISMATCH", "SALE_PRODUCT_NOT_FOUND", "SALE_VENDOR_NOT_FOUND",
    "SALE_PRODUCT_VENDOR_MISMATCH", "SALE_SNAPSHOT_PARTIAL_OR_INVALID",
    "SALE_VENDOR_CODE_NOT_FOUND", "SALE_VENDOR_CODE_SNAPSHOT_MISMATCH",
    "SETTLEMENT_VENDOR_NOT_FOUND", "SETTLEMENT_SALE_IDS_INVALID",
    "SETTLEMENT_SALE_NOT_FOUND", "SETTLEMENT_SALE_VENDOR_MISMATCH",
  ]) assert.match(validator, new RegExp(contract));
  assert.match(validator, /pg_catalog\.oidvectortypes\(p\.proargtypes\)/);
  assert.match(validator, /pg_catalog\.aclexplode\([\s\S]*pg_catalog\.acldefault\('f', p\.proowner\)/);
  assert.match(validator, /acl\.grantee = 0/);
  assert.match(validator, /fixed_search_path/);
  assert.match(validator, /VENDOR_WRAPPER_CONTRACT_INVALID/);
  assert.match(validator, /ADMIN_WRAPPER_CONTRACT_INVALID/);
  assert.match(validator, /SHARED_BUILDER_RELATION_SOURCE_INVALID/);
  assert.match(validator, /SHARED_BUILDER_WHITELIST_FIELD_MISSING/);
  assert.match(validator, /SHARED_BUILDER_WHITELIST_FIELD_UNEXPECTED/);
  assert.match(validator, /SALE_VENDOR_VISIBILITY_MALFORMED/);
}
assert.match(preflight, /kc_pos_state_00_vendor_code_guard_trigger/);
assert.match(preflight, /Expected exactly one Migration 013 VendorCode guard trigger/);
for (const contract of [
  "kc_pos_state_00_vendor_code_guard_trigger", "kc_pos_state_01_sale_vendor_visibility_guard",
  "VISIBILITY_GUARD_CONTRACT_INVALID", "ADMIN_VISIBILITY_MUTATION_CONTRACT_INVALID",
  "BUILDER_VISIBILITY_PROJECTION_INVALID", "BUILDER_SETTLEMENT_PROJECTION_INVALID",
  "BUILDER_PROJECTED_FIELD_CONTRACT_INVALID",
]) assert.match(postflight, new RegExp(contract));
assert.match(postflight, /count\(trigger_oid\) <> 1/);
assert.match(postflight, /actual_table_schema is distinct from table_schema/);
assert.match(postflight, /tgenabled not in \('O', 'A'\)/);
assert.match(postflight, /when not \(sale \? ''vendorvisible''\) then true/);
assert.match(postflight, /when not \(hidden_sale \? ''vendorvisible''\) then false/);
assert.match(postflight, /jsonb_array_length\(projected\.visible_sale_ids\) > 0/);

assert.match(core, /vendorVisible:\s*boolean/);
assert.match(core, /typeof legacy\.vendorVisible === "boolean" \? legacy\.vendorVisible : true/);
assert.match(core, /vendorVisible: true/);
assert.match(storeClient, /\.rpc\("kc_admin_set_sale_vendor_visibility"/);
assert.match(admin, /供應商可見/);
assert.match(admin, /role="switch"/);
assert.match(admin, /供應商端顯示在庫/);
assert.doesNotMatch(previewMigration, /kc_admin_set_sale_vendor_visibility/);
assert.match(previewMigration, /return private\.kc_build_vendor_portal_snapshot\(v_vendor_id\)/);

const legacy = normalizeStoreSchema({ products: [], vendors: [], settlements: [], sales: [{
  sale_id: "legacy", id: "legacy", inventory_id: "p", productId: "p", sold_at: "2026-01-01T00:00:00Z",
  soldAt: "2026-01-01T00:00:00Z", sold_price: 1, price: 1, return_price: 1, cost: 1,
  vendor_id: "v", payment_method: "現金", payment: "現金", settlement_status: "pending",
  profit: 0, discount: 0, settled: false,
}] });
assert.equal(legacy.sales[0].vendorVisible, true, "legacy missing visibility must normalize visible");

const vendor = { id: "v", code: "V", name: "Vendor", phone: "", joined: "2026-01-01" };
const product = { inventory_id: "p", scan_code: "P", id: "p", code: "P", category: "鞋款", name: "Shoe",
  brand: "B", model: "M", usSize: "9", cmSize: "27", color: "Black", cost: 100, price: 150,
  vendorId: "v", location: "A", consignmentStart: "2026-01-01", packaging: "完整", note: "", status: "在庫",
  createdAt: "2026-01-01T00:00:00Z", history: [] };
const sold = sellInventoryInStore({ products: [product], vendors: [vendor], sales: [], settlements: [] },
  { inventory_id: "p", sold_price: 150, payment_method: "現金", discount: 0 }, "s", "2026-01-02T00:00:00Z");
assert.equal(sold.sale.vendorVisible, true, "new local Sale must default visible");
assert.equal(sold.store.products[0].status, "已售出", "Admin truth remains sold");

function restrictedProjection(store) {
  const visible = (sale) => sale.vendorVisible === undefined ? true : sale.vendorVisible;
  const sales = store.sales.filter(visible);
  const products = store.products.map((item) => {
    const hiddenSale = store.sales.find((sale) => sale.productId === item.id && !visible(sale));
    return hiddenSale ? { ...item, status: "在庫" } : { ...item };
  });
  const settlements = store.settlements.flatMap((record) => {
    const visibleSales = record.saleIds.map((id) => store.sales.find((sale) => sale.id === id))
      .filter((sale) => sale && visible(sale));
    return visibleSales.length ? [{ ...record, saleIds: visibleSales.map((sale) => sale.id),
      payout: visibleSales.reduce((sum, sale) => sum + sale.cost, 0) }] : [];
  });
  return { products, sales, settlements };
}

const visibleSale = { ...sold.sale, id: "visible", sale_id: "visible", vendorVisible: true, cost: 100 };
const hiddenSale = { ...sold.sale, id: "hidden", sale_id: "hidden", productId: "hidden-product", inventory_id: "hidden-product", vendorVisible: false, cost: 80, settled: true, settlement_status: "settled" };
const hiddenProduct = { ...product, id: "hidden-product", inventory_id: "hidden-product", status: "已銷帳" };
const mixed = restrictedProjection({ products: [{ ...product, status: "已售出" }, hiddenProduct], vendors: [vendor],
  sales: [visibleSale, hiddenSale], settlements: [{ id: "mixed", vendorId: "v", saleIds: ["visible", "hidden"], totalSales: 999, payout: 180, profit: 0, completedAt: "2026-01-03" }] });
assert.equal(mixed.products.length, 2);
assert.equal(mixed.products.find((item) => item.id === "hidden-product").status, "在庫");
assert.deepEqual(mixed.sales.map((sale) => sale.id), ["visible"]);
assert.deepEqual(mixed.settlements[0].saleIds, ["visible"]);
assert.equal(mixed.settlements[0].payout, 100);

const hiddenOnly = restrictedProjection({ products: [hiddenProduct], vendors: [vendor], sales: [hiddenSale],
  settlements: [{ id: "hidden-only", vendorId: "v", saleIds: ["hidden"], totalSales: 1, payout: 80, profit: 0, completedAt: "2026-01-03" }] });
assert.equal(hiddenOnly.products[0].status, "在庫");
assert.equal(hiddenOnly.sales.length, 0);
assert.equal(hiddenOnly.settlements.length, 0);

hiddenSale.vendorVisible = true;
const restored = restrictedProjection({ products: [hiddenProduct], vendors: [vendor], sales: [hiddenSale],
  settlements: [{ id: "restored", vendorId: "v", saleIds: ["hidden"], totalSales: 1, payout: 80, profit: 0, completedAt: "2026-01-03" }] });
assert.equal(restored.products[0].status, "已銷帳");
assert.equal(restored.sales.length, 1);
assert.equal(restored.settlements[0].payout, 80);

console.log("Migration 016 visibility PASS: legacy/new defaults, projected status, Sale filtering, Settlement subsets, security and privacy contracts");
