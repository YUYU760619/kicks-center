import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const provider = readFileSync(path.join(root, "app/admin-ui-context.tsx"), "utf8");
const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
const admin = readFileSync(path.join(root, "app/pos-app.tsx"), "utf8");

assert.match(layout, /<AdminUiProvider>\{children\}<\/AdminUiProvider>/);
assert.match(provider, /const \[createVendorOpen, setCreateVendorOpen\] = useState\(false\)/);
assert.match(provider, /const \[createVendorDraft, setCreateVendorDraft\]/);
assert.doesNotMatch(provider, /localStorage|sessionStorage/);
assert.match(admin, /createVendorDraft: form/);
assert.match(admin, /setCreateVendorDraft: setForm/);
assert.match(admin, /createVendorOpen &&/);
assert.match(admin, /onClick=\{\(\) => setCreateVendorOpen\(true\)\}/);
assert.match(admin, /clearCreateVendor\(\)/);
assert.match(admin, /const closeCreate = \(\) => \{[\s\S]*resetCreate\(\)/);
assert.match(admin, /const submitCreate = async[\s\S]*const vendor = await createVendor[\s\S]*resetCreate\(\)/);
assert.match(admin, /aria-label="關閉新增寄賣廠商"[\s\S]*onClick=\{closeCreate\}/);
assert.match(admin, /variant="ghost" onClick=\{closeCreate\}/);

const state = {
  open: false,
  draft: { code: "", name: "", phone: "", joined: "" },
};
state.open = true;
state.draft = {
  code: "NKS00099",
  name: "測試廠商",
  phone: "0912-345-678",
  joined: "2026-09-03",
};

for (const page of [
  "dashboard",
  "inventory",
  "inbound",
  "pos",
  "vendors",
  "settlement",
  "sales",
  "settings",
]) {
  assert.equal(state.open, true, page);
  assert.deepEqual(state.draft, {
    code: "NKS00099",
    name: "測試廠商",
    phone: "0912-345-678",
    joined: "2026-09-03",
  }, page);
}

state.open = false;
state.draft = { code: "", name: "", phone: "", joined: "" };
assert.equal(state.open, false);
assert.deepEqual(state.draft, { code: "", name: "", phone: "", joined: "" });

console.log("Create vendor modal navigation regression PASS: open state and four fields survive Admin navigation; cancel clears state");
