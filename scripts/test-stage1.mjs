import assert from "node:assert/strict";
import {
  createInventoryInStore,
  normalizeScanCode,
  sellInventoryInStore,
} from "../lib/pos-core.ts";

assert.equal(normalizeScanCode("  kc-01061  "), "KC-01061");
assert.equal(normalizeScanCode(" kc 01061 "), "KC 01061");
assert.notEqual(normalizeScanCode("KC-01061"), normalizeScanCode("KC00010-061"));
assert.notEqual(normalizeScanCode("KC 01061"), normalizeScanCode("KC01061"));

const baseStore = {
  products: [],
  vendors: [
    {
      id: "vendor-stage1",
      code: "NKS00999",
      name: "第一階段測試廠商",
      phone: "",
      joined: "2026-08-29",
    },
  ],
  sales: [],
  settlements: [],
};

const inventoryInput = {
  scan_code: " KC-STAGE1-001 ",
  category: "鞋款",
  name: "Stage 1 Test Sneaker",
  brand: "KICKS CENTER",
  model: "CORE-001",
  usSize: "9",
  cmSize: "27",
  color: "Slate",
  cost: 3000,
  price: 4500,
  vendorId: "vendor-stage1",
  location: "TEST-01",
  consignmentStart: "2026-08-29",
  consignmentEnd: "2026-12-31",
  packaging: "完整鞋盒",
  note: "第一階段自動測試",
};

const created = createInventoryInStore(
  baseStore,
  inventoryInput,
  "inventory-stage1-unique-001",
  "2026-08-29T10:00:00.000Z",
);

assert.equal(created.product.inventory_id, "inventory-stage1-unique-001");
assert.equal(created.product.scan_code, "KC-STAGE1-001");
assert.equal(created.product.status, "在庫");
assert.equal(created.store.products.length, 1);

assert.throws(
  () =>
    createInventoryInStore(
      created.store,
      { ...inventoryInput, scan_code: "kc-stage1-001" },
      "inventory-stage1-unique-002",
      "2026-08-29T10:01:00.000Z",
    ),
  /SCAN_CODE_EXISTS/,
);

const sold = sellInventoryInStore(
  created.store,
  {
    inventory_id: created.product.inventory_id,
    sold_price: 4200,
    payment_method: "信用卡",
    discount: 300,
  },
  "sale-stage1-unique-001",
  "2026-08-29T10:05:00.000Z",
);

assert.equal(sold.sale.inventory_id, created.product.inventory_id);
assert.equal(sold.sale.vendor_id, "vendor-stage1");
assert.equal(sold.sale.sold_price, 4200);
assert.equal(sold.sale.return_price, 3000);
assert.equal(sold.sale.payment_method, "信用卡");
assert.equal(sold.sale.settlement_status, "pending");
assert.equal(sold.store.sales.length, 1);
assert.equal(
  sold.store.products.find(
    (product) => product.inventory_id === created.product.inventory_id,
  )?.status,
  "已售出",
);
assert.equal(
  sold.store.products.filter((product) => product.status === "在庫").length,
  0,
);

assert.throws(
  () =>
    sellInventoryInStore(
      sold.store,
      {
        inventory_id: created.product.inventory_id,
        sold_price: 4200,
        payment_method: "現金",
        discount: 0,
      },
      "sale-stage1-duplicate",
      "2026-08-29T10:06:00.000Z",
    ),
  /INVENTORY_NOT_AVAILABLE|INVENTORY_ALREADY_SOLD/,
);

assert.equal(sold.store.sales.length, 1);
assert.equal(sold.sale.sale_id, "sale-stage1-unique-001");

console.log("Stage 1 flow passed: inventory → sale → sold stock → pending settlement → duplicate sale blocked");
