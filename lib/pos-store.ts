import {
  normalizeStoreSchema,
  type DeleteInventoryInput,
  type InventoryInput,
  type SaleInput,
  type Store,
  type VendorInput,
} from "@/lib/pos-core";
import { clearSensitiveBrowserState } from "@/lib/security-storage";
import { supabase } from "@/lib/supabase";

const POS_STATE_ID = "main";

export type SyncSource = "cloud";

export class PosStoreConflictError extends Error {
  constructor() {
    super("POS data changed in another session");
    this.name = "PosStoreConflictError";
  }
}

export class PosOperationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PosOperationError";
  }
}

export async function loadPosStore(): Promise<{
  store: Store;
  source: SyncSource;
  updatedAt: string;
}> {
  clearSensitiveBrowserState();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .from("kc_pos_state")
    .select("payload, updated_at")
    .eq("id", POS_STATE_ID)
    .single();

  if (error || !data?.payload || !data.updated_at) {
    console.error("Unable to load KICKS CENTER cloud state", error);
    throw new Error("Unable to load KICKS CENTER cloud state");
  }

  return {
    store: normalizeStoreSchema(data.payload as Store),
    source: "cloud",
    updatedAt: String(data.updated_at),
  };
}

type MutationRow = {
  payload?: Store;
  updated_at?: string;
  inventory_id?: string;
  sale_id?: string;
  deleted_inventory_id?: string;
  vendor_id?: string;
};

function operationError(error: { code?: string; message: string }) {
  if (error.code === "40001" || error.message.includes("reload required")) {
    return new PosStoreConflictError();
  }
  return new PosOperationError(error.message, error.code || "POS_OPERATION_FAILED");
}

export async function createInventoryItem(
  input: InventoryInput,
  expectedUpdatedAt: string,
): Promise<{ store: Store; updatedAt: string; inventoryId: string }> {
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .rpc("kc_staff_create_inventory_item", {
      p_item: input,
      p_expected_updated_at: expectedUpdatedAt,
    })
    .single();

  if (error) throw operationError(error);
  const row = data as MutationRow | null;
  if (!row?.payload || !row.updated_at || !row.inventory_id) {
    throw new PosOperationError("Inventory creation returned incomplete data", "INVALID_RESPONSE");
  }

  return {
    store: normalizeStoreSchema(row.payload),
    updatedAt: row.updated_at,
    inventoryId: row.inventory_id,
  };
}

export async function createVendorItem(
  input: VendorInput,
  expectedUpdatedAt: string,
): Promise<{ store: Store; updatedAt: string; vendorId: string }> {
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .rpc("kc_admin_create_vendor", {
      p_vendor: input,
      p_expected_updated_at: expectedUpdatedAt,
    })
    .single();

  if (error) throw operationError(error);
  const row = data as MutationRow | null;
  if (!row?.payload || !row.updated_at || !row.vendor_id) {
    throw new PosOperationError("Vendor creation returned incomplete data", "INVALID_RESPONSE");
  }

  return {
    store: normalizeStoreSchema(row.payload),
    updatedAt: row.updated_at,
    vendorId: row.vendor_id,
  };
}

export async function deleteInventoryItem(
  input: DeleteInventoryInput,
  expectedUpdatedAt: string,
): Promise<{ store: Store; updatedAt: string; deletedInventoryId: string }> {
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .rpc("kc_admin_delete_inventory_item", {
      p_inventory_id: input.inventory_id,
      p_confirm_scan_code: input.confirm_scan_code,
      p_expected_updated_at: expectedUpdatedAt,
    })
    .single();

  if (error) throw operationError(error);
  const row = data as MutationRow | null;
  if (!row?.payload || !row.updated_at || !row.deleted_inventory_id) {
    throw new PosOperationError("Inventory deletion returned incomplete data", "INVALID_RESPONSE");
  }

  return {
    store: normalizeStoreSchema(row.payload),
    updatedAt: row.updated_at,
    deletedInventoryId: row.deleted_inventory_id,
  };
}

export async function sellInventoryItem(
  input: SaleInput,
  expectedUpdatedAt: string,
): Promise<{ store: Store; updatedAt: string; saleId: string }> {
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .rpc("kc_staff_sell_inventory_item", {
      p_inventory_id: input.inventory_id,
      p_sold_price: input.sold_price,
      p_payment_method: input.payment_method,
      p_discount: input.discount,
      p_expected_updated_at: expectedUpdatedAt,
    })
    .single();

  if (error) throw operationError(error);
  const row = data as MutationRow | null;
  if (!row?.payload || !row.updated_at || !row.sale_id) {
    throw new PosOperationError("Sale returned incomplete data", "INVALID_RESPONSE");
  }

  return {
    store: normalizeStoreSchema(row.payload),
    updatedAt: row.updated_at,
    saleId: row.sale_id,
  };
}

export async function savePosStore(
  store: Store,
  expectedUpdatedAt: string,
  actionSummary = "POS 主資料更新",
): Promise<{ source: SyncSource; updatedAt: string }> {
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .rpc("kc_staff_save_pos_state", {
      p_payload: store,
      p_expected_updated_at: expectedUpdatedAt,
      p_action_summary: actionSummary,
    })
    .single();

  if (error) {
    console.error("Unable to save KICKS CENTER cloud state", error);
    if (error.code === "40001" || error.message.includes("reload required")) {
      throw new PosStoreConflictError();
    }
    throw new Error("Unable to save KICKS CENTER cloud state");
  }

  const updatedAt = (data as { updated_at?: string } | null)?.updated_at;
  if (!updatedAt) throw new Error("Cloud save did not return a version");
  return { source: "cloud", updatedAt };
}

export function clearPosStoreFromDevice() {
  clearSensitiveBrowserState();
}
