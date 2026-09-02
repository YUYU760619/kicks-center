"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clearSensitiveBrowserState } from "@/lib/security-storage";
import { getPortalSupabase, type AuthPortal } from "@/lib/supabase";

type AuthStatus = "checking" | "signed-out" | "authorized" | "forbidden" | "misconfigured" | "error";
type Member = {
  user_id: string;
  role: "admin" | "staff" | "vendor";
  vendor_id: string | null;
  active: boolean;
};

export function AuthGate({ children, portal = "staff" }: { children: ReactNode; portal?: AuthPortal }) {
  const portalSupabase = getPortalSupabase(portal);
  const [status, setStatus] = useState<AuthStatus>(() => portalSupabase ? "checking" : "misconfigured");
  const [member, setMember] = useState<Member | null>(null);
  const [validatedPortal, setValidatedPortal] = useState<AuthPortal | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const authorizationSequence = useRef(0);

  useEffect(() => {
    if (!portalSupabase) return;

    let active = true;
    const beginAuthorization = () => {
      const requestId = ++authorizationSequence.current;
      if (active) {
        setStatus("checking");
        setMember(null);
        setValidatedPortal(null);
      }
      return requestId;
    };
    async function authorize(session: Session | null, requestId: number) {
      if (!active || requestId !== authorizationSequence.current) return;
      if (!session) {
        clearSensitiveBrowserState();
        setMember(null);
        setValidatedPortal(portal);
        setStatus("signed-out");
        return;
      }

      const sessionUserId = session.user.id;
      const { data, error: memberError } = await portalSupabase!
        .from("kc_app_members")
        .select("user_id, role, vendor_id, active")
        .eq("user_id", sessionUserId)
        .maybeSingle();

      if (!active || requestId !== authorizationSequence.current) return;
      if (memberError) {
        setMember(null);
        setValidatedPortal(portal);
        setStatus("error");
        return;
      }

      const resolved = data as Member | null;
      if (!resolved || resolved.user_id !== sessionUserId) {
        setMember(null);
        setValidatedPortal(portal);
        setStatus("forbidden");
        return;
      }

      setMember(resolved);
      const allowed = resolved.active && (
        portal === "admin"
          ? resolved.role === "admin"
          : portal === "staff"
            ? resolved.role === "admin" || resolved.role === "staff"
            : resolved.role === "vendor" && Boolean(resolved.vendor_id)
      );
      setValidatedPortal(portal);
      setStatus(allowed ? "authorized" : "forbidden");
    }

    async function revalidate() {
      const requestId = beginAuthorization();
      const { data, error: sessionError } = await portalSupabase!.auth.getSession();
      if (!active || requestId !== authorizationSequence.current) return;
      if (sessionError) {
        setMember(null);
        setValidatedPortal(portal);
        setStatus("error");
        return;
      }
      await authorize(data.session, requestId);
    }

    const { data } = portalSupabase.auth.onAuthStateChange((_event, session) => {
      const requestId = beginAuthorization();
      void authorize(session, requestId);
    });
    void revalidate();

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void revalidate();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      active = false;
      authorizationSequence.current += 1;
      window.removeEventListener("pageshow", handlePageShow);
      data.subscription.unsubscribe();
    };
  }, [portal, portalSupabase]);

  const visibleStatus = !portalSupabase
    ? "misconfigured"
    : validatedPortal === portal
      ? status
      : "checking";

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!portalSupabase) {
      setStatus("misconfigured");
      return;
    }
    setSubmitting(true);
    setError("");
    const { error: loginError } = await portalSupabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (loginError) setError("登入失敗，請確認帳號與密碼。 ");
    setSubmitting(false);
  }

  async function logout() {
    clearSensitiveBrowserState();
    if (portalSupabase) await portalSupabase.auth.signOut();
  }

  if (visibleStatus === "checking") {
    return <div className="grid min-h-screen place-items-center bg-[#11151a] text-sm text-[#98a2ad]">正在確認登入狀態…</div>;
  }

  if (visibleStatus === "misconfigured" || visibleStatus === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#11151a] px-5 text-[#e7eaee]">
        <div className="w-full max-w-[520px] rounded-3xl border border-[#d96c6c]/25 bg-[#1d232b] p-8 text-center shadow-2xl">
          <div className="text-3xl">🔒</div>
          <h1 className="mt-5 text-xl font-black">系統已安全鎖定</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {visibleStatus === "misconfigured" ? "正式環境缺少必要的 Supabase 安全設定，系統拒絕開放。" : "無法驗證帳號權限，請稍後重試或聯絡管理員。"}
          </p>
        </div>
      </main>
    );
  }

  if (visibleStatus === "forbidden") {
    const isVendor = member?.role === "vendor";
    const isStaffDeniedBackend = portal === "admin" && member?.role === "staff";
    const destination = isStaffDeniedBackend ? "/pos" : isVendor ? "/vendor" : "/";
    const destinationLabel = isStaffDeniedBackend ? "前往 POS" : `前往${isVendor ? "供應商" : "員工"}入口`;
    return (
      <main className="grid min-h-screen place-items-center bg-[#11151a] px-5 text-[#e7eaee]">
        <div className="w-full max-w-[520px] rounded-3xl border border-[#e8893a]/25 bg-[#1d232b] p-8 text-center shadow-2xl">
          <div className="text-3xl">⛔</div>
          <h1 className="mt-5 text-xl font-black">{isStaffDeniedBackend ? "沒有後台權限" : "此帳號沒有這個入口的權限"}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {isStaffDeniedBackend ? "此帳號僅能使用 POS 收銀系統。" : "帳號已登入，但系統角色與目前入口不符，資料庫已拒絕存取。"}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={destination} className="rounded-xl bg-[#e8893a] px-5 py-3 text-sm font-black text-[#17120e]">
              {destinationLabel}
            </Link>
            <button onClick={logout} className="rounded-xl border border-[#46515e] px-5 py-3 text-sm font-bold text-[#c8ced5]">登出帳號</button>
          </div>
        </div>
      </main>
    );
  }

  if (visibleStatus === "signed-out") {
    const vendorPortal = portal === "vendor";
    return (
      <main className="grid min-h-screen place-items-center bg-[#11151a] px-5 text-[#e7eaee]">
        <form onSubmit={login} className="w-full max-w-[420px] rounded-3xl border border-[#303944] bg-[#1d232b] p-7 shadow-2xl sm:p-9">
          <div className="mb-8 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8893a] text-lg font-black text-[#17120e]">KC</div>
            <div><div className="font-black tracking-[.08em]">KICKS CENTER</div><div className="mt-1 text-[10px] font-bold tracking-[.22em] text-[#e8893a]">POS SYSTEM</div></div>
          </div>
          <h1 className="text-2xl font-black">{vendorPortal ? "供應商登入" : "員工登入"}</h1>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{vendorPortal ? "僅限受邀並已綁定寄賣廠商的帳號。" : "僅限 KICKS CENTER 已授權員工帳號。"}</p>
          <label className="mt-7 block text-[10px] font-bold text-zinc-500">EMAIL</label>
          <input autoFocus type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="kc-input mt-2" placeholder="name@kickscenter.com" />
          <label className="mt-4 block text-[10px] font-bold text-zinc-500">密碼</label>
          <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="kc-input mt-2" placeholder="••••••••" />
          {error && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-400">{error}</div>}
          <button disabled={submitting} className="mt-6 w-full rounded-xl bg-[#e8893a] px-4 py-3.5 text-sm font-black text-[#17120e] hover:bg-[#f09a52] disabled:opacity-50">{submitting ? "登入中…" : vendorPortal ? "登入供應商中心" : "登入 POS 系統"}</button>
          <Link href={vendorPortal ? "/" : "/vendor"} className="mt-5 block text-center text-xs font-bold text-zinc-500 hover:text-orange-400">
            前往{vendorPortal ? "員工 POS" : "供應商"}入口
          </Link>
        </form>
      </main>
    );
  }

  return visibleStatus === "authorized" ? children : null;
}
