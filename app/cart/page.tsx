   "use client";
   import { useEffect, useState } from "react";

type CartItem = {
  name: string;
  price: number;
  image: string;
  qty: number;
};

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);

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
const changeQty = (name: string, amount: number) => {
  const newCart = cart
    .map((item) =>
      item.name === name
        ? { ...item, qty: item.qty + amount }
        : item
    )
    .filter((item) => item.qty > 0);

  setCart(newCart);
  localStorage.setItem("cart", JSON.stringify(newCart));
};

const removeItem = (name: string) => {
  const newCart = cart.filter((item) => item.name !== name);

  setCart(newCart);
  localStorage.setItem("cart", JSON.stringify(newCart));
};
  return (
    <main className="min-h-screen bg-[#0d0d0d] px-6 py-20 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-black">Shopping Cart</h1>

        {cart.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-[#181818] p-10">
            <p className="text-xl">購物車目前是空的</p>

            <a
              href="/"
              className="mt-6 inline-block rounded-xl bg-[#D86F2D] px-6 py-4 font-bold"
            >
              回去逛逛
            </a>
          </div>
        ) : (
          <>
            {cart.map((item) => (
              <div
                key={item.name}
                className="mt-10 rounded-2xl border border-white/10 bg-[#181818] p-6"
              >
                <div className="flex items-center gap-6">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-28 w-36 rounded-xl bg-white object-contain p-3"
                  />

                  <div className="flex-1">
                    <p className="text-xs font-bold tracking-[0.2em] text-[#D86F2D]">
                      NIKE
                    </p>

                    <h2 className="mt-2 text-xl font-bold">
                      {item.name}
                    </h2>

                    <p className="mt-2">
                      NT$ {item.price.toLocaleString()}
                    </p>

                    <p className="mt-2 text-sm text-zinc-400">
                      數量：{item.qty}
                    </p>
                  </div><div className="mt-3 flex items-center gap-3">
  <button
    onClick={() => changeQty(item.name, -1)}
    className="rounded-lg border border-white/20 px-3 py-1"
  >
    −
  </button>

  <span>{item.qty}</span>

  <button
    onClick={() => changeQty(item.name, 1)}
    className="rounded-lg border border-white/20 px-3 py-1"
  >
    ＋
  </button>

  <button
    onClick={() => removeItem(item.name)}
    className="ml-3 text-sm text-red-400"
  >
    刪除
  </button>
</div>

                  <p className="font-bold">
                    小計：NT$ {(item.price * item.qty).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}

            <div className="mt-8 flex items-center justify-between">
              <a
                href="/"
                className="rounded-xl border border-white/20 px-6 py-4 font-bold"
              >
                繼續購物
              </a>

              <div className="text-right">
                <p className="text-xl font-bold">
                  總計：NT$ {total.toLocaleString()}
                </p>

<a
  href="/checkout"
  className="mt-4 inline-block rounded-xl bg-[#D86F2D] px-8 py-4 font-bold"
>
  前往結帳
</a>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}