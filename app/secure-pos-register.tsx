"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  completePosCartSale,
  lookupPosInventory,
  type PosInventoryItem,
} from "@/lib/pos-register";
import { normalizeScanCode } from "@/lib/pos-core";

const paymentMethods = ["現金", "信用卡", "轉帳", "其他"] as const;

const money = (value: number) => `NT$ ${Math.round(value).toLocaleString("zh-TW")}`;
const shortSystemId = (value: string) => value.replace(/-/g, "").slice(-10).toUpperCase();

function ProductStatus({ status }: { status: string }) {
  const available = status === "在庫";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
        available
          ? "border-[#5daa83]/25 bg-[#5daa83]/10 text-[#74bb96]"
          : "border-[#d9a441]/25 bg-[#d9a441]/10 text-[#e0b85f]"
      }`}
    >
      {status}
    </span>
  );
}

export function SecurePosRegister() {
  const [code, setCode] = useState("");
  const [cart, setCart] = useState<PosInventoryItem[]>([]);
  const [discount, setDiscount] = useState("0");
  const [payment, setPayment] = useState<(typeof paymentMethods)[number]>("現金");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const subtotal = useMemo(
    () => cart.reduce((sum, product) => sum + product.price, 0),
    [cart],
  );
  const discountAmount = Number(discount);
  const discountIsValid =
    Number.isFinite(discountAmount) && discountAmount >= 0 && discountAmount <= subtotal;
  const total = discountIsValid ? subtotal - discountAmount : subtotal;

  useEffect(() => input.current?.focus(), []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (searching || submitting) return;

    const normalizedCode = normalizeScanCode(code);
    if (!normalizedCode) {
      notify("請掃描或輸入貨號");
      return;
    }

    setSearching(true);
    try {
      const product = await lookupPosInventory(normalizedCode);
      if (!product) {
        notify("找不到此貨號，請重新掃描");
        return;
      }
      if (product.status !== "在庫") {
        notify(`此商品目前為「${product.status}」，不可加入結帳`);
        return;
      }
      if (cart.some((item) => item.inventory_id === product.inventory_id)) {
        notify(`${product.scan_code} 已在結帳清單中`);
        return;
      }

      setCart((current) => [...current, product]);
      setCode("");
      notify(`${product.scan_code} 已加入結帳清單`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      notify(
        message.includes("AMBIGUOUS")
          ? "偵測到重複貨號，已禁止銷售，請聯絡管理員"
          : "商品查詢失敗，請稍後再試",
      );
    } finally {
      setSearching(false);
      window.setTimeout(() => input.current?.focus(), 0);
    }
  }

  function removeItem(inventoryId: string) {
    if (submitting) return;
    setCart((current) => current.filter((item) => item.inventory_id !== inventoryId));
    window.setTimeout(() => input.current?.focus(), 0);
  }

  async function checkout() {
    if (!cart.length || submitting) return;
    if (!discountIsValid) {
      notify("整筆折扣必須介於 0 與商品小計之間");
      return;
    }

    setSubmitting(true);
    try {
      const receipt = await completePosCartSale({
        items: cart.map((product) => ({
          inventory_id: product.inventory_id,
          expected_price: product.price,
        })),
        discount: discountAmount,
        payment_method: payment,
      });
      notify(
        `${receipt.item_count} 件商品已售出 · 結帳 ${shortSystemId(receipt.checkout_id)}`,
      );
      setCart([]);
      setDiscount("0");
      setCode("");
      input.current?.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("NOT_AVAILABLE") ||
        message.includes("ALREADY_SOLD") ||
        message.includes("PRICE_CHANGED") ||
        message.includes("INVENTORY_NOT_FOUND")
      ) {
        notify("購物車內有商品資料已變更，整筆未售出，請移除後重新掃描");
      } else if (message.includes("DUPLICATE")) {
        notify("結帳清單含有重複商品，整筆未售出");
      } else {
        notify("結帳失敗，所有商品與銷售紀錄均未變更");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#11151a]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#29323c] bg-[#11151a]/95 px-4 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8893a] font-black text-[#17120e]">
            KC
          </div>
          <div>
            <div className="text-sm font-black tracking-[.08em]">KICKS CENTER</div>
            <div className="mt-1 text-[9px] font-bold tracking-[.22em] text-[#e8893a]">
              POS 收銀系統
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold">收銀台 · {cart.length} 件</div>
          <div className="mt-1 text-[10px] text-[#74bb96]">
            ● {searching ? "商品查詢中…" : submitting ? "交易處理中…" : "系統連線正常"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] p-4 sm:p-7">
        <div className="mb-6">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#e8893a]">
            Point of Sale
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">購物車結帳</h1>
          <p className="mt-2 text-sm text-zinc-500">連續掃描商品，確認清單後一次完成結帳</p>
        </div>

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
              aria-label="貨號或 QR CODE"
              className="kc-input h-16 border-orange-500/40 bg-black/40 px-5 font-mono text-xl font-black uppercase"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="掃描或輸入貨號…"
              disabled={searching || submitting}
            />
            <button
              type="submit"
              disabled={searching || submitting}
              className="rounded-xl bg-[#e8893a] px-4 py-2.5 text-xs font-black text-[#17120e] hover:bg-[#f09a52] disabled:opacity-50"
            >
              {searching ? "搜尋中…" : "加入商品"}
            </button>
          </div>
        </form>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
          <section className="kc-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#29323c] p-5">
              <div>
                <b className="text-sm">結帳清單</b>
                <div className="mt-1 text-[10px] text-zinc-600">每件實體商品只會建立一筆銷售紀錄</div>
              </div>
              <span className="rounded-full bg-[#e8893a]/10 px-3 py-1 text-xs font-black text-[#e8893a]">
                {cart.length} 件
              </span>
            </div>

            {cart.length ? (
              <div className="divide-y divide-[#29323c]">
                {cart.map((product, index) => (
                  <div
                    key={product.inventory_id}
                    className="grid gap-4 p-5 sm:grid-cols-[36px_1fr_auto_auto] sm:items-center"
                  >
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#171c22] text-xs font-black text-zinc-500">
                      {index + 1}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-sm">{product.name}</b>
                        <ProductStatus status={product.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-500">
                        <span>{product.scan_code}</span>
                        <span>{product.model || "-"}</span>
                        <span>US {product.us_size || "-"} / {product.cm_size || "-"} CM</span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] text-zinc-600">原售價</div>
                      <div className="mt-1 text-sm font-black">{money(product.price)}</div>
                    </div>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => removeItem(product.inventory_id)}
                      className="rounded-xl border border-[#46515e] px-3 py-2 text-xs font-bold text-zinc-400 hover:border-red-500/50 hover:text-red-300 disabled:opacity-40"
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid min-h-72 place-items-center text-center">
                <div>
                  <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#1b1e23] text-2xl text-zinc-600">
                    ⌗
                  </div>
                  <div className="text-sm font-bold text-zinc-400">等待掃描商品</div>
                  <div className="mt-2 text-xs text-zinc-600">掃描後會自動加入結帳清單</div>
                </div>
              </div>
            )}
          </section>

          <section className="kc-card h-fit p-5 xl:sticky xl:top-24">
            <b className="text-sm">結帳資訊</b>
            <div className="mt-5 space-y-4">
              <label>
                <span className="kc-label">整筆折扣</span>
                <input
                  className="kc-input text-lg font-black"
                  type="number"
                  min="0"
                  max={subtotal}
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                  disabled={submitting}
                />
              </label>
              <label>
                <span className="kc-label">付款方式</span>
                <select
                  className="kc-input"
                  value={payment}
                  disabled={submitting}
                  onChange={(event) =>
                    setPayment(event.target.value as (typeof paymentMethods)[number])
                  }
                >
                  {paymentMethods.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
              </label>

              {!discountIsValid && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs font-bold text-red-300">
                  折扣不可小於 0 或超過商品小計。
                </div>
              )}

              <div className="space-y-3 rounded-xl bg-[#171c22] p-4 text-xs">
                <div className="flex justify-between text-zinc-500">
                  <span>商品件數</span>
                  <b className="text-white">{cart.length} 件</b>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>原價小計</span>
                  <b className="text-white">{money(subtotal)}</b>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>整筆折扣</span>
                  <b className="text-[#e0b85f]">− {money(discountIsValid ? discountAmount : 0)}</b>
                </div>
                <div className="border-t border-[#29323c] pt-3">
                  <div className="flex items-end justify-between">
                    <span className="font-bold text-zinc-400">結帳總額</span>
                    <b className="text-xl font-black text-[#e8893a]">{money(total)}</b>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={!cart.length || !discountIsValid || submitting}
                onClick={checkout}
                className="w-full rounded-xl bg-[#e8893a] py-4 text-sm font-black text-[#17120e] hover:bg-[#f09a52] disabled:bg-[#46515e]"
              >
                {submitting ? "整筆交易處理中…" : `確認售出 ${cart.length} 件`}
              </button>
            </div>
          </section>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-[calc(100vw-3rem)] rounded-xl border border-[#5daa83]/40 bg-[#193027] px-5 py-3 text-sm font-bold text-[#8ec9aa] shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
