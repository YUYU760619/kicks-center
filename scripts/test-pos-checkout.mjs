import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(projectRoot, "supabase/migrations/202608300008_atomic_cart_checkout.sql"),
  "utf8",
);
const registerClient = readFileSync(path.join(projectRoot, "lib/pos-register.ts"), "utf8");
const registerPage = readFileSync(path.join(projectRoot, "app/secure-pos-register.tsx"), "utf8");

const functionStart = migration.indexOf("function public.kc_pos_complete_cart_sale");
assert.notEqual(functionStart, -1, "atomic cart checkout RPC must exist");
const functionSql = migration.slice(functionStart);
const signature = functionSql.slice(0, functionSql.indexOf("\nlanguage"));

assert.match(migration, /^begin;/);
assert.match(migration, /commit;\s*$/);
assert.doesNotMatch(signature, /p_checkout_id/);
assert.match(functionSql, /v_checkout_id := gen_random_uuid\(\)::text/);
assert.match(functionSql, /for update/);
assert.equal((functionSql.match(/update public\.kc_pos_state/g) || []).length, 1);
assert.match(functionSql, /CART_DUPLICATE_INVENTORY/);
assert.match(functionSql, /CART_PRICE_CHANGED/);
assert.match(functionSql, /CART_INVENTORY_NOT_AVAILABLE/);
assert.match(functionSql, /CART_INVENTORY_ALREADY_SOLD/);
assert.match(functionSql, /v_allocated_discount <> p_discount/);
assert.match(functionSql, /sum\(\(sale ->> 'sold_price'\)::numeric\)/);

for (const forbidden of [
  "cost",
  "return_price",
  "profit",
  "vendor_id",
  "settlement_status",
  "payload",
]) {
  assert.equal(signature.toLowerCase().includes(forbidden), false, `RPC must not return ${forbidden}`);
}

assert.match(registerClient, /completePosCartSale/);
assert.match(registerPage, /setCart/);
assert.match(registerPage, /removeItem/);
assert.match(registerPage, /completePosCartSale/);
assert.match(registerPage, /expected_price: product\.price/);

function allocateProportionalDiscount(prices, discount) {
  const subtotal = prices.reduce((sum, price) => sum + price, 0);
  if (discount < 0 || discount > subtotal) throw new Error("CART_DISCOUNT_OUT_OF_RANGE");

  let allocatedDiscount = 0;
  const soldPrices = prices.map((price, index) => {
    const lineDiscount =
      index === prices.length - 1
        ? discount - allocatedDiscount
        : subtotal === 0
          ? 0
          : Math.min(Math.round((discount * price) / subtotal), discount - allocatedDiscount);
    const soldPrice = price - lineDiscount;
    if (lineDiscount < 0 || lineDiscount > price || soldPrice < 0) {
      throw new Error("CART_DISCOUNT_ALLOCATION_INVALID");
    }
    allocatedDiscount += lineDiscount;
    return soldPrice;
  });

  assert.equal(allocatedDiscount, discount);
  assert.equal(
    soldPrices.reduce((sum, price) => sum + price, 0),
    subtotal - discount,
  );
  assert.ok(soldPrices.every((price) => price >= 0));
  return soldPrices;
}

assert.deepEqual(allocateProportionalDiscount([6980, 4500, 3200], 1000), [6505, 4193, 2982]);
assert.deepEqual(allocateProportionalDiscount([100, 100, 100, 100], 2), [99, 99, 100, 100]);
assert.deepEqual(allocateProportionalDiscount([100, 200], 300), [0, 0]);
assert.deepEqual(allocateProportionalDiscount([100, 200], 0), [100, 200]);
assert.throws(() => allocateProportionalDiscount([100], -1), /OUT_OF_RANGE/);
assert.throws(() => allocateProportionalDiscount([100], 101), /OUT_OF_RANGE/);

console.log("POS cart checkout contract passed: proportional totals, database checkout ID, one atomic state update");
