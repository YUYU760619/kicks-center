import { normalizeScanCode } from "@/lib/pos-core";
import { supabase } from "@/lib/supabase";

export type PosInventoryItem = {
  inventory_id: string;
  scan_code: string;
  name: string;
  model: string;
  us_size: string;
  cm_size: string;
  price: number;
  status: string;
};

export type PosSaleReceipt = {
  sale_id: string;
  inventory_id: string;
  sold_at: string;
  sold_price: number;
  payment_method: string;
  status: string;
};

export type PosCartItemInput = {
  inventory_id: string;
  expected_price: number;
};

export type PosCartSaleLineReceipt = PosSaleReceipt & {
  checkout_id: string;
};

export type PosCartSaleReceipt = {
  checkout_id: string;
  sold_at: string;
  payment_method: string;
  item_count: number;
  subtotal: number;
  discount: number;
  total: number;
  lines: PosCartSaleLineReceipt[];
};

type RpcError = {
  code?: string;
  message: string;
};

export class PosRegisterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PosRegisterError";
  }
}

function registerError(error: RpcError) {
  return new PosRegisterError(error.message, error.code || "POS_OPERATION_FAILED");
}

export async function lookupPosInventory(scanCode: string): Promise<PosInventoryItem | null> {
  if (!supabase) throw new PosRegisterError("Supabase is not configured", "NOT_CONFIGURED");

  const normalizedCode = normalizeScanCode(scanCode);
  if (!normalizedCode) throw new PosRegisterError("SCAN_CODE_REQUIRED", "INVALID_SCAN_CODE");

  const { data, error } = await supabase
    .rpc("kc_pos_lookup_inventory", { p_scan_code: normalizedCode })
    .maybeSingle();

  if (error) throw registerError(error);
  if (!data) return null;

  const row = data as Partial<PosInventoryItem>;
  if (
    !row.inventory_id ||
    !row.scan_code ||
    !row.name ||
    row.price === undefined ||
    !row.status
  ) {
    throw new PosRegisterError("POS lookup returned incomplete data", "INVALID_RESPONSE");
  }

  return {
    inventory_id: row.inventory_id,
    scan_code: row.scan_code,
    name: row.name,
    model: row.model || "",
    us_size: row.us_size || "",
    cm_size: row.cm_size || "",
    price: Number(row.price),
    status: row.status,
  };
}

export async function completePosSale(input: {
  inventory_id: string;
  sold_price: number;
  payment_method: string;
  discount: number;
}): Promise<PosSaleReceipt> {
  if (!supabase) throw new PosRegisterError("Supabase is not configured", "NOT_CONFIGURED");

  const { data, error } = await supabase
    .rpc("kc_pos_complete_sale", {
      p_inventory_id: input.inventory_id,
      p_sold_price: input.sold_price,
      p_payment_method: input.payment_method,
      p_discount: input.discount,
    })
    .single();

  if (error) throw registerError(error);
  const row = data as Partial<PosSaleReceipt> | null;
  if (
    !row?.sale_id ||
    !row.inventory_id ||
    !row.sold_at ||
    row.sold_price === undefined ||
    !row.payment_method ||
    !row.status
  ) {
    throw new PosRegisterError("POS sale returned incomplete data", "INVALID_RESPONSE");
  }

  return {
    sale_id: row.sale_id,
    inventory_id: row.inventory_id,
    sold_at: row.sold_at,
    sold_price: Number(row.sold_price),
    payment_method: row.payment_method,
    status: row.status,
  };
}

export async function completePosCartSale(input: {
  items: PosCartItemInput[];
  discount: number;
  payment_method: string;
}): Promise<PosCartSaleReceipt> {
  if (!supabase) throw new PosRegisterError("Supabase is not configured", "NOT_CONFIGURED");

  const { data, error } = await supabase.rpc("kc_pos_complete_cart_sale", {
    p_items: input.items,
    p_discount: input.discount,
    p_payment_method: input.payment_method,
  });

  if (error) throw registerError(error);
  if (!Array.isArray(data) || data.length !== input.items.length || data.length === 0) {
    throw new PosRegisterError("POS checkout returned incomplete data", "INVALID_RESPONSE");
  }

  const lines = data.map((value) => {
    const row = value as Partial<PosCartSaleLineReceipt> & {
      item_count?: number;
      subtotal?: number;
      discount?: number;
      total?: number;
    };
    if (
      !row.checkout_id ||
      !row.sale_id ||
      !row.inventory_id ||
      !row.sold_at ||
      row.sold_price === undefined ||
      !row.payment_method ||
      !row.status
    ) {
      throw new PosRegisterError("POS checkout returned incomplete data", "INVALID_RESPONSE");
    }
    return {
      checkout_id: row.checkout_id,
      sale_id: row.sale_id,
      inventory_id: row.inventory_id,
      sold_at: row.sold_at,
      sold_price: Number(row.sold_price),
      payment_method: row.payment_method,
      status: row.status,
    } satisfies PosCartSaleLineReceipt;
  });

  const summary = data[0] as {
    item_count?: number;
    subtotal?: number;
    discount?: number;
    total?: number;
  };
  const checkoutId = lines[0].checkout_id;
  const soldAt = lines[0].sold_at;
  const paymentMethod = lines[0].payment_method;
  const itemCount = Number(summary.item_count);
  const subtotal = Number(summary.subtotal);
  const discount = Number(summary.discount);
  const total = Number(summary.total);

  if (
    !lines.every(
      (line) =>
        line.checkout_id === checkoutId &&
        line.sold_at === soldAt &&
        line.payment_method === paymentMethod,
    ) ||
    itemCount !== lines.length ||
    !Number.isFinite(subtotal) ||
    !Number.isFinite(discount) ||
    !Number.isFinite(total) ||
    Math.abs(lines.reduce((sum, line) => sum + line.sold_price, 0) - total) > 0.000001
  ) {
    throw new PosRegisterError("POS checkout returned inconsistent data", "INVALID_RESPONSE");
  }

  return {
    checkout_id: checkoutId,
    sold_at: soldAt,
    payment_method: paymentMethod,
    item_count: itemCount,
    subtotal,
    discount,
    total,
    lines,
  };
}
