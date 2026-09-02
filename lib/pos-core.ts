export type Status =
  | "在庫"
  | "已售出"
  | "已銷帳"
  | "已取回"
  | "已下架"
  | "已調度";

export type SettlementStatus = "pending" | "deferred" | "settled";

export type Vendor = {
  id: string;
  code: string;
  name: string;
  phone: string;
  joined: string;
};

export type Log = { at: string; action: string; note: string };

export type Product = {
  inventory_id: string;
  scan_code: string;
  /** Compatibility alias for pre-stage-1 screens. Always equals inventory_id. */
  id: string;
  /** Compatibility alias for pre-stage-1 screens. Always equals scan_code. */
  code: string;
  category: string;
  name: string;
  brand: string;
  model: string;
  usSize: string;
  cmSize: string;
  color: string;
  cost: number;
  price: number;
  vendorId: string;
  location: string;
  consignmentStart: string;
  /** Legacy compatibility only. New inventory ends by sale/return/delist event. */
  consignmentEnd?: string;
  packaging: string;
  note: string;
  status: Status;
  createdAt: string;
  history: Log[];
};

export type Sale = {
  sale_id: string;
  checkout_id?: string;
  inventory_id: string;
  sold_at: string;
  sold_price: number;
  return_price: number;
  vendor_id: string;
  payment_method: string;
  settlement_status: SettlementStatus;
  /** Compatibility aliases for existing screens. */
  id: string;
  productId: string;
  soldAt: string;
  price: number;
  cost: number;
  profit: number;
  payment: string;
  discount: number;
  settled: boolean;
  settlementId?: string;
};

export type Settlement = {
  id: string;
  vendorId: string;
  saleIds: string[];
  totalSales: number;
  payout: number;
  profit: number;
  completedAt: string;
};

export type Store = {
  products: Product[];
  vendors: Vendor[];
  sales: Sale[];
  settlements: Settlement[];
};

export type InventoryInput = Omit<
  Product,
  "inventory_id" | "scan_code" | "id" | "code" | "status" | "createdAt" | "history"
> & { scan_code: string };

export type VendorInput = Omit<Vendor, "id">;

export type SaleInput = {
  inventory_id: string;
  sold_price: number;
  payment_method: string;
  discount: number;
};

export type DeleteInventoryInput = {
  inventory_id: string;
  confirm_scan_code: string;
};

export type ReturnInventoryInput = {
  inventory_id: string;
};

export type InventoryEditableFields = Pick<
  Product,
  | "category"
  | "name"
  | "brand"
  | "model"
  | "usSize"
  | "cmSize"
  | "color"
  | "cost"
  | "price"
  | "vendorId"
  | "packaging"
  | "location"
  | "consignmentStart"
  | "note"
>;

export type UpdateInventoryInput = {
  inventory_id: string;
  changes: InventoryEditableFields & { scan_code?: string };
  confirm_new_scan_code?: string;
};

export function normalizeScanCode(value: string) {
  return value.trim().toUpperCase();
}

export function getInitialInboundVendorId(vendors: Pick<Vendor, "id">[]) {
  return vendors[0]?.id ?? "";
}

export function isCurrentVendorId(
  vendors: Pick<Vendor, "id">[],
  vendorId: string,
) {
  return vendorId.length > 0 && vendors.some((vendor) => vendor.id === vendorId);
}

export function normalizeVendorCode(value: string) {
  return value.trim().toUpperCase();
}

export function createVendorInStore(
  store: Store,
  input: VendorInput,
  vendorId: string,
  createdOn: string,
): { store: Store; vendor: Vendor } {
  const id = vendorId.trim();
  const code = normalizeVendorCode(input.code);
  const name = input.name.trim();
  if (!id) throw new Error("VENDOR_ID_REQUIRED");
  if (!code) throw new Error("VENDOR_CODE_REQUIRED");
  if (!name) throw new Error("VENDOR_NAME_REQUIRED");
  if (store.vendors.some((vendor) => vendor.id === id))
    throw new Error("VENDOR_ID_EXISTS");
  if (
    store.vendors.some(
      (vendor) => normalizeVendorCode(vendor.code) === code,
    )
  )
    throw new Error("VENDOR_CODE_EXISTS");

  const vendor: Vendor = {
    id,
    code,
    name,
    phone: input.phone.trim(),
    joined: input.joined.trim() || createdOn,
  };
  return {
    vendor,
    store: { ...store, vendors: [...store.vendors, vendor] },
  };
}

