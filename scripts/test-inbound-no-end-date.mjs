import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(root, "app/pos-app.tsx"), "utf8");
const core = readFileSync(path.join(root, "lib/pos-core.ts"), "utf8");
const draft = readFileSync(path.join(root, "lib/inbound-draft.ts"), "utf8");
const vendorPortal = readFileSync(path.join(root, "app/vendor-portal.tsx"), "utf8");
const vendorDetail = readFileSync(path.join(root, "app/vendor-detail-page.tsx"), "utf8");
const inventoryMigration = readFileSync(
  path.join(root, "supabase/migrations/202608300008_atomic_cart_checkout.sql"),
  "utf8",
);

const inboundStart = page.indexOf("function Inbound(");
const inboundEnd = page.indexOf("function POS(", inboundStart);
assert.notEqual(inboundStart, -1);
assert.notEqual(inboundEnd, -1);
const inbound = page.slice(inboundStart, inboundEnd);

assert.match(inbound, /寄賣開始日/);
assert.match(inbound, /consignmentStart/);
assert.doesNotMatch(inbound, /寄賣結束日|consignmentEnd/);
assert.doesNotMatch(draft, /consignmentEnd/);
assert.match(core, /consignmentEnd\?: string/);

// The active inventory RPC copies a JSON payload and never requires the legacy
// end-date key, so new products may omit it while old products remain readable.
const rpcStart = inventoryMigration.indexOf("create or replace function private.kc_admin_create_inventory_item_impl");
const rpcEnd = inventoryMigration.indexOf("create or replace function public.kc_pos_lookup_inventory", rpcStart);
const inventoryRpc = inventoryMigration.slice(rpcStart, rpcEnd);
assert.doesNotMatch(inventoryRpc, /consignmentEnd|consignment_end/);

assert.doesNotMatch(vendorPortal, /selected\.consignmentEnd|寄賣結束/);
assert.doesNotMatch(vendorDetail, /product\.consignmentEnd|寄賣結束/);
assert.match(vendorPortal, /售出／取回／下架即為實際結束/);
assert.match(vendorDetail, /售出／取回／下架即為實際結束/);

const settlementStart = page.indexOf("function Settle(");
const settlementEnd = page.indexOf("function Sales(", settlementStart);
assert.doesNotMatch(page.slice(settlementStart, settlementEnd), /consignmentEnd/);

console.log("Inbound no-end-date regression PASS: start date retained, new input/draft omit end date, legacy data stays compatible, finance flows are independent");
