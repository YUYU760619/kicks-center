'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Product, Sale, Status, Store } from './pos-app';
import { loadPosStore } from '@/lib/pos-store';

const vendorProfiles = {
  v1: { code: 'NKS00003', name: '路易', phone: '0912-345-678' },
  v2: { code: 'NKS00061', name: '陳拉拉', phone: '02-2768-2231' },
  v3: { code: 'NKS00060', name: '楊宗頤', phone: '0988-120-930' },
  v4: { code: 'NKS00059', name: 'Eason / Koo', phone: '0921-778-420' },
  v5: { code: 'NKS00058', name: '許承恩', phone: '0975-330-118' },
} as const;
const emptyStore: Store = { products: [], vendors: [], sales: [], settlements: [] };

const money = (value: number) => `NT$ ${Math.round(value).toLocaleString('zh-TW')}`;
const date = (value: string, time = false) =>
  new Intl.DateTimeFormat('zh-TW', time ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' } : { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const statusStyle: Record<Status, string> = {
  在庫: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  已售出: 'border-orange-500/20 bg-orange-500/10 text-orange-400',
  已銷帳: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
  已取回: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
  已下架: 'border-red-500/20 bg-red-500/10 text-red-400',
  已調度: 'border-violet-500/20 bg-violet-500/10 text-violet-400',
};

