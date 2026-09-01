import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  clearInboundDraft,
  INBOUND_DRAFT_STORAGE_KEY,
  loadInboundDraft,
  saveInboundDraft,
} from "../lib/inbound-draft.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(projectRoot, "app/pos-app.tsx"), "utf8");

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const defaults = {
  code: "",
  category: "鞋款",
  name: "",
  brand: "Nike",
  model: "",
  usSize: "",
  cmSize: "",
  color: "",
  cost: "",
  price: "",
  vendorId: "vendor-1",
  location: "A-01",
  consignmentStart: "2026-09-01",
  packaging: "完整鞋盒",
  note: "",
};
const draft = {
  code: " KC-01061 ",
  category: "服飾",
  name: "Draft Product",
  brand: "Human Made",
  model: "HM-001",
  usSize: "L",
  cmSize: "",
  color: "Black",
  cost: "1200",
  price: "1980",
  vendorId: "vendor-2",
  location: "B-02",
  consignmentStart: "2026-09-02",
  packaging: "原袋",
  note: "all fields persisted",
};

saveInboundDraft(storage, draft);
assert.equal(values.has(INBOUND_DRAFT_STORAGE_KEY), true);
assert.deepEqual(loadInboundDraft(storage, defaults, new Set(["vendor-1", "vendor-2"])), draft);

const staleVendor = loadInboundDraft(storage, defaults, new Set(["vendor-1"]));
assert.equal(staleVendor.vendorId, "vendor-1");
assert.equal(staleVendor.name, draft.name);

values.set(INBOUND_DRAFT_STORAGE_KEY, "not-json");
assert.deepEqual(loadInboundDraft(storage, defaults, new Set(["vendor-1"])), defaults);
saveInboundDraft(storage, draft);
clearInboundDraft(storage);
assert.equal(values.has(INBOUND_DRAFT_STORAGE_KEY), false);

assert.match(page, /loadInboundDraft\(/);
assert.match(page, /saveInboundDraft\(window\.localStorage, f\)/);
assert.match(page, /草稿已自動儲存/);
assert.match(page, /clearInboundDraft\(window\.localStorage\)/g);
assert.match(page, /skipNextDraftSaveRef/);
assert.match(page, /入庫草稿與表單已清除/);
assert.equal("consignmentEnd" in draft, false);

console.log("Inbound draft regression PASS: every field restores, stale vendor is repaired, success/manual clear remove localStorage draft");
