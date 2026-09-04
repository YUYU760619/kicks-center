"use client";

import { useMemo, useState } from "react";
import type { VendorPortalProduct, VendorPortalSnapshot } from "@/lib/vendor-portal";

const money = (value: number) => `NT$ ${Math.round(value).toLocaleString("zh-TW")}`;
const date = (value: string) => new Intl.DateTimeFormat("zh-TW", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

const statusClass: Record<string, string> = {
  在庫: "border-[#5daa83]/25 bg-[#5daa83]/10 text-[#74bb96]",
  已售出: "border-[#d9a441]/25 bg-[#d9a441]/10 text-[#e0b85f]",
  已銷帳: "border-[#6f91c9]/25 bg-[#6f91c9]/10 text-[#8ca8d5]",
  已取回: "border-[#98a2ad]/25 bg-[#98a2ad]/10 text-[#aeb6bf]",
  已下架: "border-[#d96c6c]/25 bg-[#d96c6c]/10 text-[#e28a8a]",
  已調度: "border-[#9b86bd]/25 bg-[#9b86bd]/10 text-[#b09bcf]",
};

export function VendorPortalView({
  snapshot,
  description = "僅顯示此供應商的商品、售出與結款資料",
}: {
  snapshot: VendorPortalSnapshot;
  description?: string;
}) {
  const [tab, setTab] = useState("全部");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VendorPortalProduct | null>(null);
  const { vendor, products, sales, settlements } = snapshot;
  const unsettled = sales.filter((sale) => !sale.settled);
  const tabs = ["全部", "在庫", "已售未結", "已銷帳", "已取回"];
  const filtered = useMemo(() => products.filter((product) => {
    const tabMatch = tab === "全部" || (tab === "已售未結" ? product.status === "已售出" : product.status === tab);
    return tabMatch && `${product.code} ${product.name} ${product.model}`.toLowerCase().includes(query.toLowerCase());
  }), [products, tab, query]);

  return <>
    <main className="mx-auto max-w-[1400px] p-4 sm:p-7">
      <section className="mb-6 flex flex-col justify-between gap-5 rounded-3xl border border-[#303944] bg-[#1d232b] p-6 sm:flex-row sm:items-end sm:p-8">
        <div><div className="font-mono text-xs font-black text-orange-400">{vendor.code}</div><h1 className="mt-2 text-2xl font-black sm:text-3xl">{vendor.name}</h1><p className="mt-2 text-xs text-zinc-500">{description}</p></div>
        <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400">● 唯讀安全模式</div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
        ["全部商品", products.length, "件"], ["目前在庫", products.filter((p) => p.status === "在庫").length, "件"],
        ["已售未結", unsettled.length, "件"], ["累計銷售", money(sales.reduce((sum, sale) => sum + sale.price, 0)), ""],
        ["待結款", money(unsettled.reduce((sum, sale) => sum + sale.cost, 0)), ""],
      ].map(([label, value, unit]) => <div key={String(label)} className="kc-card p-5"><div className="text-[10px] font-semibold text-zinc-500">{label}</div><div className="mt-3 text-2xl font-black">{value}<small className="ml-1 text-xs text-zinc-600">{unit}</small></div></div>)}</section>
      <section className="mt-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-2 overflow-x-auto">{tabs.map((name) => <button key={name} onClick={() => setTab(name)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${tab === name ? "bg-[#e8893a] text-[#17120e]" : "border border-[#3a4552] text-[#98a2ad]"}`}>{name}</button>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} className="kc-input lg:max-w-[320px]" placeholder="搜尋貨號、商品或型號…" /></div>
        <div className="kc-card overflow-x-auto"><table className="kc-table"><thead><tr>{["貨號", "商品", "尺寸", "型號", "應收回價", "目前售價", "寄賣開始", "狀態"].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map((product) => <tr key={product.id} onClick={() => setSelected(product)} className="cursor-pointer"><td className="font-mono font-bold text-orange-400">{product.code}</td><td><b>{product.name}</b><div className="mt-1 text-[10px] text-zinc-600">{product.brand} · {product.color}</div></td><td>US {product.usSize}<div className="text-[10px] text-zinc-600">{product.cmSize} CM</div></td><td className="text-zinc-400">{product.model}</td><td>{money(product.cost)}</td><td>{money(product.price)}</td><td>{product.consignmentStart}</td><td><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass[product.status] || statusClass.已下架}`}>{product.status}</span></td></tr>)}</tbody></table>{!filtered.length && <div className="py-16 text-center text-xs text-zinc-600">此分類目前沒有商品</div>}</div>
      </section>
      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="kc-card p-6"><h2 className="text-sm font-black">最近售出</h2><div className="mt-5 space-y-4">{sales.slice().sort((a, b) => b.soldAt.localeCompare(a.soldAt)).slice(0, 6).map((sale) => { const product = products.find((item) => item.id === sale.productId); return <div key={sale.id} className="flex items-center justify-between gap-4 border-b border-[#303944] pb-4 last:border-0 last:pb-0"><div><div className="text-xs font-bold">{product?.name || sale.productId}</div><div className="mt-1 text-[10px] text-zinc-600">{date(sale.soldAt)}</div></div><div className="text-right"><div className="text-xs font-black">{money(sale.price)}</div><div className={`mt-1 text-[10px] ${sale.settled ? "text-[#6f91c9]" : "text-[#d9a441]"}`}>{sale.settled ? "已銷帳" : "待結款"}</div></div></div>; })}{!sales.length && <div className="text-xs text-zinc-600">尚無銷售紀錄</div>}</div></div>
        <div className="kc-card p-6"><h2 className="text-sm font-black">結款紀錄</h2><div className="mt-5 space-y-4">{settlements.slice().sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 6).map((record) => <div key={record.id} className="flex items-center justify-between gap-4 border-b border-[#303944] pb-4 last:border-0 last:pb-0"><div><div className="font-mono text-xs font-bold text-[#6f91c9]">{record.id}</div><div className="mt-1 text-[10px] text-zinc-600">{date(record.completedAt)} · {record.saleIds.length} 件</div></div><div className="text-right"><div className="text-xs font-black">{money(record.payout)}</div><div className="mt-1 text-[10px] text-[#6f91c9]">已完成</div></div></div>)}{!settlements.length && <div className="text-xs text-zinc-600">尚無結款紀錄</div>}</div></div>
      </section>
    </main>
    {selected && <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={() => setSelected(null)}><aside className="h-full w-full max-w-[480px] overflow-y-auto border-l border-[#303944] bg-[#1d232b] p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><div className="font-mono text-xs font-bold text-[#e8893a]">{selected.code}</div><h2 className="mt-1 text-xl font-black">商品與異動紀錄</h2></div><button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-zinc-400">×</button></div><div className="mt-6 rounded-2xl bg-[#171c22] p-5"><div className="text-lg font-black">{selected.name}</div><div className="mt-2 text-xs text-zinc-500">{selected.brand} · {selected.model}</div></div><div className="mt-6 grid grid-cols-2 gap-4">{[["尺寸", `US ${selected.usSize} / ${selected.cmSize} CM`], ["應收回價", money(selected.cost)], ["目前售價", money(selected.price)], ["包裝", selected.packaging], ["寄賣開始", selected.consignmentStart]].map(([label, value]) => <div key={label}><div className="text-[9px] text-zinc-600">{label}</div><div className="mt-1 text-xs font-bold">{value}</div></div>)}</div><hr className="my-6 border-[#303944]"/><div className="text-sm font-black">異動紀錄（售出／取回／下架即為實際結束）</div><div className="mt-5">{selected.history.slice().reverse().map((log, index) => <div key={`${log.at}-${index}`} className="relative border-l border-[#46515e] pb-6 pl-5 last:pb-0"><i className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-[#e8893a]"/><div className="text-xs font-bold">{log.action}</div><div className="mt-1 text-[11px] text-zinc-500">{log.note}</div><div className="mt-2 text-[9px] text-zinc-700">{date(log.at)}</div></div>)}</div></aside></div>}
  </>;
}
