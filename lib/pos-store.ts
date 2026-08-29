import type { Store } from "@/app/pos-app";
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
    store: data.payload as Store,
    source: "cloud",
    updatedAt: String(data.updated_at),
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
