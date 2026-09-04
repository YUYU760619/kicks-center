import { adminSupabase } from "@/lib/supabase";
import { vendorSupabase } from "@/lib/supabase";

export type VendorPortalProduct = {
  id: string;
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
  status: string;
  packaging: string;
  consignmentStart: string;
  consignmentEnd?: string;
  createdAt: string;
  history: Array<{ at: string; action: string; note: string }>;
};

export type VendorPortalSale = {
  id: string;
  productId: string;
  cost: number;
  price: number;
  soldAt: string;
  settled: boolean;
  settlementId?: string;
};

export type VendorPortalSettlement = {
  id: string;
  saleIds: string[];
  payout: number;
  totalSales: number;
  completedAt: string;
};

export type VendorPortalSnapshot = {
  vendor: { id: string; code: string; name: string; phone?: string; joined?: string };
  products: VendorPortalProduct[];
  sales: VendorPortalSale[];
  settlements: VendorPortalSettlement[];
};

export async function loadVendorPortalSnapshot(): Promise<VendorPortalSnapshot> {
  if (!vendorSupabase) throw new Error("Supabase is not configured");
  const { data, error } = await vendorSupabase.rpc("kc_vendor_portal_snapshot");
  if (error || !data) {
    console.error("Unable to load vendor portal", error);
    throw new Error("Unable to load vendor portal");
  }
  return data as VendorPortalSnapshot;
}

export async function loadAdminVendorPreview(vendorId: string): Promise<VendorPortalSnapshot> {
  if (!adminSupabase) throw new Error("Supabase is not configured");
  const normalizedVendorId = vendorId.trim();
  if (!normalizedVendorId) throw new Error("Vendor ID is required");
  const { data, error } = await adminSupabase.rpc("kc_admin_get_vendor_preview", {
    p_vendor_id: normalizedVendorId,
  });
  if (error || !data) {
    console.error("Unable to load admin vendor preview", error);
    throw new Error("Unable to load admin vendor preview");
  }
  return data as VendorPortalSnapshot;
}
