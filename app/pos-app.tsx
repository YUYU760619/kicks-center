"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadPosStore, savePosStore, type SyncSource } from "@/lib/pos-store";
import { supabase } from "@/lib/supabase";

export type Status = "在庫" | "已售出" | "已銷帳" | "已取回" | "已下架" | "已調度";
export type Vendor = {
  id: string;
  code: string;
  name: string;
  phone: string;
  joined: string;
};
type Log = { at: string; action: string; note: string };
export type Product = {
  id: string;
  code: string;
  category: string;
  name: string;
  brand: string;
  model: string;
  usSize: string;
  cmSize: string;
  color: string;
  cost: number;
  price: number;
  vendorId: string;
  location: string;
  consignmentStart: string;
  consignmentEnd: string;
  packaging: string;
  note: string;
  status: Status;
  createdAt: string;
  history: Log[];
};
export type Sale = {
  id: string;
  productId: string;
  soldAt: string;
  price: number;
  cost: number;
  profit: number;
  payment: string;
  discount: number;
  settled: boolean;
  settlementId?: string;
};
type Settlement = {
  id: string;
  vendorId: string;
  saleIds: string[];
  totalSales: number;
  payout: number;
  profit: number;
  completedAt: string;
};
export type Store = {
  products: Product[];
  vendors: Vendor[];
  sales: Sale[];
  settlements: Settlement[];
};
const vendors: Vendor[] = [
  {
    id: "v1",
    code: "NKS00003",
    name: "路易",
    phone: "0912-345-678",
    joined: "2025-11-10",
  },
  {
    id: "v2",
    code: "NKS00061",
    name: "陳拉拉",
    phone: "02-2768-2231",
    joined: "2025-12-05",
  },
  {
    id: "v3",
    code: "NKS00060",
    name: "楊宗頤",
    phone: "0988-120-930",
    joined: "2026-01-18",
  },
  {
    id: "v4",
    code: "NKS00059",
    name: "Eason / Koo",
    phone: "0921-778-420",
    joined: "2026-02-09",
  },
  {
    id: "v5",
    code: "NKS00058",
    name: "許承恩",
    phone: "0975-330-118",
    joined: "2026-03-02",
  },
];
const raw = [
  [
    "KC00005-477",
    "鞋款",
    "Nike Air Max 95 OG Big Bubble",
    "Nike",
    "HQ1973-001",
    "9.5",
    "27.5",
    "Black / Anthracite",
    4800,
    6980,
    "v1",
    "A-01",
  ],
  [
    "KC00005-478",
    "鞋款",
    "Nike Air Force 1 Low Retro",
    "Nike",
    "FN5924-101",
    "9",
    "27",
    "White / Gum",
    2900,
    4280,
    "v1",
    "A-02",
  ],
  [
    "NKS00006-927",
    "鞋款",
    "Air Jordan 1 Retro High OG",
    "Jordan",
    "DZ5485-612",
    "10",
    "28",
    "Varsity Red",
    5200,
    7280,
    "v2",
    "A-05",
  ],
  [
    "NKS00006-931",
    "鞋款",
    "Air Jordan 4 Retro Military Blue",
    "Jordan",
    "FV5029-141",
    "9",
    "27",
    "Off White / Blue",
    6500,
    8980,
    "v2",
    "A-06",
  ],
  [
    "KC00007-112",
    "鞋款",
    "New Balance 990v6 Made in USA",
    "New Balance",
    "U990GR6",
    "9.5",
    "27.5",
    "Grey",
    5600,
    7580,
    "v3",
    "B-02",
  ],
  [
    "KC00007-119",
    "鞋款",
    "New Balance 2002R Protection Pack",
    "New Balance",
    "M2002RDA",
    "8.5",
    "26.5",
    "Rain Cloud",
    3900,
    5680,
    "v3",
    "B-03",
  ],
  [
    "AS00008-205",
    "鞋款",
    "ASICS GEL-KAYANO 14",
    "ASICS",
    "1201A019-108",
    "9",
    "27",
    "Cream / Black",
    4200,
    5980,
    "v4",
    "B-06",
  ],
  [
    "AS00008-211",
    "鞋款",
    "ASICS GEL-NYC",
    "ASICS",
    "1203A383-101",
    "10",
    "28",
    "White / Oyster",
    3500,
    5280,
    "v4",
    "B-07",
  ],
  [
    "HM00009-031",
    "服飾",
    "Human Made Heart Work Jacket",
    "Human Made",
    "HM27JK012",
    "L",
    "-",
    "Navy",
    6800,
    9280,
    "v5",
    "C-01",
  ],
  [
    "HM00009-044",
    "配件",
    "Human Made 6 Panel Cap",
    "Human Made",
    "HM28GD018",
    "OS",
    "-",
    "Beige",
    1800,
    2880,
    "v5",
    "C-03",
  ],
  [
    "KC00010-301",
    "鞋款",
    "Nike Dunk Low Retro Panda",
    "Nike",
    "DD1391-100",
    "8",
    "26",
    "White / Black",
    2600,
    3980,
    "v1",
    "A-08",
  ],
  [
    "KC00010-316",
    "鞋款",
    "Jordan 3 Retro Black Cement",
    "Jordan",
    "DN3707-010",
    "10.5",
    "28.5",
    "Black / Cement",
    6200,
    8580,
    "v2",
    "A-09",
  ],
  [
    "NB00011-402",
    "鞋款",
    "New Balance 1906R Silver Metallic",
    "New Balance",
    "M1906REE",
    "9",
    "27",
    "Silver",
    3400,
    4980,
    "v3",
    "B-09",
  ],
  [
    "AS00011-418",
    "鞋款",
    "ASICS GT-2160",
    "ASICS",
    "1203A275-103",
    "8",
    "26",
    "White / Pure Silver",
    3100,
    4680,
    "v4",
    "B-10",
  ],
  [
    "HM00012-501",
    "服飾",
    "Human Made Graphic Tee #01",
    "Human Made",
    "HM29TE001",
    "M",
    "-",
    "White",
    1900,
    2980,
    "v5",
    "C-05",
  ],
  [
    "KC00012-520",
    "鞋款",
    "Nike Zoom Vomero 5",
    "Nike",
    "BV1358-001",
    "9.5",
    "27.5",
    "Vast Grey",
    3800,
    5480,
    "v1",
    "A-10",
  ],
  [
    "JR00013-601",
    "鞋款",
    "Jordan 11 Retro Gratitude",
    "Jordan",
    "CT8012-170",
    "11",
    "29",
    "White / Black",
    5900,
    7980,
    "v2",
    "A-11",
  ],
  [
    "NB00013-620",
    "鞋款",
    "New Balance 9060 Sea Salt",
    "New Balance",
    "U9060ECA",
    "8.5",
    "26.5",
    "Sea Salt",
    4100,
    5880,
    "v3",
    "B-12",
  ],
] as const;
const initial: Store = {
  vendors,
  sales: [
    {
      id: "sale-demo",
      productId: "p17",
      soldAt: "2026-08-28T10:18:00.000Z",
      price: 7680,
      cost: 5900,
      profit: 1780,
      payment: "信用卡",
      discount: 300,
      settled: false,
    },
  ],
  settlements: [],
  products: raw.map((r, i) => {
    const created = `2026-08-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`;
    const history: Log[] = [
      { at: created, action: "商品入庫", note: `初始位置 ${r[11]}` },
    ];
    if (i === 16)
      history.push({
        at: "2026-08-28T10:18:00.000Z",
        action: "商品售出",
        note: "成交價 NT$ 7,680",
      });
    if (i === 17)
      history.push({
        at: "2026-08-25T13:00:00.000Z",
        action: "商品取回",
        note: "寄賣人取回",
      });
    return {
      id: `p${i + 1}`,
      code: r[0],
      category: r[1],
      name: r[2],
      brand: r[3],
      model: r[4],
      usSize: String(r[5]),
      cmSize: String(r[6]),
      color: r[7],
      cost: Number(r[8]),
      price: Number(r[9]),
      vendorId: r[10],
      location: r[11],
      consignmentStart: `2026-0${(i % 6) + 2}-${String((i % 20) + 3).padStart(2, "0")}`,
      consignmentEnd: "2026-12-31",
      packaging: "完整鞋盒",
      note: "",
      status: i === 16 ? "已售出" : i === 17 ? "已取回" : "在庫",
      createdAt: created,
      history,
    };
  }),
};
const money = (n: number) => `NT$ ${Math.round(n).toLocaleString("zh-TW")}`;
const fmt = (s: string, t = false) =>
  new Intl.DateTimeFormat(
    "zh-TW",
    t
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit" },
  ).format(new Date(s));
