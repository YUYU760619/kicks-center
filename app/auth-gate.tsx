"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export function AuthGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(isSupabaseConfigured);
  const [signedIn, setSignedIn] = useState(!isSupabaseConfigured);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setError("");
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (loginError) setError("登入失敗，請確認帳號與密碼。 ");
    setSubmitting(false);
  }

  if (checking) {
    return <div className="grid min-h-screen place-items-center bg-[#090a0c] text-sm text-zinc-500">正在確認登入狀態…</div>;
  }

  if (!signedIn) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#090a0c] px-5 text-white">
        <form onSubmit={login} className="w-full max-w-[420px] rounded-3xl border border-[#292c32] bg-[#111317] p-7 shadow-2xl sm:p-9">
          <div className="mb-8 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ff641e] text-lg font-black text-black">KC</div>
            <div><div className="font-black tracking-[.08em]">KICKS CENTER</div><div className="mt-1 text-[10px] font-bold tracking-[.22em] text-[#ff641e]">POS SYSTEM</div></div>
          </div>
          <h1 className="text-2xl font-black">員工登入</h1>
          <p className="mt-2 text-xs leading-5 text-zinc-500">請使用 KICKS CENTER Supabase 管理帳號登入。</p>
          <label className="mt-7 block text-[10px] font-bold text-zinc-500">EMAIL</label>
          <input autoFocus type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="kc-input mt-2" placeholder="name@kickscenter.com" />
          <label className="mt-4 block text-[10px] font-bold text-zinc-500">密碼</label>
          <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="kc-input mt-2" placeholder="••••••••" />
          {error && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-400">{error}</div>}
          <button disabled={submitting} className="mt-6 w-full rounded-xl bg-[#ff641e] px-4 py-3.5 text-sm font-black text-black disabled:opacity-50">{submitting ? "登入中…" : "登入 POS 系統"}</button>
        </form>
      </main>
    );
  }

  return children;
}