export function VendorDetailPage({ vendorId }: { vendorId: string }) {
  const [store, setStore] = useState<Store>(emptyStore);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('全部');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    loadPosStore(emptyStore).then(({ store: loadedStore }) => {
      setStore(loadedStore);
      setReady(true);
    });
  }, []);

  const storedVendor = store.vendors.find((vendor) => vendor.id === vendorId);
  const profile = vendorProfiles[vendorId as keyof typeof vendorProfiles];
  const vendor = storedVendor
    ? { ...storedVendor, ...profile }
    : profile
      ? { id: vendorId, ...profile, joined: '-' }
      : undefined;
  const products = store.products.filter((product) => product.vendorId === vendorId);
  const sales = store.sales.filter((sale) => products.some((product) => product.id === sale.productId));
  const saleByProduct = new Map(sales.map((sale) => [sale.productId, sale]));
  const filtered = products.filter((product) => {
    const tabMatch = tab === '全部' || (tab === '已售未結' ? product.status === '已售出' : product.status === tab);
    const queryMatch = `${product.code} ${product.name} ${product.model} ${product.color}`.toLowerCase().includes(query.toLowerCase());
    return tabMatch && queryMatch;
  });
  const unsettled = sales.filter((sale) => !sale.settled);

  if (!ready) return <div className="grid min-h-screen place-items-center bg-[#090a0c] text-sm text-zinc-500">載入廠商資料中…</div>;
  if (!vendor) return <div className="grid min-h-screen place-items-center bg-[#090a0c] text-center"><div><b>找不到這位寄賣廠商</b><br/><Link href="/?page=vendors" className="mt-4 inline-block text-sm text-orange-400">返回廠商列表</Link></div></div>;

  return <div className="min-h-screen bg-[#090a0c]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[246px] border-r border-[#25282e] bg-[#0d0f12] p-5 lg:block">
      <Link href="/" className="mb-8 flex h-14 items-center gap-3 px-2"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff641e] font-black text-black">KC</div><div><div className="text-[15px] font-black tracking-[.08em]">KICKS CENTER</div><div className="mt-1 text-[9px] font-bold tracking-[.24em] text-[#ff641e]">POS SYSTEM</div></div></Link>
      <nav className="space-y-1">{[['dashboard','儀表板','⌂'],['inventory','庫存管理','▦'],['inbound','商品入庫','＋'],['pos','掃碼銷售','⌗'],['vendors','寄賣廠商','◎'],['settlement','銷帳管理','✓'],['sales','銷售紀錄','↗'],['settings','設定','⚙']].map(([id,label,icon])=><Link key={id} href={`/?page=${id}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold ${id==='vendors'?'bg-[#ff641e] text-black':'text-zinc-400 hover:bg-white/5 hover:text-white'}`}><span className="w-5 text-center text-lg">{icon}</span>{label}</Link>)}</nav>
      <div className="absolute bottom-5 left-5 right-5 rounded-xl border border-[#292c32] bg-[#15171b] p-3"><div className="text-xs font-bold">廠商獨立頁面</div><div className="mt-1 text-[10px] text-emerald-400">● Supabase 雲端同步</div></div>
    </aside>

    <main className="lg:pl-[246px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#25282e] bg-[#090a0c]/90 px-4 backdrop-blur-xl sm:px-7"><div className="flex items-center gap-3"><Link href="/?page=vendors" className="rounded-lg border border-[#30343b] px-3 py-2 text-xs font-bold text-zinc-300">← 返回</Link><div><div className="text-[10px] uppercase tracking-[.16em] text-zinc-600">Consignors / {vendor.code}</div><div className="text-sm font-bold">寄賣廠商獨立頁面</div></div></div><div className="grid h-9 w-9 place-items-center rounded-full bg-zinc-800 text-xs font-bold">KC</div></header>

      <div className="mx-auto max-w-[1500px] p-4 sm:p-7">
        <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-orange-500/10 text-xl font-black text-orange-400">{vendor.name.slice(0,2)}</div><div><div className="mb-1 flex items-center gap-2"><span className="font-mono text-xs font-black text-orange-400">{vendor.code}</span><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">合作中</span></div><h1 className="text-2xl font-black sm:text-3xl">{vendor.name}</h1><p className="mt-1 text-xs text-zinc-500">統一管理商品、異動、售出與結款紀錄</p></div></div><Link href="/?page=inbound" className="rounded-xl bg-[#ff641e] px-4 py-3 text-center text-xs font-black text-black">＋ 新增此廠商商品</Link></div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
          ['全部商品', products.length, '件'],
          ['目前在庫', products.filter(p=>p.status==='在庫').length, '件'],
          ['已售未結', products.filter(p=>p.status==='已售出').length, '件'],
          ['累計銷售', money(sales.reduce((sum,sale)=>sum+sale.price,0)), ''],
          ['待結款', money(unsettled.reduce((sum,sale)=>sum+sale.cost,0)), ''],
        ].map(([label,value,unit],index)=><div className="kc-card p-5" key={label}><div className="text-[10px] font-semibold text-zinc-500">{label}</div><div className={`mt-3 text-2xl font-black ${index===4?'text-orange-400':index===3?'text-emerald-400':''}`}>{value}<small className="ml-1 text-xs text-zinc-600">{unit}</small></div></div>)}</div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_300px]">
          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2 overflow-x-auto">{['全部','在庫','已售未結','已銷帳','已取回'].map(name=><button key={name} onClick={()=>setTab(name)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${tab===name?'bg-orange-500 text-black':'border border-[#30343b] text-zinc-400'}`}>{name}<span className="ml-1 opacity-60">{tabCount(name, products)}</span></button>)}</div><input value={query} onChange={event=>setQuery(event.target.value)} className="kc-input sm:max-w-[280px]" placeholder="搜尋貨號、名稱、型號…"/></div>
            <div className="kc-card overflow-x-auto"><table className="kc-table"><thead><tr>{['貨號','分類 / 商品','尺寸','型號','回價 / 售價','包裝','位置','寄賣開始','異動日期','狀態'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map(product=>{const sale=saleByProduct.get(product.id);const latest=product.history.at(-1);return <tr key={product.id} onClick={()=>setSelected(product)} className="cursor-pointer"><td className="font-mono font-bold text-orange-400">{product.code}</td><td><div className="text-[10px] text-zinc-600">{product.category}</div><b>{product.name}</b><div className="mt-1 text-[10px] text-zinc-600">{product.color}</div></td><td>US {product.usSize}<div className="text-[10px] text-zinc-600">{product.cmSize} CM</div></td><td className="text-zinc-400">{product.model}</td><td><div>{money(product.cost)}</div><div className="mt-1 text-[10px] text-zinc-500">售價 {money(product.price)}</div></td><td>{product.packaging}</td><td>{product.location}</td><td>{product.consignmentStart}</td><td>{sale?date(sale.soldAt,true):latest?date(latest.at,true):'-'}<div className="mt-1 text-[10px] text-zinc-600">{latest?.action}</div></td><td><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusStyle[product.status]}`}>{product.status}</span></td></tr>})}</tbody></table>{!filtered.length&&<div className="py-16 text-center text-xs text-zinc-600">此分類目前沒有商品</div>}</div>
          </section>

          <aside className="space-y-4"><div className="kc-card p-5"><div className="mb-5 text-sm font-black">廠商資料</div>{[['廠商編號',vendor.code],['姓名 / 名稱',vendor.name],['聯絡電話',vendor.phone],['合作開始',vendor.joined],['資料來源','統一寄賣資料庫']].map(([label,value])=><div key={label} className="mb-4 last:mb-0"><div className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">{label}</div><div className="mt-1 text-xs font-semibold">{value}</div></div>)}</div><div className="kc-card p-5"><div className="mb-4 text-sm font-black">最近動態</div>{products.flatMap(product=>product.history.map(log=>({...log,product}))).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,5).map((log,index)=><div key={`${log.product.id}-${index}`} className="relative border-l border-[#343840] pb-5 pl-4 last:pb-0"><i className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-orange-500"/><div className="text-xs font-bold">{log.action}</div><div className="mt-1 truncate text-[10px] text-zinc-500">{log.product.code} · {log.product.name}</div><div className="mt-1 text-[9px] text-zinc-700">{date(log.at,true)}</div></div>)}</div></aside>
        </div>
      </div>
    </main>

    {selected&&<ProductDrawer product={selected} sale={saleByProduct.get(selected.id)} close={()=>setSelected(null)}/>} 
  </div>;
}

function tabCount(tab: string, products: Product[]) {
  if (tab === '全部') return products.length;
  return products.filter(product => tab === '已售未結' ? product.status === '已售出' : product.status === tab).length;
}

function ProductDrawer({ product, sale, close }: { product: Product; sale?: Sale; close: () => void }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={close}><div className="h-full w-full max-w-[480px] overflow-y-auto border-l border-[#292c32] bg-[#111317] p-6 shadow-2xl" onClick={event=>event.stopPropagation()}><div className="mb-6 flex items-center justify-between"><div><div className="font-mono text-xs font-bold text-orange-400">{product.code}</div><h2 className="mt-1 text-xl font-black">商品完整資料</h2></div><button onClick={close} className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-zinc-400">×</button></div><div className="mb-5 rounded-2xl bg-[#0b0d10] p-5"><div className="text-lg font-black">{product.name}</div><div className="mt-2 text-xs text-zinc-500">{product.brand} · {product.model}</div></div><div className="grid grid-cols-2 gap-4">{[['分類',product.category],['尺寸',`US ${product.usSize} / ${product.cmSize} CM`],['回價',money(product.cost)],['售價',money(product.price)],['位置',product.location],['包裝',product.packaging],['寄賣開始',product.consignmentStart],['寄賣結束',product.consignmentEnd],['成交價',sale?money(sale.price):'-'],['結款狀態',sale?.settled?'已銷帳':sale?'待銷帳':'-']].map(([label,value])=><div key={label}><div className="text-[9px] text-zinc-600">{label}</div><div className="mt-1 text-xs font-bold">{value}</div></div>)}</div><hr className="my-6 border-[#292c32]"/><div className="text-sm font-black">完整異動紀錄</div><div className="mt-5">{[...product.history].reverse().map((log,index)=><div key={index} className="relative border-l border-[#343840] pb-6 pl-5 last:pb-0"><i className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-orange-500"/><div className="text-xs font-bold">{log.action}</div><div className="mt-1 text-[11px] text-zinc-500">{log.note}</div><div className="mt-2 text-[9px] text-zinc-700">{date(log.at,true)}</div></div>)}</div></div></div>;
}
