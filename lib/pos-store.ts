import type { Store } from "@/app/pos-app";
import { supabase } from "@/lib/supabase";

export const POS_STORAGE_KEY = "kicks-center-pos-v1";
const POS_STATE_ID = "main";

export type SyncSource = "cloud" | "local";

function readLocalStore(fallback: Store): Store {
  try {
    const saved = window.localStorage.getItem(POS_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Store) : fallback;
  } catch {
    return fallback;
  }
}

export async function loadPosStore(fallback: Store): Promise<{
  store: Store;
  source: SyncSource;
}> {
  const localStore = readLocalStore(fallback);
  if (!supabase) return { store: localStore, source: "local" };

  const { data, error } = await supabase
    .from("kc_pos_state")
    .select("payload")
    .eq("id", POS_STATE_ID)
    .maybeSingle();

  if (error) {
    console.error("Unable to load KICKS CENTER cloud state", error);
    return { store: localStore, source: "local" };
  }

  if (data?.payload) {
    const cloudStore = data.payload as Store;
    window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(cloudStore));
    return { store: cloudStore, source: "cloud" };
  }

  const { error: seedError } = await supabase.from("kc_pos_state").upsert({
    id: POS_STATE_ID,
    payload: localStore,
    updated_at: new Date().toISOString(),
  });

  if (seedError) {
    console.error("Unable to initialize KICKS CENTER cloud state", seedError);
    return { store: localStore, source: "local" };
  }

  return { store: localStore, source: "cloud" };
}

export async function savePosStore(store: Store): Promise<SyncSource> {
  window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(store));
  if (!supabase) return "local";

  const { error } = await supabase.from("kc_pos_state").upsert({
    id: POS_STATE_ID,
    payload: store,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Unable to save KICKS CENTER cloud state", error);
    return "local";
  }

  return "cloud";
}
