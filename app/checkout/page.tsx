"use client";
import { useEffect, useState } from "react";

type CartItem = {
  name: string;
  price: number;
  image: string;
  qty: number;
};

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [form, setForm] = useState({
  name: "",
  phone: "",
  email: "",
  address: "",
});

  useEffect(() => {
    const savedCart = localStorage.getItem("cart");

    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  }, []);

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  return (
    <main className="min-h-screen bg-[#0d0d0d] px-6 py-16 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-black">Checkout</h1>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-[#181818] p-6">
            <h2 className="text-2xl font-bold">收件資料</h2>

            <div className="mt-6 flex flex-col gap-4">
              <input
                type="text"
                placeholder="收件人姓名"
                 value={form.name}
  onChange={(e) =>
    setForm({
      ...form,
      name: e.target.value,
    })
  }
  className="rounded-xl border border-white/10 bg-[#0d0d0d] px-4 py-3 outline-none"
/>

              <input
                type="tel"
                placeholder="電話"
                value={form.phone}
onChange={(e) =>
  setForm({
    ...form,
    phone: e.target.value,
  })
}className="rounded-xl border border-white/10 bg-[#0d0d0d] px-4 py-3 outline-none"
/>

              <input
                type="email"
                placeholder="Email"
                value={form.email}
onChange={(e) =>
  setForm({
    ...form,
    email: e.target.value,
  })
} className="rounded-xl border border-white/10 bg-[#0d0d0d] px-4 py-3 outline-none"
/>
<input
  type="text"
  placeholder="收件地址"
  value={form.address}
  onChange={(e) =>
    setForm({
      ...form,
      address: e.target.value,
    })
  }
  className="rounded-xl border border-white/10 bg-[#0d0d0d] px-4 py-3 outline-none"
/>
   
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#181818] p-6">
            <h2 className="text-2xl font-bold">訂單摘要</h2>

            <div className="mt-6 flex flex-col gap-4">
              {cart.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between border-b border-white/10 pb-4"
                >
                  <div>
                    <p className="font-bold">{item.name}</p>
                    <p className="text-sm text-zinc-400">
                      數量：{item.qty}
                    </p>
                  </div>

                  <p>
                    NT$ {(item.price * item.qty).toLocaleString()}
                  </p>
                </div>
              ))}

              <div className="mt-4 flex items-center justify-between text-xl font-bold">
                <span>總計</span>
                <span>NT$ {total.toLocaleString()}</span>
              </div>

              <button
  onClick={() => {
    if (!form.name || !form.phone || !form.email || !form.address) {
      alert("請填寫完整收件資料");
      return;
    }

    alert("訂單資料確認完成！");
  }}
  className="mt-6 rounded-xl bg-[#D86F2D] px-8 py-4 font-bold"
>
                確認訂單
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}