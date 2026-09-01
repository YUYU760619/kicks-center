import assert from "node:assert/strict";
import {
  getInitialInboundVendorId,
  isCurrentVendorId,
} from "../lib/pos-core.ts";

const storeWithoutVendors = {
  products: [],
  vendors: [],
  sales: [],
  settlements: [],
};

assert.doesNotThrow(() => getInitialInboundVendorId(storeWithoutVendors.vendors));
assert.equal(getInitialInboundVendorId(storeWithoutVendors.vendors), "");
assert.equal(isCurrentVendorId(storeWithoutVendors.vendors, ""), false);
assert.equal(
  isCurrentVendorId(storeWithoutVendors.vendors, "vendor-does-not-exist"),
  false,
);

const vendors = [{ id: "vendor-current" }];
assert.equal(getInitialInboundVendorId(vendors), "vendor-current");
assert.equal(isCurrentVendorId(vendors, "vendor-current"), true);
assert.equal(isCurrentVendorId(vendors, "vendor-stale"), false);

console.log("Inbound empty-vendors regression test PASS");
