import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const securityMigration = readFileSync(path.join(root, "supabase/migrations/202608280002_harden_pos_security.sql"), "utf8");
const memberMigration = readFileSync(path.join(root, "supabase/migrations/202608290004_member_admin_and_legacy_rls.sql"), "utf8");
const newMigration = readFileSync(path.join(root, "supabase/migrations/202609010011_inventory_return_and_vendor_accounts.sql"), "utf8");
const edgeFunction = readFileSync(path.join(root, "supabase/functions/kc-admin-vendor-account/index.ts"), "utf8");
const accountClient = readFileSync(path.join(root, "lib/vendor-account.ts"), "utf8");
const accountUi = readFileSync(path.join(root, "app/vendor-account-card.tsx"), "utf8");
const authGate = readFileSync(path.join(root, "app/auth-gate.tsx"), "utf8");

assert.match(newMigration, /^begin;/);
assert.match(newMigration, /create unique index if not exists kc_app_members_one_account_per_vendor/);
assert.match(newMigration, /where role = 'vendor' and vendor_id is not null/);
assert.match(newMigration, /Duplicate vendor account bindings must be resolved before migration/);

assert.match(securityMigration, /v_vendor_id := private\.kc_current_vendor_id\(\)/);
assert.match(securityMigration, /where item ->> 'vendorId' = v_vendor_id/);
assert.match(securityMigration, /product ->> 'vendorId' = v_vendor_id/);
assert.match(securityMigration, /settlement ->> 'vendorId' = v_vendor_id/);
assert.match(securityMigration, /KICKS CENTER vendor access required/);
assert.match(memberMigration, /p_role = 'vendor' and not exists/);
assert.match(memberMigration, /Vendor binding does not exist/);

assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(edgeFunction, /adminMember\.role !== "admin"/);
assert.match(edgeFunction, /adminMember\.active !== true/);
assert.match(edgeFunction, /auth\.admin\.createUser/);
assert.match(edgeFunction, /kc_admin_set_member_access/);
assert.match(edgeFunction, /auth\.admin\.updateUserById/);
assert.match(edgeFunction, /action === "disable"/);
assert.match(edgeFunction, /action === "reset_password"/);
assert.doesNotMatch(edgeFunction, /from\("kc_pos_state"\)\s*\.update/);
assert.doesNotMatch(edgeFunction, /password:\s*password[\s\S]*return json\([^\n]*password/);

assert.match(accountClient, /functions\.invoke\("kc-admin-vendor-account"/);
assert.doesNotMatch(accountClient, /SERVICE_ROLE/);
for (const label of ["建立登入帳號", "停用帳號", "重設密碼", "複製登入網址", "已綁定"]) {
  assert.match(accountUi, new RegExp(label));
}
assert.match(accountUi, /https:\/\/kicks-center\.vercel\.app\/vendor/);
assert.match(authGate, /portal === "admin"[\s\S]*resolved\.role === "admin"/);
assert.match(authGate, /portal === "staff"[\s\S]*resolved\.role === "admin" \|\| resolved\.role === "staff"/);
assert.match(authGate, /resolved\.role === "vendor" && Boolean\(resolved\.vendor_id\)/);

console.log("Vendor account isolation safety PASS: active-admin Auth lifecycle, unique vendor binding, vendor-scoped snapshot, no client service key/password persistence");
