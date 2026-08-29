"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { clearSensitiveBrowserState } from "@/lib/security-storage";
import { supabase } from "@/lib/supabase";

type Portal = "staff" | "vendor";
type AuthStatus = "checking" | "signed-out" | "authorized" | "forbidden" | "misconfigured" | "error";
type Member = {
  user_id: string;
  role: "admin" | "staff" | "vendor";
  vendor_id: string | null;
  active: boolean;
};

export function AuthGate({ children, portal = "staff" }: { children: ReactNode; portal?: Portal }) {
  const [status, setStatus] = useState<AuthStatus>(() => supabase ? "checking" : "misconfigured");
  const [member, setMember] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    async function authorize(session: Session | null) {
      if (!active) return;
      if (!session) {
        clearSensitiveBrowserState();
        setMember(null);
        setStatus("signed-out");
        return;
      }

      const { data, error: memberError } = await supabase!
        .from("kc_app_members")
        .select("user_id, role, vendor_id, active")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!active) return;
      if (memberError) {
        setStatus("error");
        return;
      }

      const resolved = data as Member | null;
      setMember(resolved);
      const allowed = resolved?.active && (
        portal === "staff"
          ? resolved.role === "admin" || resolved.role === "staff"
          : resolved.role === "vendor" && Boolean(resolved.vendor_id)
      );
      setStatus(allowed ? "authorized" : "forbidden");
    }

    supabase.auth.getSession().then(({ data }) => authorize(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void authorize(session);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [portal]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setStatus("misconfigured");
      return;
    }
    setSubmitting(true);
    setError("");
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (loginError) setError("登入失敗，請確認帳號與密碼。 ");
    setSubmitting(false);
  }

  async function logout() {
    clearSensitiveBrowserState();
    if (supabase) await supabase.auth.signOut();
  }

  if (status === "checking") {
    return <div className="grid min-h-screen place-items-center bg-[#090a0c] text-sm text-zinc-500">正在確認登入狀態…</div>;
  }

  if (status === "misconfigured" || status === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#090a0c] px-5 text-white">
        <div className="w-full max-w-[520px] rounded-3xl border border-red-500/20 bg-[#111317] p-8 text-center shadow-2xl">
          <div className="text-3xl">🔒</div>
          <h1 className="mt-5 text-xl font-black">系統已安全鎖定</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {status === "misconfigured" ? "正式環境缺少必要的 Supabase 安全設定，系統拒絕開放。" : "無法驗證帳號權限，請稍後重試或聯絡管理員。"}
          </p>
        </div>
      </main>
    );
  }

  if (status === "forbidden") {
    const isVendor = member?.role === "vendor";
    return (
      <main className="grid min-h-screen place-items-center bg-[#090a0c] px-5 text-white">
        <div className="w-full max-w-[520px] rounded-3xl border border-orange-500/20 bg-[#111317] p-8 text-center shadow-2xl">
          <div className="text-3xl">⛔</div>
          <h1 className="mt-5 text-xl font-black">此帳號沒有這個入口的權限</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">帳號已登入，但系統角色與目前入口不符，資料庫已拒絕存取。</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={isVendor ? "/vendor" : "/"} className="rounded-xl bg-[#ff641e] px-5 py-3 text-sm font-black text-black">
              前往{isVendor ? "供應商" : "員工"}入口
            </Link>
            <button onClick={logout} className="rounded-xl border border-[#343840] px-5 py-3 text-sm font-bold text-zinc-300">登出帳號</button>
          </div>
        </div>
      </main>
    );
  }

  if (status === "signed-out") {
    const vendorPortal = portal === "vendor";
    return (
      <main className="grid min-h-screen place-items-center bg-[#090a0c] px-5 text-white">
        <form onSubmit={login} className="w-full max-w-[420px] rounded-3xl border border-[#292c32] bg-[#111317] p-7 shadow-2xl sm:p-9">
          <div className="mb-8 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ff641e] text-lg font-black text-black">KC</div>
            <div><div className="font-black tracking-[.08em]">KICKS CENTER</div><div className="mt-1 text-[10px] font-bold tracking-[.22em] text-[#ff641e]">POS SYSTEM</div></div>
          </div>
          <h1 className="text-2xl font-black">{vendorPortal ? "供應商登入" : "員工登入"}</h1>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{vendorPortal ? "僅限受邀並已綁定寄賣廠商的帳號。" : "僅限 KICKS CENTER 已授權員工帳號。"}</p>
          <label className="mt-7 block text-[10px] font-bold text-zinc-500">EMAIL</label>
          <input autoFocus type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="kc-input mt-2" placeholder="name@kickscenter.com" />
          <label className="mt-4 block text-[10px] font-bold text-zinc-500">密碼</label>
          <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="kc-input mt-2" placeholder="••••••••" />
          {error && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-400">{error}</div>}
          <button disabled={submitting} className="mt-6 w-full rounded-xl bg-[#ff641e] px-4 py-3.5 text-sm font-black text-black disabled:opacity-50">{submitting ? "登入中…" : vendorPortal ? "登入供應商中心" : "登入 POS 系統"}</button>
          <Link href={vendorPortal ? "/" : "/vendor"} className="mt-5 block text-center text-xs font-bold text-zinc-500 hover:text-orange-400">
            前往{vendorPortal ? "員工 POS" : "供應商"}入口
          </Link>
        </form>
      </main>
    );
  }

  return status === "authorized" ? children : null;
}
