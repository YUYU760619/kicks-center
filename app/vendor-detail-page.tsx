'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Product, Sale, Status, Store } from './pos-app';
import {
  getVendorCodes,
  normalizeVendorCode,
  VENDOR_CODE_KIND_LABELS,
  VENDOR_CODE_KINDS,
  type Vendor,
  type VendorCode,
  type VendorCodeKind,
} from '@/lib/pos-core';
import {
  loadPosStore,
  PosOperationError,
  PosStoreConflictError,
  setVendorCodes as saveVendorCodes,
} from '@/lib/pos-store';
import { VendorAccountCard } from './vendor-account-card';

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
  在庫: 'border-[#5daa83]/25 bg-[#5daa83]/10 text-[#74bb96]',
  已售出: 'border-[#d9a441]/25 bg-[#d9a441]/10 text-[#e0b85f]',
  已銷帳: 'border-[#6f91c9]/25 bg-[#6f91c9]/10 text-[#8ca8d5]',
  已取回: 'border-[#98a2ad]/25 bg-[#98a2ad]/10 text-[#aeb6bf]',
  已下架: 'border-[#d96c6c]/25 bg-[#d96c6c]/10 text-[#e28a8a]',
  已調度: 'border-[#9b86bd]/25 bg-[#9b86bd]/10 text-[#b09bcf]',
};