export function normalizeStoreSchema(rawStore: Store): Store {
  const products = (rawStore.products || []).map((rawProduct) => {
    const legacy = rawProduct as Product & {
      inventory_id?: string;
      scan_code?: string;
    };
    const inventoryId = legacy.inventory_id || legacy.id;
    const scanCode = normalizeScanCode(legacy.scan_code || legacy.code);
    return {
      ...legacy,
      inventory_id: inventoryId,
      scan_code: scanCode,
      id: inventoryId,
      code: scanCode,
    };
  });

  const productById = new Map(products.map((product) => [product.inventory_id, product]));
  const sales = (rawStore.sales || []).map((rawSale) => {
    const legacy = rawSale as Sale & Partial<Sale>;
    const saleId = legacy.sale_id || legacy.id;
    const inventoryId = legacy.inventory_id || legacy.productId;
    const product = productById.get(inventoryId);
    const settlementStatus: SettlementStatus =
      legacy.settlement_status || (legacy.settled ? "settled" : "pending");
    const soldAt = legacy.sold_at || legacy.soldAt;
    const soldPrice = legacy.sold_price ?? legacy.price;
    const returnPrice = legacy.return_price ?? legacy.cost;
    const paymentMethod = legacy.payment_method || legacy.payment;
    return {
      ...legacy,
      sale_id: saleId,
      inventory_id: inventoryId,
      sold_at: soldAt,
      sold_price: soldPrice,
      return_price: returnPrice,
      vendor_id: legacy.vendor_id || product?.vendorId || "",
      payment_method: paymentMethod,
      settlement_status: settlementStatus,
      id: saleId,
      productId: inventoryId,
      soldAt,
      price: soldPrice,
      cost: returnPrice,
      payment: paymentMethod,
      settled: settlementStatus === "settled",
    };
  });

  return { ...rawStore, products, sales };
}

export function createInventoryInStore(
  store: Store,
  input: InventoryInput,
  inventoryId: string,
  createdAt: string,
): { store: Store; product: Product } {
  const scanCode = normalizeScanCode(input.scan_code);
  if (!scanCode) throw new Error("SCAN_CODE_REQUIRED");
  if (store.products.some((product) => normalizeScanCode(product.scan_code) === scanCode)) {
    throw new Error("SCAN_CODE_EXISTS");
  }

  const product: Product = {
    ...input,
    inventory_id: inventoryId,
    scan_code: scanCode,
    id: inventoryId,
    code: scanCode,
    status: "在庫",
    createdAt,
    history: [
      {
        at: createdAt,
        action: "商品入庫",
        note: `建立商品，位置 ${input.location} · inventory_id ${inventoryId}`,
      },
    ],
  };

  return {
    store: { ...store, products: [product, ...store.products] },
    product,
  };
}

export function deleteInventoryFromStore(
  store: Store,
  input: DeleteInventoryInput,
): { store: Store; product: Product } {
  const product = store.products.find(
    (item) => item.inventory_id === input.inventory_id,
  );
  if (!product) throw new Error("INVENTORY_NOT_FOUND");
  if (input.confirm_scan_code !== product.scan_code) {
    throw new Error("DELETE_SCAN_CODE_CONFIRMATION_MISMATCH");
  }

  const relatedSales = store.sales.filter(
    (sale) => sale.inventory_id === input.inventory_id,
  );
  const relatedSaleIds = new Set(relatedSales.map((sale) => sale.sale_id));
  const hasSettlement = store.settlements.some((settlement) =>
    settlement.saleIds.some((saleId) => relatedSaleIds.has(saleId)),
  );
  if (relatedSales.length > 0 || hasSettlement) {
    throw new Error("INVENTORY_HAS_FINANCIAL_HISTORY");
  }

  return {
    store: {
      ...store,
      products: store.products.filter(
        (item) => item.inventory_id !== input.inventory_id,
      ),
    },
    product,
  };
}

export function returnInventoryInStore(
  store: Store,
  input: ReturnInventoryInput,
  returnedAt: string,
): { store: Store; product: Product } {
  const inventoryId = input.inventory_id.trim();
  if (!inventoryId) throw new Error("INVENTORY_ID_REQUIRED");

  const product = store.products.find(
    (item) => item.inventory_id === inventoryId,
  );
  if (!product) throw new Error("INVENTORY_NOT_FOUND");
  if (product.status !== "在庫") throw new Error("INVENTORY_NOT_AVAILABLE");
  if (store.sales.some((sale) => sale.inventory_id === inventoryId)) {
    throw new Error("INVENTORY_HAS_FINANCIAL_HISTORY");
  }

  const returnedProduct: Product = {
    ...product,
    status: "已取回",
    history: [
      ...product.history,
      {
        at: returnedAt,
        action: "商品取回",
        note: "寄賣人取回商品",
      },
    ],
  };

  return {
    product: returnedProduct,
    store: {
      ...store,
      products: store.products.map((item) =>
        item.inventory_id === inventoryId ? returnedProduct : item,
      ),
    },
  };
}

function inventoryHasFinancialHistory(store: Store, inventoryId: string) {
  const saleIds = new Set(
    store.sales
      .filter((sale) => sale.inventory_id === inventoryId)
      .map((sale) => sale.sale_id),
  );
  return saleIds.size > 0 || store.settlements.some((settlement) =>
    settlement.saleIds.some((saleId) => saleIds.has(saleId)),
  );
}