const now = () => new Date().toISOString();
const styles: Record<Status, string> = {
  在庫: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  已售出: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  已銷帳: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  已取回: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  已下架: "bg-red-500/10 text-red-400 border-red-500/20",
  已調度: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};
const Pill = ({ s }: { s: Status }) => (
  <span
    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles[s]}`}
  >
    {s}
  </span>
);
const nav = [
  ["dashboard", "儀表板", "⌂"],
  ["inventory", "庫存管理", "▦"],
  ["inbound", "商品入庫", "＋"],
  ["pos", "掃碼銷售", "⌗"],
  ["vendors", "寄賣廠商", "◎"],
  ["settlement", "銷帳管理", "✓"],
  ["sales", "銷售紀錄", "↗"],
  ["settings", "設定", "⚙"],
] as const;
type Page = (typeof nav)[number][0];
type Ctx = {
  store: Store;
  setStore: React.Dispatch<React.SetStateAction<Store>>;
  go: (p: Page) => void;
  notify: (m: string) => void;
  vendor: (id: string) => Vendor | undefined;
  selected: string | null;
  setSelected: (s: string | null) => void;
};

export function PosApp() {
  const [store, setStore] = useState(initial);
  const [ready, setReady] = useState(false);
  const [syncSource, setSyncSource] = useState<SyncSource>("local");
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [mobile, setMobile] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "page",
    ) as Page | null;
    if (requested && nav.some(([id]) => id === requested)) {
      window.setTimeout(() => setPage(requested), 0);
    }
    loadPosStore(initial).then(({ store: loadedStore, source }) => {
      setStore(loadedStore);
      setSyncSource(source);
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      setSyncing(true);
      savePosStore(store).then((source) => {
        setSyncSource(source);
        setSyncing(false);
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [store, ready]);
  const go = (p: Page) => {
    setPage(p);
    setSelected(null);
    setMobile(false);
    window.scrollTo(0, 0);
  };
  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };
  const vendor = (id: string) => store.vendors.find((v) => v.id === id);
  const c = { store, setStore, go, notify, vendor, selected, setSelected };
  return (
    <div className="min-h-screen bg-[#090a0c]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[246px] border-r border-[#25282e] bg-[#0d0f12] p-5 transition-transform lg:translate-x-0 ${mobile ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="mb-8 flex h-14 items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff641e] font-black text-black">
            KC
          </div>
          <div>
            <div className="text-[15px] font-black tracking-[.08em]">
              KICKS CENTER
            </div>
            <div className="mt-1 text-[9px] font-bold tracking-[.24em] text-[#ff641e]">
              POS SYSTEM
            </div>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-semibold ${page === id ? "bg-[#ff641e] text-black" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
            >
              <span className="w-5 text-center text-lg">{icon}</span>
              {label}
              {id === "settlement" && store.sales.some((s) => !s.settled) && (
                <b
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${page === id ? "bg-black text-white" : "bg-orange-500/15 text-orange-400"}`}
                >
                  {store.sales.filter((s) => !s.settled).length}
                </b>
              )}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 rounded-xl border border-[#292c32] bg-[#15171b] p-3">
          <div className="text-xs font-bold">正式營運環境</div>
          <div className={`mt-1 text-[10px] ${syncSource === "cloud" ? "text-emerald-400" : "text-amber-400"}`}>
            ● {syncing ? "資料同步中…" : syncSource === "cloud" ? "Supabase 雲端已同步" : "離線模式 · 本機已備份"}
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="關閉選單"
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <main className="min-h-screen lg:pl-[246px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#25282e] bg-[#090a0c]/90 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobile(true)}
              className="rounded-lg border border-[#30343b] p-2 lg:hidden"
            >
              ☰
            </button>
            <div>
              <div className="text-[10px] uppercase tracking-[.16em] text-zinc-600">
                Operations / {nav.find((n) => n[0] === page)?.[1]}
              </div>
              <div className="text-sm font-bold">
                {nav.find((n) => n[0] === page)?.[1]}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-xs font-semibold">KICKS CENTER 店員</div>
              <div className="text-[10px] text-emerald-400">● 系統正常</div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-zinc-800 text-xs font-bold">
              KC
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] p-4 sm:p-7">
          {!ready ? (
            <Empty text="載入資料中…" />
          ) : page === "dashboard" ? (
            <Dashboard {...c} />
          ) : page === "inventory" ? (
            <Inventory {...c} />
          ) : page === "inbound" ? (
            <Inbound {...c} />
          ) : page === "pos" ? (
            <POS {...c} />
          ) : page === "vendors" ? (
            <Vendors {...c} />
          ) : page === "settlement" ? (
            <Settle {...c} />
          ) : page === "sales" ? (
            <Sales {...c} />
          ) : (
            <Settings store={store} notify={notify} />
          )}
        </div>
      </main>
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-500/30 bg-[#14241b] px-5 py-3 text-sm font-bold text-emerald-300 shadow-2xl">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
const Heading = ({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#ff641e]">
        {eyebrow}
      </div>
      <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-zinc-500">{desc}</p>
    </div>
    {action}
  </div>
);
const Btn = ({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}) => (
  <button
    type={type}
    disabled={disabled}
    onClick={onClick}
    className={`rounded-xl px-4 py-2.5 text-xs font-black ${variant === "primary" ? "bg-[#ff641e] text-black hover:bg-[#ff7a3d]" : variant === "danger" ? "border border-red-500/30 bg-red-500/10 text-red-400" : "border border-[#30343b] bg-[#15171b] text-zinc-300 hover:bg-[#202329]"}`}
  >
    {children}
  </button>
);
const Empty = ({ text }: { text: string }) => (
  <div className="py-16 text-center text-xs text-zinc-600">{text}</div>
);
function Dashboard({ store, go, vendor }: Ctx) {
  const pending = store.sales.filter((s) => !s.settled);
  const recent = [...store.products]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  return (
    <>
      <Heading
        eyebrow="Overview"
        title="營運儀表板"
        desc="即時掌握店內庫存、銷售與寄賣結款狀態"
        action={<span className="text-xs text-zinc-600">資料更新 · 剛剛</span>}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [
            "目前在庫",
            store.products.filter((p) => p.status === "在庫").length + " 雙",
          ],
          ["今日售出", store.sales.length + " 雙"],
          ["待銷帳金額", money(pending.reduce((a, s) => a + s.cost, 0))],
          ["寄賣廠商", store.vendors.length + " 位"],
          ["本月銷售額", money(store.sales.reduce((a, s) => a + s.price, 0))],
        ].map(([a, b], i) => (
          <div className="kc-card p-5" key={a}>
            <div className="text-[11px] font-semibold text-zinc-500">{a}</div>
            <div
              className={`mt-3 text-2xl font-black ${i === 1 ? "text-orange-400" : i === 4 ? "text-emerald-400" : ""}`}
            >
              {b}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr_.8fr]">
        <section className="kc-card overflow-hidden">
          <CardTitle
            title="最近入庫"
            action={
              <button
                onClick={() => go("inventory")}
                className="text-xs font-bold text-orange-400"
              >
                查看全部 →
              </button>
            }
          />
          {recent.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 border-b border-[#22252a] p-4 last:border-0"
            >
              <Brand p={p} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold">{p.name}</div>
                <div className="mt-1 text-[10px] text-zinc-500">
                  {p.code} · US {p.usSize}
                </div>
              </div>
              <div className="text-right text-xs font-bold">
                {money(p.price)}
                <div className="mt-1 text-[10px] text-zinc-600">
                  {p.location}
                </div>
              </div>
            </div>
          ))}
        </section>
        <section className="kc-card overflow-hidden">
          <CardTitle title="最近售出" />
          {store.sales.length ? (
            [...store.sales]
              .reverse()
              .slice(0, 4)
              .map((s) => {
                const p = store.products.find((x) => x.id === s.productId)!;
                return (
                  <div
                    key={s.id}
                    className="border-b border-[#22252a] p-4 last:border-0"
                  >
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold">
                          {p.name}
                        </div>
                        <div className="mt-1 text-[10px] text-zinc-500">
                          {vendor(p.vendorId)?.name} · {fmt(s.soldAt, true)}
                        </div>
                      </div>
                      <b className="text-xs text-emerald-400">
                        +{money(s.price)}
                      </b>
                    </div>
                  </div>
                );
              })
          ) : (
            <Empty text="尚無銷售紀錄" />
          )}
        </section>
        <section className="kc-card p-5">
          <b className="text-sm">待處理事項</b>
          <div className="my-5 space-y-3">
            {[
              [pending.length, "筆銷售待銷帳"],
              [
                store.products.filter((p) => p.status === "已調度").length,
                "件商品調度中",
              ],
              [
                store.products.filter((p) => p.status === "已下架").length,
                "件商品已下架",
              ],
            ].map(([n, t]) => (
              <div
                key={String(t)}
                className="rounded-xl border border-orange-500/15 bg-orange-500/5 p-3"
              >
                <b className="mr-2 text-lg">{n}</b>
                <span className="text-xs text-zinc-400">{t}</span>
              </div>
            ))}
          </div>
          <Btn onClick={() => go("settlement")} variant="ghost">
            前往處理 →
          </Btn>
        </section>
      </div>
    </>
  );
}
const CardTitle = ({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between border-b border-[#292c32] p-5">
    <b className="text-sm">{title}</b>
    {action}
  </div>
);
const Brand = ({ p }: { p: Product }) => (
  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1b1e23] text-[10px] font-black text-zinc-500">
    {p.brand.slice(0, 2).toUpperCase()}
  </div>
);

function Inventory({
  store,
  setStore,
  vendor,
  selected,
  setSelected,
  notify,
}: Ctx) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("全部狀態");
  const [cat, setCat] = useState("全部分類");
  const list = store.products.filter(
    (p) =>
      (status === "全部狀態" || p.status === status) &&
      (cat === "全部分類" || p.category === cat) &&
      `${p.code} ${p.name} ${p.model} ${vendor(p.vendorId)?.name}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const p = store.products.find((x) => x.id === selected);
  if (p)
    return (
      <Detail
        p={p}
        vendor={vendor(p.vendorId)}
        back={() => setSelected(null)}
        update={(patch, action, note) => {
          setStore((s) => ({
            ...s,
            products: s.products.map((x) =>
              x.id === p.id
                ? {
                    ...x,
                    ...patch,
                    history: [...x.history, { at: now(), action, note }],
                  }
                : x,
            ),
          }));
          notify(action + "完成");
        }}
      />
    );
  return (
    <>
      <Heading
        eyebrow="Inventory"
        title="庫存管理"
        desc={`管理店內所有寄賣商品，目前共 ${store.products.length} 筆資料`}
      />
      <div className="kc-card mb-4 grid gap-3 p-4 md:grid-cols-[1fr_180px_180px]">
        <input
          className="kc-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋貨號 / QR CODE、商品、型號或寄賣廠商…"
        />
        <select
          className="kc-input"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          <option>全部分類</option>
          {["鞋款", "服飾", "配件"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          className="kc-input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option>全部狀態</option>
          {Object.keys(styles).map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="kc-card overflow-x-auto">
        <table className="kc-table">
          <thead>
            <tr>
              {[
                "貨號",
                "分類",
                "商品名稱",
                "尺寸",
                "型號",
                "回價",
                "售價",
                "位置",
                "寄賣廠商",
                "入庫日期",
                "狀態",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr
                key={p.id}
                className="cursor-pointer"
                onClick={() => setSelected(p.id)}
              >
                <td className="font-mono font-bold text-orange-400">
                  {p.code}
                </td>
                <td>{p.category}</td>
                <td>
                  <b>{p.name}</b>
                  <div className="mt-1 text-[10px] text-zinc-600">
                    {p.brand}
                  </div>
                </td>
                <td>US {p.usSize}</td>
                <td className="text-zinc-400">{p.model}</td>
                <td>{money(p.cost)}</td>
                <td className="font-bold">{money(p.price)}</td>
                <td>{p.location}</td>
                <td>{vendor(p.vendorId)?.name}</td>
                <td>{fmt(p.createdAt)}</td>
                <td>
                  <Pill s={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <Empty text="找不到符合條件的商品" />}
      </div>
      <div className="mt-3 text-right text-[11px] text-zinc-600">
        顯示 {list.length} / {store.products.length} 筆
      </div>
    </>
  );
}
function Detail({
  p,
  vendor,
  back,
  update,
}: {
  p: Product;
  vendor?: Vendor;
  back: () => void;
  update: (p: Partial<Product>, a: string, n: string) => void;
}) {
  const [price, setPrice] = useState(String(p.price));
  const [loc, setLoc] = useState(p.location);
  return (
    <>
      <button onClick={back} className="mb-5 text-xs font-bold text-zinc-400">
        ← 返回庫存列表
      </button>
      <Heading
        eyebrow={p.code}
        title={p.name}
        desc={`${p.brand} · ${p.model}`}
        action={<Pill s={p.status} />}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="kc-card p-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["分類", p.category],
              ["US / CM 尺寸", `${p.usSize} / ${p.cmSize} cm`],
              ["顏色", p.color],
              ["回價", money(p.cost)],
              ["寄賣廠商", vendor?.name || "-"],
              ["包裝狀態", p.packaging],
              ["寄賣期間", `${p.consignmentStart} ～ ${p.consignmentEnd}`],
              ["備註", p.note || "無"],
            ].map(([a, b]) => (
              <div key={a}>
                <div className="text-[10px] font-bold text-zinc-600">{a}</div>
                <div className="mt-2 text-sm font-semibold">{b}</div>
              </div>
            ))}
          </div>
          <hr className="my-6 border-[#292c32]" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="kc-label">目前售價</span>
              <input
                className="kc-input"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>
              <span className="kc-label">庫存位置</span>
              <input
                className="kc-input"
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn
              onClick={() =>
                update(
                  { price: Number(price), location: loc },
                  "商品資料修改",
                  `售價 ${money(Number(price))}，位置 ${loc}`,
                )
              }
            >
              儲存修改
            </Btn>
            {p.status === "在庫" && (
              <>
                <Btn
                  variant="ghost"
                  onClick={() =>
                    update({ status: "已調度" }, "商品調度", "商品標記為調度中")
                  }
                >
                  調度
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={() =>
                    update({ status: "已取回" }, "商品取回", "寄賣人取回商品")
                  }
                >
                  取回
                </Btn>
                <Btn
                  variant="danger"
                  onClick={() =>
                    update({ status: "已下架" }, "商品下架", "商品自庫存下架")
                  }
                >
                  下架
                </Btn>
              </>
            )}
          </div>
        </div>
        <div className="kc-card overflow-hidden">
          <CardTitle title="歷史紀錄" />
          <div className="p-5">
            {[...p.history].reverse().map((h, i) => (
              <div
                key={i}
                className="relative border-l border-[#343840] pb-6 pl-5 last:pb-0"
              >
                <i className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-orange-500" />
                <div className="text-xs font-bold">{h.action}</div>
                <div className="mt-1 text-[11px] text-zinc-500">{h.note}</div>
                <div className="mt-2 text-[9px] text-zinc-700">
                  {fmt(h.at, true)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Inbound({ store, setStore, go, notify }: Ctx) {
  const defaults = {
    code: "",
    category: "鞋款",
    name: "",
    brand: "Nike",
    model: "",
    usSize: "",
    cmSize: "",
    color: "",
    cost: "",
    price: "",
    vendorId: store.vendors[0].id,
    location: "A-01",
    consignmentStart: new Date().toISOString().slice(0, 10),
    consignmentEnd: "2026-12-31",
    packaging: "完整鞋盒",
    note: "",
  };
  const [f, setF] = useState(defaults);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (
      store.products.some((p) => p.code.toLowerCase() === f.code.toLowerCase())
    )
      return notify("貨號已存在，請重新確認");
    const t = now();
    const p: Product = {
      ...f,
      id: crypto.randomUUID(),
      cost: Number(f.cost),
      price: Number(f.price),
      status: "在庫",
      createdAt: t,
      history: [
        { at: t, action: "商品入庫", note: `建立商品，位置 ${f.location}` },
      ],
    };
    setStore((s) => ({ ...s, products: [p, ...s.products] }));
    notify("商品已成功入庫");
    go("inventory");
  };
  const fields = [
    ["貨號 / QR CODE", "code", "KC00014-001", "text"],
    ["分類", "category", "", "cat"],
    ["商品名稱", "name", "例：Nike Air Max 95", "text"],
    ["品牌", "brand", "Nike", "text"],
    ["型號", "model", "HQ1973-001", "text"],
    ["US 尺寸", "usSize", "9.5", "text"],
    ["CM 尺寸", "cmSize", "27.5", "text"],
    ["顏色", "color", "Black / White", "text"],
    ["回價", "cost", "0", "number"],
    ["售價", "price", "0", "number"],
    ["寄賣廠商", "vendorId", "", "vendor"],
    ["庫存位置", "location", "A-01", "text"],
    ["寄賣開始日", "consignmentStart", "", "date"],
    ["寄賣結束日", "consignmentEnd", "", "date"],
    ["包裝狀態", "packaging", "完整鞋盒", "text"],
  ];
  return (
    <>
      <Heading
        eyebrow="New Stock"
        title="商品入庫"
        desc="建立寄賣商品資料，送出後立即加入庫存"
      />
      <form onSubmit={submit} className="kc-card p-5 sm:p-7">
        <div className="mb-6 border-b border-[#292c32] pb-3 text-sm font-black">
          基本資料
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {fields.map(([label, key, ph, type]) => (
            <label key={key}>
              <span className="kc-label">{label} *</span>
              {type === "cat" ? (
                <select
                  className="kc-input"
                  value={f.category}
                  onChange={(e) => set(key, e.target.value)}
                >
                  <option>鞋款</option>
                  <option>服飾</option>
                  <option>配件</option>
                </select>
              ) : type === "vendor" ? (
                <select
                  className="kc-input"
                  value={f.vendorId}
                  onChange={(e) => set(key, e.target.value)}
                >
                  {store.vendors.map((v) => (
                    <option value={v.id} key={v.id}>
                      {v.code} · {v.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  className="kc-input"
                  type={type}
                  value={String(f[key as keyof typeof f])}
                  placeholder={ph}
                  onChange={(e) => set(key, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="kc-label">備註</span>
          <textarea
            className="kc-input min-h-24"
            value={f.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="商品狀況、寄賣約定或其他備註…"
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setF(defaults)}>
            清除表單
          </Btn>
          <Btn type="submit">確認商品入庫</Btn>
        </div>
      </form>
    </>
  );
}

function POS({ store, setStore, vendor, notify }: Ctx) {
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Product | null>(null);
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [payment, setPayment] = useState("現金");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const search = (e: FormEvent) => {
    e.preventDefault();
    const p =
      store.products.find(
        (x) => x.code.toLowerCase() === code.trim().toLowerCase(),
      ) || null;
    setFound(p);
    if (p) {
      setPrice(String(p.price));
      setDiscount("0");
    } else notify("找不到此貨號，請重新掃描");
  };
  const sell = () => {
    if (!found || found.status !== "在庫") return;
    const actual = Number(price),
      t = now();
    const sale: Sale = {
      id: crypto.randomUUID(),
      productId: found.id,
      soldAt: t,
      price: actual,
      cost: found.cost,
      profit: actual - found.cost,
      payment,
      discount: Number(discount),
      settled: false,
    };
    setStore((s) => ({
      ...s,
      sales: [...s.sales, sale],
      products: s.products.map((p) =>
        p.id === found.id
          ? {
              ...p,
              status: "已售出",
              history: [
                ...p.history,
                {
                  at: t,
                  action: "商品售出",
                  note: `${payment} · 成交價 ${money(actual)} · 毛利 ${money(actual - found.cost)}`,
                },
              ],
            }
          : p,
      ),
    }));
    notify(`${found.code} 已完成售出`);
    setCode("");
    setFound(null);
  };
  return (
    <>
      <Heading
        eyebrow="Point of Sale"
        title="掃碼銷售"
        desc="掃描商品 QR CODE 或輸入貨號後按 Enter"
      />
      <form
        onSubmit={search}
        className="kc-card border-orange-500/30 bg-gradient-to-r from-orange-500/10 to-transparent p-4 sm:p-6"
      >
        <div className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-orange-400">
          Scan QR Code
        </div>
        <div className="flex gap-3">
          <input
            ref={input}
            className="kc-input h-16 border-orange-500/40 bg-black/40 px-5 font-mono text-xl font-black uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="掃描或輸入貨號…"
          />
          <Btn type="submit">搜尋商品</Btn>
        </div>
      </form>
      {found ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <section className="kc-card p-5">
            <div className="mb-5 flex justify-between">
              <b className="text-sm">商品資料</b>
              <Pill s={found.status} />
            </div>
            {found.status !== "在庫" && (
              <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-300">
                ⚠ 此商品目前為「{found.status}」，不可重複售出。
              </div>
            )}
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="grid h-44 w-full shrink-0 place-items-center rounded-2xl border border-dashed border-[#343840] bg-[#0c0e11] text-center text-xs text-zinc-700 sm:w-44">
                PRODUCT
                <br />
                IMAGE
              </div>
              <div className="grid flex-1 grid-cols-2 gap-4">
                {[
                  ["商品名稱", found.name],
                  ["貨號", found.code],
                  ["尺寸", `US ${found.usSize} / ${found.cmSize} CM`],
                  ["型號", found.model],
                  ["寄賣廠商", vendor(found.vendorId)?.name || "-"],
                  ["原售價", money(found.price)],
                ].map(([a, b]) => (
                  <div key={a}>
                    <div className="text-[10px] text-zinc-600">{a}</div>
                    <div className="mt-1 text-sm font-bold">{b}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="kc-card p-5">
            <b className="text-sm">結帳資訊</b>
            <div className="mt-5 space-y-4">
              <label>
                <span className="kc-label">實際成交價</span>
                <input
                  className="kc-input text-lg font-black"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="kc-label">折扣金額</span>
                  <input
                    className="kc-input"
                    type="number"
                    value={discount}
                    onChange={(e) => {
                      setDiscount(e.target.value);
                      setPrice(String(found.price - Number(e.target.value)));
                    }}
                  />
                </label>
                <label>
                  <span className="kc-label">付款方式</span>
                  <select
                    className="kc-input"
                    value={payment}
                    onChange={(e) => setPayment(e.target.value)}
                  >
                    {["現金", "信用卡", "轉帳", "其他"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="rounded-xl bg-[#0c0e11] p-4 text-xs">
                <div className="flex justify-between text-zinc-500">
                  <span>成交價</span>
                  <b className="text-white">{money(Number(price))}</b>
                </div>
                <div className="mt-2 flex justify-between text-zinc-500">
                  <span>預估毛利</span>
                  <b className="text-emerald-400">
                    {money(Number(price) - found.cost)}
                  </b>
                </div>
              </div>
              <button
                disabled={found.status !== "在庫" || !Number(price)}
                onClick={sell}
                className="w-full rounded-xl bg-[#ff641e] py-4 text-sm font-black text-black disabled:bg-zinc-700"
              >
                確認售出
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="kc-card mt-5 grid min-h-72 place-items-center text-center">
          <div>
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#1b1e23] text-2xl text-zinc-600">
              ⌗
            </div>
            <div className="text-sm font-bold text-zinc-400">等待掃描商品</div>
            <div className="mt-2 text-xs text-zinc-600">
              測試貨號：KC00005-477
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Vendors({ store }: Ctx) {
  return (
    <>
      <Heading
        eyebrow="Consignors"
        title="寄賣廠商"
        desc="每位寄賣廠商都有獨立管理頁面，不再以 Excel Sheet 分散管理"
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {store.vendors.map((v) => {
          const ps = store.products.filter((p) => p.vendorId === v.id);
          const ss = store.sales.filter((s) =>
            ps.some((p) => p.id === s.productId),
          );
          return (
            <Link
              key={v.id}
              href={`/vendors/${v.id}`}
              className="kc-card p-5 text-left transition hover:-translate-y-0.5 hover:border-orange-500/40"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-orange-500/10 font-black text-orange-400">
                  {v.name.slice(0, 2)}
                </div>
                <div>
                  <div className="text-sm font-black">{v.name}</div>
                  <div className="mt-1 text-[10px] text-zinc-600">
                    {v.code} · {v.phone}
                  </div>
                </div>
                <span className="ml-auto text-[10px] font-bold text-zinc-500">
                  獨立頁面 →
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  [
                    "目前寄賣",
                    ps.filter((p) => p.status === "在庫").length + " 件",
                  ],
                  [
                    "已售未結",
                    ps.filter((p) => p.status === "已售出").length + " 件",
                  ],
                  ["累計銷售", money(ss.reduce((a, s) => a + s.price, 0))],
                  [
                    "待結款",
                    money(
                      ss
                        .filter((s) => !s.settled)
                        .reduce((a, s) => a + s.cost, 0),
                    ),
                  ],
                ].map(([a, b]) => (
                  <div className="rounded-xl bg-[#0c0e11] p-3" key={a}>
                    <div className="text-[9px] text-zinc-600">{a}</div>
                    <div className="mt-1 text-xs font-black">{b}</div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
function Settle({ store, setStore, vendor, notify }: Ctx) {
  const pending = store.sales.filter((s) => !s.settled);
  const vids = [
    ...new Set(
      pending
        .map((s) => store.products.find((p) => p.id === s.productId)?.vendorId)
        .filter(Boolean),
    ),
  ] as string[];
  const [vid, setVid] = useState(vids[0] || "");
  const [checked, setChecked] = useState<string[]>([]);
  const list = pending.filter(
    (s) => store.products.find((p) => p.id === s.productId)?.vendorId === vid,
  );
  const chosen = list.filter((s) => checked.includes(s.id));
  const toggle = (id: string) =>
    setChecked((c) =>
      c.includes(id) ? c.filter((x) => x !== id) : [...c, id],
    );
  const settle = () => {
    if (!chosen.length) return;
    const t = now(),
      id = `ST${t.replace(/\D/g, "")}`,
      ids = chosen.map((s) => s.productId);
    const rec: Settlement = {
      id,
      vendorId: vid,
      saleIds: checked,
      totalSales: chosen.reduce((a, s) => a + s.price, 0),
      payout: chosen.reduce((a, s) => a + s.cost, 0),
      profit: chosen.reduce((a, s) => a + s.profit, 0),
      completedAt: t,
    };
    setStore((s) => ({
      ...s,
      settlements: [...s.settlements, rec],
      sales: s.sales.map((x) =>
        checked.includes(x.id) ? { ...x, settled: true, settlementId: id } : x,
      ),
      products: s.products.map((p) =>
        ids.includes(p.id)
          ? {
              ...p,
              status: "已銷帳",
              history: [
                ...p.history,
                {
                  at: t,
                  action: "完成銷帳",
                  note: `結款單 ${id} · 應付 ${money(p.cost)}`,
                },
              ],
            }
          : p,
      ),
    }));
    setChecked([]);
    notify(`已完成 ${chosen.length} 筆銷帳`);
  };
  return (
    <>
      <Heading
        eyebrow="Settlement"
        title="銷帳管理"
        desc="彙整已售未結商品，建立寄賣人結款紀錄"
      />
      <div className="kc-card mb-4 p-4">
        <label className="block max-w-sm">
          <span className="kc-label">選擇寄賣廠商</span>
          <select
            className="kc-input"
            value={vid}
            onChange={(e) => {
              setVid(e.target.value);
              setChecked([]);
            }}
          >
            <option value="">請選擇</option>
            {vids.map((id) => (
              <option value={id} key={id}>
                {vendor(id)?.code} · {vendor(id)?.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="kc-card overflow-x-auto">
        <table className="kc-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={!!list.length && checked.length === list.length}
                  onChange={(e) =>
                    setChecked(e.target.checked ? list.map((s) => s.id) : [])
                  }
                />
              </th>
              {[
                "貨號",
                "商品",
                "尺寸",
                "售出日期",
                "成交價",
                "回價",
                "店家毛利",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const p = store.products.find((x) => x.id === s.productId)!;
              return (
                <tr
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => toggle(s.id)}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={checked.includes(s.id)}
                      readOnly
                    />
                  </td>
                  <td className="font-mono text-orange-400">{p.code}</td>
                  <td className="font-bold">{p.name}</td>
                  <td>US {p.usSize}</td>
                  <td>{fmt(s.soldAt, true)}</td>
                  <td>{money(s.price)}</td>
                  <td>{money(s.cost)}</td>
                  <td className="font-bold text-emerald-400">
                    {money(s.profit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && (
          <Empty
            text={
              pending.length
                ? "請選擇有待結款商品的寄賣廠商"
                : "目前沒有待銷帳商品"
            }
          />
        )}
      </div>
      <div className="sticky bottom-4 mt-5 flex flex-col gap-4 rounded-2xl border border-orange-500/30 bg-[#18130f]/95 p-5 shadow-2xl sm:flex-row sm:items-center">
        <div className="grid flex-1 grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ["商品件數", chosen.length + " 件"],
            ["銷售總額", money(chosen.reduce((a, s) => a + s.price, 0))],
            ["應付寄賣人", money(chosen.reduce((a, s) => a + s.cost, 0))],
            ["KC 毛利", money(chosen.reduce((a, s) => a + s.profit, 0))],
          ].map(([a, b]) => (
            <div key={a}>
              <div className="text-[9px] text-zinc-500">{a}</div>
              <div className="mt-1 text-sm font-black">{b}</div>
            </div>
          ))}
        </div>
        <Btn disabled={!chosen.length} onClick={settle}>
          完成銷帳
        </Btn>
      </div>
      {store.settlements.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-black">最近結款紀錄</h2>
          <div className="kc-card overflow-x-auto">
            <table className="kc-table">
              <tbody>
                {[...store.settlements].reverse().map((s) => (
                  <tr key={s.id}>
                    <td className="font-mono text-orange-400">{s.id}</td>
                    <td>{vendor(s.vendorId)?.name}</td>
                    <td>{s.saleIds.length} 件</td>
                    <td>{money(s.payout)}</td>
                    <td>{fmt(s.completedAt, true)}</td>
                    <td className="text-emerald-400">✓ 已完成</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function Sales({ store, vendor }: Ctx) {
  const [q, setQ] = useState("");
  const [day, setDay] = useState("");
  const list = store.sales.filter((s) => {
    const p = store.products.find((x) => x.id === s.productId)!;
    return (
      (!day || s.soldAt.slice(0, 10) === day) &&
      `${p?.code} ${p?.name} ${vendor(p?.vendorId)?.name}`
        .toLowerCase()
        .includes(q.toLowerCase())
    );
  });
  return (
    <>
      <Heading
        eyebrow="Sales Log"
        title="銷售紀錄"
        desc="查詢所有成交與付款紀錄，完整保留歷史資料"
      />
      <div className="kc-card mb-4 grid gap-3 p-4 md:grid-cols-[1fr_220px]">
        <input
          className="kc-input"
          placeholder="搜尋貨號、商品或寄賣廠商…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className="kc-input"
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </div>
      <div className="kc-card overflow-x-auto">
        <table className="kc-table">
          <thead>
            <tr>
              {[
                "日期時間",
                "貨號",
                "商品",
                "尺寸",
                "成交價",
                "回價",
                "毛利",
                "付款方式",
                "寄賣廠商",
                "銷帳",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const p = store.products.find((x) => x.id === s.productId)!;
              return (
                <tr key={s.id}>
                  <td>{fmt(s.soldAt, true)}</td>
                  <td className="font-mono text-orange-400">{p?.code}</td>
                  <td className="font-bold">{p?.name}</td>
                  <td>US {p?.usSize}</td>
                  <td>{money(s.price)}</td>
                  <td>{money(s.cost)}</td>
                  <td className="font-bold text-emerald-400">
                    {money(s.profit)}
                  </td>
                  <td>{s.payment}</td>
                  <td>{vendor(p?.vendorId)?.name}</td>
                  <td
                    className={s.settled ? "text-blue-400" : "text-orange-400"}
                  >
                    {s.settled ? "已銷帳" : "待銷帳"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <Empty text="尚無符合條件的銷售紀錄" />}
      </div>
    </>
  );
}
function Settings({
  store,
  notify,
}: {
  store: Store;
  notify: (s: string) => void;
}) {
  return (
    <>
      <Heading eyebrow="System" title="設定" desc="正式環境、雲端同步與工作站管理" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="kc-card p-6">
          <b className="text-sm">系統資訊</b>
          <div className="mt-5 space-y-3 text-xs text-zinc-500">
            <div className="flex justify-between">
              <span>系統版本</span>
              <b className="text-white">POS 1.0.0</b>
            </div>
            <div className="flex justify-between">
              <span>資料儲存</span>
              <b className="text-emerald-400">Supabase + 本機備援</b>
            </div>
            <div className="flex justify-between">
              <span>商品 / 銷售</span>
              <b className="text-white">
                {store.products.length} / {store.sales.length}
              </b>
            </div>
          </div>
        </div>
        <div className="kc-card p-6">
          <b className="text-sm">店貓待機畫面</b>
          <p className="my-4 text-xs leading-6 text-zinc-500">
            90 秒沒有操作時，Q 版店貓會自動出現並保護整個 POS 畫面。
          </p>
          <Btn
            onClick={() =>
              window.dispatchEvent(new Event("kicks-preview-idle-cat"))
            }
          >
            立即預覽店貓
          </Btn>
        </div>
        <div className="kc-card p-6">
          <b className="text-sm">員工帳號</b>
          <p className="my-4 text-xs leading-6 text-zinc-500">
            登出這台工作站；已同步的庫存、銷售與銷帳紀錄仍會保留在 Supabase。
          </p>
          <Btn
            onClick={async () => {
              if (!supabase) {
                notify("本機開發模式不需要登入");
                return;
              }
              await supabase.auth.signOut();
            }}
          >
            登出系統
          </Btn>
        </div>
      </div>
    </>
  );
}
