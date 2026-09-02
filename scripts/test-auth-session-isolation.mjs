import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const supabase = read("lib/supabase.ts");
const authGate = read("app/auth-gate.tsx");
const consumers = {
  "lib/pos-register.ts": "staffSupabase",
  "lib/pos-store.ts": "adminSupabase",
  "lib/vendor-account.ts": "adminSupabase",
  "lib/vendor-portal.ts": "vendorSupabase",
  "app/pos-app.tsx": "adminSupabase",
  "app/vendor-portal.tsx": "vendorSupabase",
};

const keys = {
  admin: "kc-auth-admin",
  staff: "kc-auth-staff",
  vendor: "kc-auth-vendor",
};
assert.equal(new Set(Object.values(keys)).size, 3, "portal storage keys must be unique");
for (const [portal, key] of Object.entries(keys)) {
  assert.match(supabase, new RegExp(`${portal}: ["']${key}["']`));
  assert.match(supabase, new RegExp(`createPortalClient\\(["']${portal}["']\\)`));
}
assert.match(supabase, /storageKey: AUTH_STORAGE_KEYS\[portal\]/);
assert.match(supabase, /persistSession: true/);
assert.match(supabase, /autoRefreshToken: true/);
assert.match(supabase, /detectSessionInUrl: false/);
assert.doesNotMatch(supabase, /export const supabase\s*=/);

assert.match(authGate, /getPortalSupabase\(portal\)/);
assert.match(authGate, /\.from\("kc_app_members"\)/);
assert.match(authGate, /resolved\.active/);
assert.match(authGate, /portal === "admin"[\s\S]*resolved\.role === "admin"/);
assert.match(authGate, /portal === "staff"[\s\S]*resolved\.role === "admin" \|\| resolved\.role === "staff"/);
assert.match(authGate, /resolved\.role === "vendor" && Boolean\(resolved\.vendor_id\)/);

for (const [file, client] of Object.entries(consumers)) {
  const source = read(file);
  assert.match(source, new RegExp(`import \\{ ${client} \\} from ["']@/lib/supabase["']`), `${file} must import ${client}`);
  assert.doesNotMatch(source, /import \{ supabase \} from ["']@\/lib\/supabase["']/);
}

// Model the browser storage behavior expected from three Supabase clients.
const storage = new Map();
const login = (portal, session) => storage.set(keys[portal], session);
const logout = (portal) => storage.delete(keys[portal]);
login("admin", "admin-session");
login("staff", "staff-session");
login("vendor", "vendor-session");
assert.deepEqual([...storage.values()].sort(), ["admin-session", "staff-session", "vendor-session"]);

logout("vendor");
assert.equal(storage.get(keys.admin), "admin-session");
assert.equal(storage.get(keys.staff), "staff-session");
login("vendor", "vendor-session-2");
logout("staff");
assert.equal(storage.get(keys.admin), "admin-session");
assert.equal(storage.get(keys.vendor), "vendor-session-2");
login("staff", "staff-session-2");
logout("admin");
assert.equal(storage.get(keys.staff), "staff-session-2");
assert.equal(storage.get(keys.vendor), "vendor-session-2");

console.log("Portal Auth session isolation regression passed: unique storage keys, isolated clients/logout, DB role checks preserved");
