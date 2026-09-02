import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export type AuthPortal = "admin" | "staff" | "vendor";

export const AUTH_STORAGE_KEYS: Record<AuthPortal, string> = {
  admin: "kc-auth-admin",
  staff: "kc-auth-staff",
  vendor: "kc-auth-vendor",
};

function createPortalClient(portal: AuthPortal): SupabaseClient | null {
  if (!supabaseUrl || !supabasePublishableKey) return null;
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storageKey: AUTH_STORAGE_KEYS[portal],
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

export const adminSupabase = createPortalClient("admin");
export const staffSupabase = createPortalClient("staff");
export const vendorSupabase = createPortalClient("vendor");

const portalClients: Record<AuthPortal, SupabaseClient | null> = {
  admin: adminSupabase,
  staff: staffSupabase,
  vendor: vendorSupabase,
};

export function getPortalSupabase(portal: AuthPortal) {
  return portalClients[portal];
}

export const isSupabaseConfigured = Boolean(
  adminSupabase && staffSupabase && vendorSupabase,
);
