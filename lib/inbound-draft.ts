export const INBOUND_DRAFT_STORAGE_KEY = "kicks-center-inbound-draft-v1";

export type InboundDraft = {
  code: string;
  category: string;
  name: string;
  brand: string;
  model: string;
  usSize: string;
  cmSize: string;
  color: string;
  cost: string;
  price: string;
  vendorId: string;
  location: string;
  consignmentStart: string;
  packaging: string;
  note: string;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const draftKeys = [
  "code",
  "category",
  "name",
  "brand",
  "model",
  "usSize",
  "cmSize",
  "color",
  "cost",
  "price",
  "vendorId",
  "location",
  "consignmentStart",
  "packaging",
  "note",
] as const satisfies ReadonlyArray<keyof InboundDraft>;

export function loadInboundDraft(
  storage: DraftStorage,
  defaults: InboundDraft,
  validVendorIds: ReadonlySet<string>,
): InboundDraft {
  try {
    const raw = storage.getItem(INBOUND_DRAFT_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;

    const restored = { ...defaults };
    for (const key of draftKeys) {
      if (typeof parsed[key] === "string") restored[key] = parsed[key];
    }
    if (!validVendorIds.has(restored.vendorId)) {
      restored.vendorId = defaults.vendorId;
    }
    return restored;
  } catch {
    return defaults;
  }
}

export function saveInboundDraft(storage: DraftStorage, draft: InboundDraft) {
  storage.setItem(INBOUND_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearInboundDraft(storage: DraftStorage) {
  storage.removeItem(INBOUND_DRAFT_STORAGE_KEY);
}
