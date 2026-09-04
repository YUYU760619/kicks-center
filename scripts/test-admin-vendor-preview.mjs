import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/202609040014_admin_vendor_preview.sql");
const originalSecurity = read("supabase/migrations/202608280002_harden_pos_security.sql");
const publicWrapper = read("supabase/migrations/202608280003_wrap_security_definer_functions.sql");
const portal = read("app/vendor-portal.tsx");
const view = read("app/vendor-portal-view.tsx");
const preview = read("app/admin-vendor-preview.tsx");
const previewRoute = read("app/vendors/[id]/preview/page.tsx");
const vendorDetail = read("app/vendor-detail-page.tsx");
const loader = read("lib/vendor-portal.ts");

assert.match(migration, /^begin;/);
assert.match(migration, /commit;\s*$/);
assert.match(migration, /create or replace function private\.kc_build_vendor_portal_snapshot\(p_vendor_id text\)/);
assert.match(migration, /create or replace function private\.kc_vendor_portal_snapshot\(\)/);
assert.match(migration, /create or replace function public\.kc_admin_get_vendor_preview\(p_vendor_id text\)/);
assert.match(migration, /stable[\s\S]*security definer[\s\S]*set search_path = ''/);
assert.match(migration, /if not private\.kc_is_admin\(\)/);
assert.match(migration, /errcode = '42501'/);
assert.match(migration, /Vendor ID is required/);
assert.match(migration, /Vendor ID must be a UUID/);
assert.match(migration, /Vendor not found/);
assert.match(migration, /where item ->> 'id' = v_vendor_id/);
assert.match(migration, /where item ->> 'vendorId' = v_vendor_id/);
assert.match(migration, /where settlement ->> 'vendorId' = v_vendor_id/);
assert.match(migration, /private\.kc_current_vendor_id\(\)/);
assert.match(migration, /return private\.kc_build_vendor_portal_snapshot\(v_vendor_id\)/);
assert.match(migration, /revoke all on function private\.kc_build_vendor_portal_snapshot\(text\)[\s\S]*from public, anon, authenticated/);
assert.match(migration, /revoke all on function public\.kc_admin_get_vendor_preview\(text\)[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.kc_admin_get_vendor_preview\(text\)[\s\S]*to authenticated/);
assert.doesNotMatch(migration, /\b(update|insert|delete|truncate)\s+(public\.)?(kc_pos_state|kc_app_members|auth\.users)\b/i);

for (const forbiddenProductField of ["'note'", "'location'"]) {
  assert.doesNotMatch(migration, new RegExp(`${forbiddenProductField}, item ->`));
}
for (const field of ["id", "productId", "cost", "price", "soldAt", "settled", "settlementId"]) {
  assert.match(migration, new RegExp(`'${field}', sale -> '${field}'`));
}
for (const field of ["id", "saleIds", "payout", "totalSales", "completedAt"]) {
  assert.match(migration, new RegExp(`'${field}', settlement -> '${field}'`));
}

assert.match(originalSecurity, /v_vendor_id := private\.kc_current_vendor_id\(\)/);
assert.match(publicWrapper, /public\.kc_vendor_portal_snapshot\(\)[\s\S]*private\.kc_vendor_portal_snapshot\(\)/);
assert.doesNotMatch(publicWrapper, /kc_vendor_portal_snapshot\([^)]*vendor/i);
assert.match(loader, /import \{ adminSupabase \} from "@\/lib\/supabase"/);
assert.match(loader, /import \{ vendorSupabase \} from "@\/lib\/supabase"/);
assert.match(loader, /vendorSupabase\.rpc\("kc_vendor_portal_snapshot"\)/);
assert.match(loader, /adminSupabase\.rpc\("kc_admin_get_vendor_preview"/);
assert.doesNotMatch(loader, /from\("kc_pos_state"\)/);

assert.match(portal, /<VendorPortalView snapshot={snapshot}/);
assert.match(preview, /<VendorPortalView snapshot={snapshot}/);
assert.match(previewRoute, /<AuthGate portal="admin">/);
assert.match(preview, /ADMIN 預覽模式/);
assert.match(preview, /目前預覽：{snapshot\.vendor\.name}/);
assert.match(preview, /唯讀模式/);
assert.match(preview, /href={`\/vendors\/\${vendorId}`}/);
assert.doesNotMatch(preview, /signOut|vendorSupabase|savePosStore|settlement|setVendorCodes|updateInventory/);
assert.doesNotMatch(view, /Supabase|signOut|savePosStore|\.rpc\(|mutation|setVendorCodes|updateInventory/);
assert.doesNotMatch(view, /onSave|onUpdate|onDelete|onSettle/);

assert.match(vendorDetail, /storedVendor && <Link href={`\/vendors\/\${storedVendor\.id}\/preview`}/);
assert.match(vendorDetail, /aria-label={`預覽 \${storedVendor\.name} 的供應商頁面`}/);
assert.match(vendorDetail, /focus-visible:outline/);
assert.doesNotMatch(vendorDetail, /profile\.id[^\n]*preview/);

console.log("Admin vendor preview PASS: admin-only read RPC, vendor UUID isolation, shared read-only view, session separation, and safe real-vendor preview entry");