export function VendorDetailPage({ vendorId }: { vendorId: string }) {
  const [store, setStore] = useState<Store>(emptyStore);
  const [ready, setReady] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('全部');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    loadPosStore()
      .then(({ store: loadedStore, updatedAt: loadedUpdatedAt }) => {
        setStore(loadedStore);
        setUpdatedAt(loadedUpdatedAt);
        setReady(true);
      })
      .catch(() => setLoadError('無法驗證或載入廠商資料'));
  }, []);

  const storedVendor = store.vendors.find((vendor) => vendor.id === vendorId);
  const profile = vendorProfiles[vendorId as keyof typeof vendorProfiles];
  const vendor = storedVendor
    ? storedVendor
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
  if (!ready) return <div className="grid min-h-screen place-items-center bg-[#11151a] text-sm text-[#98a2ad]">{loadError || '載入廠商資料中…'}</div>;
  if (!vendor) return <div className="grid min-h-screen place-items-center bg-[#11151a] text-center"><div><b>找不到這位寄賣廠商</b><br/><Link href="/?page=vendors" className="mt-4 inline-block text-sm text-[#e8893a]">返回廠商列表</Link></div></div>;
  const activeVendorCodes = getVendorCodes(vendor as Vendor).filter((code) => code.active);

  return <div className="min-h-screen bg-[#11151a]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[246px] border-r border-[#29323c] bg-[#171c22] p-5 lg:block">
      <Link href="/" className="mb-8 flex h-14 items-center gap-3 px-2"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8893a] font-black text-[#17120e]">KC</div><div><div className="text-[15px] font-black tracking-[.08em]">KICKS CENTER</div><div className="mt-1 text-[9px] font-bold tracking-[.24em] text-[#e8893a]">POS SYSTEM</div></div></Link>
      <nav className="space-y-1">{[['dashboard','儀表板','⌂'],['inventory','庫存管理','▦'],['inbound','商品入庫','＋'],['pos','掃碼銷售','⌗'],['vendors','寄賣廠商','◎'],['settlement','銷帳管理','✓'],['sales','銷售紀錄','↗'],['settings','設定','⚙']].map(([id,label,icon])=><Link key={id} href={`/?page=${id}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold ${id==='vendors'?'bg-[#e8893a] text-[#17120e]':'text-[#98a2ad] hover:bg-white/5 hover:text-white'}`}><span className="w-5 text-center text-lg">{icon}</span>{label}</Link>)}</nav>
      <div className="absolute bottom-5 left-5 right-5 rounded-xl border border-[#303944] bg-[#222a33] p-3"><div className="text-xs font-bold">廠商獨立頁面</div><div className="mt-1 text-[10px] text-[#5daa83]">● Supabase 雲端同步</div></div>
    </aside>

    <main className="lg:pl-[246px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#29323c] bg-[#11151a]/90 px-4 backdrop-blur-xl sm:px-7"><div className="flex items-center gap-3"><Link href="/?page=vendors" className="rounded-lg border border-[#3a4552] px-3 py-2 text-xs font-bold text-[#c8ced5]">← 返回</Link><div><div className="text-[10px] uppercase tracking-[.16em] text-zinc-600">Consignors / {activeVendorCodes.map((code) => code.code).join(' / ')}</div><div className="text-sm font-bold">寄賣廠商獨立頁面</div></div></div><div className="grid h-9 w-9 place-items-center rounded-full bg-[#29323c] text-xs font-bold">KC</div></header>

      <div className="mx-auto max-w-[1500px] p-4 sm:p-7">
        <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e8893a]/10 text-xl font-black text-[#e8893a]">{vendor.name.slice(0,2)}</div><div><div className="mb-1 flex items-center gap-2"><span className="font-mono text-xs font-black text-[#e8893a]">{activeVendorCodes.map((code) => code.code).join(' / ')}</span><span className="rounded-full border border-[#5daa83]/25 bg-[#5daa83]/10 px-2 py-0.5 text-[9px] font-bold text-[#74bb96]">合作中</span></div><h1 className="text-2xl font-black sm:text-3xl">{vendor.name}</h1><p className="mt-1 text-xs text-zinc-500">統一管理商品、異動、售出與結款紀錄</p></div></div><Link href="/?page=inbound" className="rounded-xl bg-[#e8893a] px-4 py-3 text-center text-xs font-black text-[#17120e]">＋ 新增此廠商商品</Link></div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
          ['全部商品', products.length, '件'],
          ['目前在庫', products.filter(p=>p.status==='在庫').length, '件'],
          ['已售未結', products.filter(p=>p.status==='已售出').length, '件'],
          ['累計銷售', money(sales.reduce((sum,sale)=>sum+sale.price,0)), ''],
          ['待結款', money(unsettled.reduce((sum,sale)=>sum+sale.cost,0)), ''],
        ].map(([label,value,unit],index)=><div className="kc-card p-5" key={label}><div className="text-[10px] font-semibold text-zinc-500">{label}</div><div className={`mt-3 text-2xl font-black ${index===4?'text-orange-400':index===3?'text-emerald-400':''}`}>{value}<small className="ml-1 text-xs text-zinc-600">{unit}</small></div></div>)}</div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_300px]">
          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2 overflow-x-auto">{['全部','在庫','已售未結','已銷帳','已取回'].map(name=><button key={name} onClick={()=>setTab(name)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${tab===name?'bg-[#e8893a] text-[#17120e]':'border border-[#3a4552] text-[#98a2ad]'}`}>{name}<span className="ml-1 opacity-60">{tabCount(name, products)}</span></button>)}</div><input value={query} onChange={event=>setQuery(event.target.value)} className="kc-input sm:max-w-[280px]" placeholder="搜尋貨號、名稱、型號…"/></div>
            <div className="kc-card overflow-x-auto"><table className="kc-table"><thead><tr>{['貨號','分類 / 商品','尺寸','型號','回價 / 售價','包裝','位置','寄賣開始','異動日期','狀態'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map(product=>{const sale=saleByProduct.get(product.id);const latest=product.history.at(-1);return <tr key={product.id} onClick={()=>setSelected(product)} className="cursor-pointer"><td className="font-mono font-bold text-orange-400">{product.code}</td><td><div className="text-[10px] text-zinc-600">{product.category}</div><b>{product.name}</b><div className="mt-1 text-[10px] text-zinc-600">{product.color}</div></td><td>US {product.usSize}<div className="text-[10px] text-zinc-600">{product.cmSize} CM</div></td><td className="text-zinc-400">{product.model}</td><td><div>{money(product.cost)}</div><div className="mt-1 text-[10px] text-zinc-500">售價 {money(product.price)}</div></td><td>{product.packaging}</td><td>{product.location}</td><td>{product.consignmentStart}</td><td>{sale?date(sale.soldAt,true):latest?date(latest.at,true):'-'}<div className="mt-1 text-[10px] text-zinc-600">{latest?.action}</div></td><td><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusStyle[product.status]}`}>{product.status}</span></td></tr>})}</tbody></table>{!filtered.length&&<div className="py-16 text-center text-xs text-zinc-600">此分類目前沒有商品</div>}</div>
          </section>

          <aside className="space-y-4"><div className="kc-card p-5"><div className="mb-5 text-sm font-black">廠商資料</div>{[['廠商編號',vendor.code],['姓名 / 名稱',vendor.name],['聯絡電話',vendor.phone],['合作開始',vendor.joined],['資料來源','統一寄賣資料庫']].map(([label,value])=><div key={label} className="mb-4 last:mb-0"><div className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">{label}</div><div className="mt-1 text-xs font-semibold">{value}</div></div>)}</div><VendorCodesCard vendor={vendor} updatedAt={updatedAt} onSaved={(nextStore,nextUpdatedAt)=>{setStore(nextStore);setUpdatedAt(nextUpdatedAt);}}/><VendorAccountCard vendor={vendor}/><div className="kc-card p-5"><div className="mb-4 text-sm font-black">最近動態</div>{products.flatMap(product=>product.history.map(log=>({...log,product}))).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,5).map((log,index)=><div key={`${log.product.id}-${index}`} className="relative border-l border-[#46515e] pb-5 pl-4 last:pb-0"><i className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-[#e8893a]"/><div className="text-xs font-bold">{log.action}</div><div className="mt-1 truncate text-[10px] text-zinc-500">{log.product.code} · {log.product.name}</div><div className="mt-1 text-[9px] text-zinc-700">{date(log.at,true)}</div></div>)}</div></aside>
        </div>
      </div>
    </main>

    {selected&&<ProductDrawer product={selected} sale={saleByProduct.get(selected.id)} close={()=>setSelected(null)}/>} 
  </div>;
}

type VendorCodeDraft = {
  id?: string;
  code: string;
  kind: VendorCodeKind;
  primary: boolean;
  active: boolean;
};

function VendorCodesCard({
  vendor,
  updatedAt,
  onSaved,
}: {
  vendor: Vendor;
  updatedAt: string;
  onSaved: (store: Store, updatedAt: string) => void;
}) {
  const codes = getVendorCodes(vendor);
  const [draft, setDraft] = useState<VendorCodeDraft | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!draft || saving) return;
    const normalized = normalizeVendorCode(draft.code);
    if (!normalized) return setError('請輸入廠商代號');
    const duplicate = codes.some((code) => code.id !== draft.id && code.code === normalized);
    if (duplicate) return setError('此廠商代號已存在');
    const nextCodes: VendorCodeDraft[] = draft.id
      ? codes.map((code) => code.id === draft.id ? { ...draft, code: normalized } : code)
      : [...codes, { ...draft, code: normalized }];
    setSaving(true);
    setError('');
    try {
      const result = await saveVendorCodes(vendor.id, nextCodes, updatedAt);
      onSaved(result.store, result.updatedAt);
      setDraft(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      if (message.includes('VENDOR_CODE_EXISTS')) setError('此廠商代號已被其他廠商使用');
      else if (message.includes('VENDOR_PRIMARY_CODE_INACTIVE')) setError('主要代號不可停用');
      else if (message.includes('VENDOR_PRIMARY_CODE_INVALID')) setError('每個廠商必須且只能有一個主要代號');
      else if (caught instanceof PosStoreConflictError) setError('資料已被其他工作站更新，請重新整理後再試');
      else if (caught instanceof PosOperationError && caught.code === '42501') setError('只有啟用中的管理員可以管理廠商代號');
      else setError('廠商代號更新失敗，資料未變更');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (target: VendorCode) => {
    if (target.primary) return setError('主要代號不可直接停用，請先設定另一個啟用中的主要代號');
    setSaving(true);
    setError('');
    try {
      const next = codes.map((code) => code.id === target.id ? { ...code, active: !code.active } : code);
      const result = await saveVendorCodes(vendor.id, next, updatedAt);
      onSaved(result.store, result.updatedAt);
    } catch (caught) {
      setError(caught instanceof PosStoreConflictError ? '資料已被其他工作站更新，請重新整理後再試' : '廠商代號更新失敗，資料未變更');
    } finally {
      setSaving(false);
    }
  };

  const makePrimary = async (target: VendorCode) => {
    if (!target.active || saving) return;
    setSaving(true);
    setError('');
    try {
      const next = codes.map((code) => ({ ...code, primary: code.id === target.id }));
      const result = await saveVendorCodes(vendor.id, next, updatedAt);
      onSaved(result.store, result.updatedAt);
    } catch (caught) {
      setError(caught instanceof PosStoreConflictError ? '資料已被其他工作站更新，請重新整理後再試' : '主要代號更新失敗，資料未變更');
    } finally {
      setSaving(false);
    }
  };

  return <div className="kc-card p-5">
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-sm font-black">廠商代號管理</div><div className="mt-1 text-[10px] text-zinc-600">代號數量不限，全部仍屬於同一廠商</div></div>
      <button type="button" onClick={() => { setDraft({ code: '', kind: 'footwear_accessory', primary: false, active: true }); setError(''); }} className="rounded-lg bg-[#e8893a] px-3 py-2 text-[10px] font-black text-[#17120e]">＋ 新增代號</button>
    </div>
    <div className="mt-4 space-y-3">
      {codes.map((code) => <div key={code.id} className={`rounded-xl border p-3 ${code.active ? 'border-[#303944] bg-[#171c22]' : 'border-[#303944]/60 bg-[#171c22]/50 opacity-60'}`}>
        <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-xs font-black text-[#e8893a]">{code.code}</div><div className="mt-1 text-[10px] font-bold text-zinc-400">{VENDOR_CODE_KIND_LABELS[code.kind]}{code.primary ? ' · 主要代號' : ''}{!code.active ? ' · 已停用' : ''}</div></div><div className="flex flex-wrap justify-end gap-1.5"><button type="button" onClick={() => { setDraft({ ...code }); setError(''); }} className="rounded-md border border-[#46515e] px-2 py-1 text-[9px] font-bold">修改</button>{!code.primary && code.active && <button type="button" onClick={() => makePrimary(code)} disabled={saving} className="rounded-md border border-[#46515e] px-2 py-1 text-[9px] font-bold">設為主要</button>}{!code.primary && <button type="button" onClick={() => toggleActive(code)} disabled={saving} className="rounded-md border border-[#46515e] px-2 py-1 text-[9px] font-bold">{code.active ? '停用' : '啟用'}</button>}</div></div>
      </div>)}
    </div>
    {draft && <div className="mt-4 rounded-xl border border-[#46515e] bg-[#171c22] p-4">
      <div className="text-xs font-black">{draft.id ? '修改代號' : '新增代號'}</div>
      <label className="mt-3 block"><span className="text-[9px] font-bold text-zinc-500">代號</span><input className="kc-input mt-1 font-mono uppercase" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} onBlur={() => setDraft((current) => current ? { ...current, code: normalizeVendorCode(current.code) } : current)} /></label>
      <label className="mt-3 block"><span className="text-[9px] font-bold text-zinc-500">分類</span><select className="kc-input mt-1" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as VendorCodeKind })}>{VENDOR_CODE_KINDS.map((kind) => <option key={kind} value={kind}>{VENDOR_CODE_KIND_LABELS[kind]}</option>)}</select></label>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { setDraft(null); setError(''); }} className="rounded-lg border border-[#46515e] px-3 py-2 text-[10px] font-bold">取消</button><button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-[#e8893a] px-3 py-2 text-[10px] font-black text-[#17120e] disabled:opacity-50">{saving ? '儲存中…' : '儲存'}</button></div>
    </div>}
    {error && <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[10px] font-bold text-red-400">{error}</div>}
    <p className="mt-3 text-[9px] leading-5 text-zinc-600">修改或停用只影響未來入庫選擇，不會改寫既有商品、銷售或銷帳歷史快照。</p>
  </div>;
}

function tabCount(tab: string, products: Product[]) {
  if (tab === '全部') return products.length;
  return products.filter(product => tab === '已售未結' ? product.status === '已售出' : product.status === tab).length;
}

function ProductDrawer({ product, sale, close }: { product: Product; sale?: Sale; close: () => void }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={close}><div className="h-full w-full max-w-[480px] overflow-y-auto border-l border-[#303944] bg-[#1d232b] p-6 shadow-2xl" onClick={event=>event.stopPropagation()}><div className="mb-6 flex items-center justify-between"><div><div className="font-mono text-xs font-bold text-[#e8893a]">{product.code}</div><h2 className="mt-1 text-xl font-black">商品完整資料</h2></div><button onClick={close} className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-zinc-400">×</button></div><div className="mb-5 rounded-2xl bg-[#171c22] p-5"><div className="text-lg font-black">{product.name}</div><div className="mt-2 text-xs text-zinc-500">{product.brand} · {product.model}</div></div><div className="grid grid-cols-2 gap-4">{[['分類',product.category],['尺寸',`US ${product.usSize} / ${product.cmSize} CM`],['回價',money(product.cost)],['售價',money(product.price)],['位置',product.location],['包裝',product.packaging],['寄賣開始',product.consignmentStart],['成交價',sale?money(sale.price):'-'],['結款狀態',sale?.settled?'已銷帳':sale?'待銷帳':'-']].map(([label,value])=><div key={label}><div className="text-[9px] text-zinc-600">{label}</div><div className="mt-1 text-xs font-bold">{value}</div></div>)}</div><hr className="my-6 border-[#303944]"/><div className="text-sm font-black">完整異動紀錄（售出／取回／下架即為實際結束）</div><div className="mt-5">{[...product.history].reverse().map((log,index)=><div key={index} className="relative border-l border-[#46515e] pb-6 pl-5 last:pb-0"><i className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-[#e8893a]"/><div className="text-xs font-bold">{log.action}</div><div className="mt-1 text-[11px] text-zinc-500">{log.note}</div><div className="mt-2 text-[9px] text-zinc-700">{date(log.at,true)}</div></div>)}</div></div></div>;
}
