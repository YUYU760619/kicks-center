import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(projectRoot, "supabase/migrations/202608300007_isolate_staff_pos_data.sql"),
  "utf8",
);
const cartMigration = readFileSync(
  path.join(projectRoot, "supabase/migrations/202608300008_atomic_cart_checkout.sql"),
  "utf8",
);
const migrationSql = `${migration}\n${cartMigration}`;
const registerClient = readFileSync(path.join(projectRoot, "lib/pos-register.ts"), "utf8");
const registerPage = readFileSync(path.join(projectRoot, "app/pos/page.tsx"), "utf8");

function functionSql(name) {
  const start = migrationSql.lastIndexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextFunction = migrationSql.indexOf("function public.", start + 20);
  return migrationSql.slice(start, nextFunction === -1 ? migrationSql.length : nextFunction);
}

function returnSignature(name) {
  const sql = functionSql(name);
  const start = sql.indexOf("returns table (");
  const end = sql.indexOf(")\nlanguage", start);
  assert.notEqual(start, -1, `${name} must return a typed table`);
  assert.notEqual(end, -1, `${name} return signature must terminate before language`);
  return sql.slice(start, end).toLowerCase();
}

const forbiddenFields = [
  "cost",
  "profit",
  "return_price",
  "vendor",
  "settlement",
  "payout",
  "payload",
];

for (const rpcName of [
  "kc_pos_lookup_inventory",
  "kc_pos_complete_sale",
  "kc_pos_complete_cart_sale",
]) {
  const signature = returnSignature(rpcName);
  for (const field of forbiddenFields) {
    assert.equal(
      signature.includes(field),
      false,
      `${rpcName} must not return ${field}`,
    );
  }
}

for (const field of forbiddenFields) {
  assert.equal(
    registerClient.toLowerCase().includes(field),
    false,
    `staff register client must not model ${field}`,
  );
}

assert.match(registerPage, /SecurePosRegister/);
assert.doesNotMatch(registerPage, /PosApp|loadPosStore|kc_pos_state/);

assert.match(migration, /create or replace function private\.kc_is_admin\(\)/);
assert.match(migration, /create policy kc_pos_state_admin_read/);
assert.match(migration, /create policy kc_pos_backups_admin_read/);
assert.match(migration, /create policy kc_audit_admin_read/);
assert.match(migration, /create policy kc_app_members_admin_read/);
assert.match(migration, /from private\.kc_admin_save_pos_state_impl/);
assert.match(migration, /from private\.kc_admin_create_inventory_item_impl/);
assert.match(migration, /from private\.kc_admin_sell_inventory_item_impl/);

const secureSale = functionSql("kc_pos_complete_sale");
assert.match(secureSale, /for update/);
assert.match(secureSale, /INVENTORY_ALREADY_SOLD/);
assert.match(secureSale, /'settlement_status', 'pending'/);
assert.match(secureSale, /private\.kc_assert_pos_financial_integrity/);
assert.match(secureSale, /private\.kc_assert_stage1_core/);

const secureCartSale = functionSql("kc_pos_complete_cart_sale");
assert.match(secureCartSale, /private\.kc_is_staff\(\)/);
assert.match(secureCartSale, /for update/);
assert.match(secureCartSale, /CART_DUPLICATE_INVENTORY/);
assert.match(secureCartSale, /CART_PRICE_CHANGED/);
assert.match(secureCartSale, /CART_INVENTORY_NOT_AVAILABLE/);
assert.match(secureCartSale, /CART_INVENTORY_ALREADY_SOLD/);
assert.match(secureCartSale, /'checkout_id', v_checkout_id/);
assert.match(secureCartSale, /'settlement_status', 'pending'/);
assert.match(secureCartSale, /private\.kc_assert_pos_financial_integrity/);
assert.match(secureCartSale, /private\.kc_assert_stage1_core/);
assert.equal((secureCartSale.match(/update public\.kc_pos_state/g) || []).length, 1);

const normalizeScanCode = (value) =>
  value.trim().toUpperCase();

assert.equal(normalizeScanCode(" KC-01061 "), "KC-01061");
assert.equal(normalizeScanCode("KC00010-061"), "KC00010-061");
assert.notEqual(normalizeScanCode("KC-01061"), normalizeScanCode("KC00010-061"));
assert.equal(normalizeScanCode(" kc 01061 "), "KC 01061");
assert.notEqual(normalizeScanCode("KC 01061"), normalizeScanCode("KC01061"));
assert.doesNotMatch(functionSql("kc_pos_lookup_inventory"), /regexp_replace/);
assert.match(functionSql("kc_pos_lookup_inventory"), /upper\(btrim/);

console.log("POS security contract tests passed");
