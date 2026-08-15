"use client";

import { useEffect, useState } from "react";

export default function SuccessPage() {
  const [orderNumber, setOrderNumber] = useState("");

  useEffect(() => {
    const savedOrderNumber = localStorage.getItem("orderNumber");

    if (savedOrderNumber) {
      setOrderNumber(savedOrderNumber);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#0d0d0d] px-6 py-20 text-white">
      <div className="mx-auto max-w-2xl text-center">
        <div className="rounded-2xl border border-white/10 bg-[#181818] p-10">
          <p className="text-sm font-bold tracking-[0.25em] text-[#D86F2D]">
            ORDER COMPLETE
          </p>

          <h1 className="mt-4 text-4xl font-black">
            訂單已完成
          </h1>

          <p className="mt-4 text-zinc-400">
            感謝您的訂購，我們已收到您的訂單。
          </p>

          {orderNumber && (
            <div className="mt-8 rounded-xl bg-[#0d0d0d] p-5">
              <p className="text-sm text-zinc-400">訂單編號</p>
              <p className="mt-2 text-2xl font-bold">
                {orderNumber}
              </p>
            </div>
          )}

          <a
            href="/"
            className="mt-8 inline-block rounded-xl bg-[#D86F2D] px-8 py-4 font-bold"
          >
            回到首頁
          </a>
        </div>
      </div>
    </main>
  );
}