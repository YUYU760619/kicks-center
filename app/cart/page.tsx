export default function CartPage() {
  return (
    <main className="min-h-screen bg-[#0d0d0d] px-6 py-20 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-black">Shopping Cart</h1>

        <div className="mt-10 rounded-2xl border border-white/10 bg-[#181818] p-6">
          <div className="flex items-center gap-6">
            <img
              src="/shoe1.jpg"
              alt="Air Jordan 1 Low"
              className="h-28 w-36 rounded-xl bg-white object-contain p-3"
            />

            <div className="flex-1">
              <p className="text-xs font-bold tracking-[0.2em] text-[#D86F2D]">
                NIKE
              </p>

              <h2 className="mt-2 text-xl font-bold">
                Air Jordan 1 Low
              </h2>

              <p className="mt-2">NT$ 4,980</p>
              <p className="mt-2 text-sm text-zinc-400">數量：1</p>
            </div>

            <p className="font-bold">小計：NT$ 4,980</p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <a
            href="/"
            className="rounded-xl border border-white/20 px-6 py-4 font-bold"
          >
            繼續購物
          </a>

          <button className="rounded-xl bg-[#D86F2D] px-8 py-4 font-bold">
            前往結帳
          </button>
        </div>
      </div>
    </main>
  );
}