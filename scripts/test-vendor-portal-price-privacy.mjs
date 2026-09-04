import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/202609040015_vendor_portal_price_privacy.sql");
const preflight = read("supabase/preflight/202609040015_vendor_portal_price_privacy_preflight.sql");
const postflight = read("supabase/postflight/202609040015_vendor_portal_price_privacy_post_migration_validation.sql");
const view = read("app/vendor-portal-view.tsx");
const types = read("lib/vendor-portal.ts");
const portal = read("app/vendor-portal.tsx");
const preview = read("app/admin-vendor-preview.tsx");
const admin = read("app/vendor-detail-page.tsx");

assert.match(migration, /^begin;/);
assert.match(migration, /commit;\s*$/);
assert.match(migration, /create or replace function private\.kc_build_vendor_portal_snapshot\(p_vendor_id text\)/);
assert.match(migration, /stable[\s\S]*security definer[\s\S]*set search_path = ''/);
assert.match(migration, /from public\.kc_pos_state as state[\s\S]*where state\.id = 'main'/);
assert.match(migration, /revoke all on function private\.kc_build_vendor_portal_snapshot\(text\)[\s\S]*from public, anon, authenticated/);
assert.doesNotMatch(migration, /create or replace function (private\.kc_vendor_portal_snapshot|public\.kc_admin_get_vendor_preview)/);
assert.doesNotMatch(migration, /\b(update|insert|delete|truncate)\s+(public\.)?(kc_pos_state|kc_app_members|auth\.users)\b/i);

for (const kept of [
  /'cost', item -> 'cost'/,
  /'cost', sale -> 'cost'/,
  /'payout', settlement -> 'payout'/,
  /'completedAt', settlement -> 'completedAt'/,
  /'saleIds', settlement -> 'saleIds'/,
]) assert.match(migration, kept);

for (const removed of [
  /'price', item -> 'price'/,
  /'history', item -> 'history'/,
  /'price', sale -> 'price'/,
  /'totalSales', settlement -> 'totalSales'/,
]) assert.doesNotMatch(migration, removed);

assert.doesNotMatch(types, /^\s*price:\s*number;/m);
assert.doesNotMatch(types, /^\s*history:/m);
assert.doesNotMatch(types, /^\s*totalSales:\s*number;/m);
assert.match(types, /cost: number;/);
assert.match(types, /payout: number;/);

for (const hiddenText of ["累計銷售", "目前售價", "成交售價", "異動紀錄"]) assert.doesNotMatch(view, new RegExp(hiddenText));
assert.doesNotMatch(view, /sale\.price|product\.price|selected\.price|selected\.history|totalSales/);
for (const keptText of ["全部商品", "目前在庫", "已售未結", "待結款", "應收回價", "最近售出", "結款紀錄"]) assert.match(view, new RegExp(keptText));
assert.match(view, /money\(product\.cost\)/);
assert.match(view, /money\(record\.payout\)/);
assert.match(view, /date\(sale\.soldAt\)/);

assert.match(portal, /<VendorPortalView snapshot={snapshot}/);
assert.match(preview, /<VendorPortalView snapshot={snapshot}/);
assert.match(migration, /where item ->> 'vendorId' = v_vendor_id/);
assert.match(migration, /product ->> 'vendorId' = v_vendor_id/);
assert.match(migration, /where settlement ->> 'vendorId' = v_vendor_id/);
assert.match(admin, /累計銷售/);
assert.match(admin, /money\(sales\.reduce\(\(sum,sale\)=>sum\+sale\.price,0\)\)/);
assert.match(admin, /\['售價',money\(product\.price\)\]/);
assert.match(admin, /\['成交價',sale\?money\(sale\.price\):'-'\]/);

for (const sql of [preflight, postflight]) {
  assert.doesNotMatch(sql, /\b(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|call|do)\b\s+/i);
  assert.doesNotMatch(sql, /pg_get_function_identity_arguments/i);
  assert.match(sql, /oidvectortypes\(p\.proargtypes\)/);
}
assert.match(preflight, /0 issues; migration 015 preflight ready/);
assert.match(postflight, /0 issues; migration 015 installed and vendor price privacy verified/);

console.log("Vendor Portal price privacy PASS: store prices/history removed server-side and in shared UI while receivables and Admin data remain available");
