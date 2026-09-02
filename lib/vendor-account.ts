import { adminSupabase } from "@/lib/supabase";

export type VendorAccountStatus = {
  linked: boolean;
  vendor_id: string;
  email?: string;
  active?: boolean;
  user_id?: string;
  updated_at?: string;
  password_reset?: boolean;
};

type VendorAccountAction = "status" | "create" | "disable" | "reset_password";

export class VendorAccountError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "VendorAccountError";
  }
}

export async function manageVendorAccount(input: {
  action: VendorAccountAction;
  vendor_id: string;
  email?: string;
  password?: string;
}): Promise<VendorAccountStatus> {
  if (!adminSupabase) throw new VendorAccountError("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await adminSupabase.functions.invoke("kc-admin-vendor-account", {
    body: input,
  });
  const payload = data as (VendorAccountStatus & { error?: string }) | null;
  if (error || !payload || payload.error) {
    throw new VendorAccountError(payload?.error || "VENDOR_ACCOUNT_OPERATION_FAILED");
  }
  return payload;
}
