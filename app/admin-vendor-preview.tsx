"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadAdminVendorPreview, type VendorPortalSnapshot } from "@/lib/vendor-portal";
import { VendorPortalView } from "./vendor-portal-view";

export function AdminVendorPreview({ vendorId }: { vendorId: string }) {
  const [snapshot, setSnapshot] = useState<VendorPortalSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadAdminVendorPreview(vendorId).then(setSnapshot).catch(() => setError("找不到指定的寄賣廠商，或目前帳號沒有預覽權限。"));
  }, [vendorId]);

  if (!snapshot) return <main className="grid min-h-screen place-items-center bg-[#11151a] px-5 text-center text-[#e7eaee]"><div><div className="text-sm text-[#98a2ad]">{error || "正在安全載入供應商預覽…"}</div>{error && <Link href={`/vendors/${vendorId}`} className="mt-5 inline-block rounded-xl border border-[#46515e] px-4 py-2 text-xs font-bold">← 返回廠商管理</Link>}</div></main>;

  return <div className="min-h-screen bg-[#11151a] text-[#e7eaee]">
    <header className="sticky top-0 z-30 border-b border-[#e8893a]/30 bg-[#171c22]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div><div className="text-[10px] font-black tracking-[.2em] text-[#e8893a]">ADMIN 預覽模式</div><div className="mt-1 text-sm font-black">目前預覽：{snapshot.vendor.name}</div><div className="mt-1 text-[10px] font-bold text-[#74bb96]">● 唯讀模式</div></div>
        <Link href={`/vendors/${vendorId}`} className="rounded-xl border border-[#46515e] px-4 py-2.5 text-center text-xs font-black text-[#c8ced5] transition hover:border-[#e8893a] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8893a]">← 返回廠商管理</Link>
      </div>
    </header>
    <VendorPortalView snapshot={snapshot} />
  </div>;
}
