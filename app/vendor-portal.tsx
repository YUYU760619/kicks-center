"use client";

import { useEffect, useState } from "react";
import { clearSensitiveBrowserState } from "@/lib/security-storage";
import { vendorSupabase } from "@/lib/supabase";
import { loadVendorPortalSnapshot, type VendorPortalSnapshot } from "@/lib/vendor-portal";
import { VendorPortalView } from "./vendor-portal-view";

export function VendorPortal() {
  const [snapshot, setSnapshot] = useState<VendorPortalSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadVendorPortalSnapshot()
      .then(setSnapshot)
      .catch(() => setError("供應商資料載入失敗，系統已拒絕顯示未授權資料。"));
  }, []);

  if (!snapshot) {
    return <main className="grid min-h-screen place-items-center bg-[#11151a] px-5 text-center text-sm text-[#98a2ad]">{error || "正在安全載入供應商資料…"}</main>;
  }

  return <div className="min-h-screen bg-[#11151a] text-[#e7eaee]">
    <header className="sticky top-0 z-20 border-b border-[#29323c] bg-[#11151a]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-4 sm:px-7">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8893a] font-black text-[#17120e]">KC</div><div><div className="text-sm font-black tracking-[.08em]">KICKS CENTER</div><div className="mt-1 text-[9px] font-bold tracking-[.2em] text-orange-400">CONSIGNOR PORTAL</div></div></div>
        <button onClick={async () => { clearSensitiveBrowserState(); await vendorSupabase?.auth.signOut(); }} className="rounded-xl border border-[#3a4552] px-4 py-2 text-xs font-bold text-[#c8ced5]">安全登出</button>
      </div>
    </header>
    <VendorPortalView snapshot={snapshot} description="僅顯示此帳號綁定供應商的商品、售出與結款資料" />
  </div>;
}
