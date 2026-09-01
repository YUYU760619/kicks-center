import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedOrigins = new Set(
  (Deno.env.get("KC_ALLOWED_ORIGINS") ??
    "https://kicks-center.vercel.app,http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

type VendorAccountAction = "status" | "create" | "disable" | "reset_password";
type RequestBody = {
  action?: VendorAccountAction;
  vendor_id?: string;
  email?: string;
  password?: string;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://kicks-center.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(request, { error: "SERVER_CONFIGURATION_ERROR" }, 500);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return json(request, { error: "AUTHENTICATION_REQUIRED" }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return json(request, { error: "AUTHENTICATION_REQUIRED" }, 401);
  }
  const { data: adminMember, error: memberError } = await callerClient
    .from("kc_app_members")
    .select("user_id, role, active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (
    memberError ||
    !adminMember ||
    adminMember.user_id !== userData.user.id ||
    adminMember.role !== "admin" ||
    adminMember.active !== true
  ) {
    return json(request, { error: "ACTIVE_ADMIN_REQUIRED" }, 403);
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json(request, { error: "INVALID_JSON" }, 400);
  }
  const vendorId = body.vendor_id?.trim() ?? "";
  if (!vendorId) return json(request, { error: "VENDOR_ID_REQUIRED" }, 400);

  const { data: state, error: stateError } = await serviceClient
    .from("kc_pos_state")
    .select("payload")
    .eq("id", "main")
    .single();
  const vendors = Array.isArray(state?.payload?.vendors) ? state.payload.vendors : [];
  const vendor = vendors.find(
    (item: unknown) =>
      typeof item === "object" && item !== null &&
      (item as { id?: unknown }).id === vendorId,
  ) as { id: string; code?: string; name?: string } | undefined;
  if (stateError || !vendor) return json(request, { error: "VENDOR_NOT_FOUND" }, 404);

  const findBinding = async () => {
    const { data, error } = await serviceClient
      .from("kc_app_members")
      .select("user_id, vendor_id, active, updated_at")
      .eq("role", "vendor")
      .eq("vendor_id", vendorId)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  try {
    if (body.action === "status") {
      const binding = await findBinding();
      if (!binding) return json(request, { linked: false, vendor_id: vendorId });
      const { data, error } = await serviceClient.auth.admin.getUserById(binding.user_id);
      if (error || !data.user) throw error ?? new Error("AUTH_USER_NOT_FOUND");
      return json(request, {
        linked: true,
        vendor_id: vendorId,
        email: data.user.email ?? "",
        active: binding.active,
        user_id: binding.user_id,
        updated_at: binding.updated_at,
      });
    }

    if (body.action === "create") {
      if (await findBinding()) return json(request, { error: "VENDOR_ACCOUNT_EXISTS" }, 409);
      const email = normalizeEmail(body.email ?? "");
      const password = body.password ?? "";
      if (!email || !email.includes("@")) return json(request, { error: "VALID_EMAIL_REQUIRED" }, 400);
      if (password.length < 10) return json(request, { error: "PASSWORD_TOO_SHORT" }, 400);

      const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { kc_portal: "vendor", vendor_id: vendorId },
      });
      if (createError || !created.user) {
        return json(request, { error: "AUTH_USER_CREATE_FAILED" }, 409);
      }

      const { error: bindError } = await callerClient.rpc("kc_admin_set_member_access", {
        p_email: email,
        p_role: "vendor",
        p_vendor_id: vendorId,
        p_active: true,
      });
      if (bindError) {
        await serviceClient.auth.admin.deleteUser(created.user.id);
        throw bindError;
      }
      return json(request, { linked: true, vendor_id: vendorId, email, active: true });
    }

    const binding = await findBinding();
    if (!binding) return json(request, { error: "VENDOR_ACCOUNT_NOT_FOUND" }, 404);

    if (body.action === "disable") {
      const { error: banError } = await serviceClient.auth.admin.updateUserById(
        binding.user_id,
        { ban_duration: "876000h" },
      );
      if (banError) throw banError;
      const { error: disableError } = await callerClient.rpc("kc_admin_set_member_access", {
        p_email: (await serviceClient.auth.admin.getUserById(binding.user_id)).data.user?.email ?? "",
        p_role: "vendor",
        p_vendor_id: vendorId,
        p_active: false,
      });
      if (disableError) {
        await serviceClient.auth.admin.updateUserById(binding.user_id, { ban_duration: "none" });
        throw disableError;
      }
      return json(request, { linked: true, vendor_id: vendorId, active: false });
    }

    if (body.action === "reset_password") {
      const password = body.password ?? "";
      if (password.length < 10) return json(request, { error: "PASSWORD_TOO_SHORT" }, 400);
      const { error } = await serviceClient.auth.admin.updateUserById(binding.user_id, { password });
      if (error) throw error;
      return json(request, { linked: true, vendor_id: vendorId, password_reset: true });
    }

    return json(request, { error: "INVALID_ACTION" }, 400);
  } catch (error) {
    console.error("Vendor account operation failed", {
      action: body.action,
      vendor_id: vendorId,
      actor_id: userData.user.id,
      error,
    });
    return json(request, { error: "VENDOR_ACCOUNT_OPERATION_FAILED" }, 500);
  }
});