export function updateInventoryInStore(
  store: Store,
  input: UpdateInventoryInput,
  updatedAt: string,
): { store: Store; product: Product } {
  const inventoryId = input.inventory_id.trim();
  const product = store.products.find((item) => item.inventory_id === inventoryId);
  if (!product) throw new Error("INVENTORY_NOT_FOUND");

  const fields = input.changes;
  const required = [
    fields.category,
    fields.name,
    fields.brand,
    fields.model,
    fields.usSize,
    fields.cmSize,
    fields.color,
    fields.vendorId,
    fields.packaging,
    fields.location,
    fields.consignmentStart,
  ];
  if (required.some((value) => !String(value).trim()))
    throw new Error("INVENTORY_EDIT_REQUIRED_FIELD");
  if (!Number.isFinite(fields.cost) || fields.cost < 0 || !Number.isFinite(fields.price) || fields.price < 0)
    throw new Error("INVENTORY_EDIT_INVALID_PRICE");
  if (!isCurrentVendorId(store.vendors, fields.vendorId))
    throw new Error("VENDOR_NOT_FOUND");
  if (
    inventoryHasFinancialHistory(store, inventoryId) &&
    (fields.vendorId !== product.vendorId || fields.cost !== product.cost)
  ) throw new Error("INVENTORY_FINANCIAL_FIELDS_LOCKED");

  let scanCode = product.scan_code;
  if (fields.scan_code !== undefined) {
    scanCode = normalizeScanCode(fields.scan_code);
    if (!scanCode) throw new Error("SCAN_CODE_REQUIRED");
    if (normalizeScanCode(input.confirm_new_scan_code || "") !== scanCode)
      throw new Error("SCAN_CODE_CONFIRMATION_MISMATCH");
    if (store.products.some((item) => item.inventory_id !== inventoryId && normalizeScanCode(item.scan_code) === scanCode))
      throw new Error("SCAN_CODE_EXISTS");
  }

  const nextProduct: Product = {
    ...product,
    ...fields,
    scan_code: scanCode,
    code: scanCode,
    inventory_id: product.inventory_id,
    id: product.id,
    status: product.status,
    createdAt: product.createdAt,
    history: [
      ...product.history,
      {
        at: updatedAt,
        action: fields.scan_code === undefined ? "商品資料修改" : "修改貨號",
        note: fields.scan_code === undefined
          ? "管理員更新商品詳細資料"
          : `貨號 ${product.scan_code} → ${scanCode}；舊實體條碼失效`,
      },
    ],
  };
  return {
    product: nextProduct,
    store: {
      ...store,
      products: store.products.map((item) => item.inventory_id === inventoryId ? nextProduct : item),
    },
  };
}

export function restoreInventoryInStore(
  store: Store,
  input: ReturnInventoryInput,
  restoredAt: string,
): { store: Store; product: Product } {
  const inventoryId = input.inventory_id.trim();
  const product = store.products.find((item) => item.inventory_id === inventoryId);
  if (!product) throw new Error("INVENTORY_NOT_FOUND");
  if (product.status !== "已取回") throw new Error("INVENTORY_NOT_RETURNED");
  if (inventoryHasFinancialHistory(store, inventoryId))
    throw new Error("INVENTORY_HAS_FINANCIAL_HISTORY");
  const nextProduct: Product = {
    ...product,
    status: "在庫",
    history: [
      ...product.history,
      { at: restoredAt, action: "取消取回／恢復在庫", note: "管理員確認取消取回，商品恢復可售庫存" },
    ],
  };
  return {
    product: nextProduct,
    store: {
      ...store,
      products: store.products.map((item) => item.inventory_id === inventoryId ? nextProduct : item),
    },
  };
}

export function sellInventoryInStore(
  store: Store,
  input: SaleInput,
  saleId: string,
  soldAt: string,
): { store: Store; sale: Sale } {
  const product = store.products.find(
    (item) => item.inventory_id === input.inventory_id,
  );
  if (!product) throw new Error("INVENTORY_NOT_FOUND");
  if (product.status !== "在庫") throw new Error("INVENTORY_NOT_AVAILABLE");
  if (store.sales.some((sale) => sale.inventory_id === input.inventory_id)) {
    throw new Error("INVENTORY_ALREADY_SOLD");
  }
  if (!Number.isFinite(input.sold_price) || input.sold_price <= 0) {
    throw new Error("INVALID_SALE_PRICE");
  }

  const sale: Sale = {
    sale_id: saleId,
    inventory_id: product.inventory_id,
    sold_at: soldAt,
    sold_price: input.sold_price,
    return_price: product.cost,
    vendor_id: product.vendorId,
    payment_method: input.payment_method,
    settlement_status: "pending",
    id: saleId,
    productId: product.inventory_id,
    soldAt,
    price: input.sold_price,
    cost: product.cost,
    profit: input.sold_price - product.cost,
    payment: input.payment_method,
    discount: input.discount,
    settled: false,
  };

  const nextProducts = store.products.map((item) =>
    item.inventory_id === product.inventory_id
      ? {
          ...item,
          status: "已售出" as const,
          history: [
            ...item.history,
            {
              at: soldAt,
              action: "商品售出",
              note: `${input.payment_method} · 成交價 NT$ ${Math.round(input.sold_price).toLocaleString("zh-TW")} · sale_id ${saleId}`,
            },
          ],
        }
      : item,
  );

  return {
    store: { ...store, sales: [...store.sales, sale], products: nextProducts },
    sale,
  };
}
