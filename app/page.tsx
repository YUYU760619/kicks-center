const products = [
  {
    brand: "NIKE",
    name: "Air Jordan 1 Low",
    price: "NT$ 4,980",
    tag: "NEW",
    image: "/shoe1.jpg",
  },
  {
    brand: "NIKE",
    name: "Air Jordan 1 Low",
    price: "NT$ 4,980",
    tag: "NEW",
    image: "/shoe2.jpg",
  },
  {
    brand: "NIKE",
    name: "Air Jordan 1 Low",
    price: "NT$ 4,980",
    tag: "HOT",
    image: "/shoe3.jpg",
  },
  {
    brand: "NIKE",
    name: "Air Jordan 1 Low",
    price: "NT$ 4,980",
    tag: "NEW",
    image: "/shoe4.jpg",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0d0d0d] text-[#f8f8f8]">
      {/* Navbar */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <div className="text-2xl font-black tracking-[0.25em] text-[#D86F2D]">
              KICKS CENTER
            </div>

            <div className="mt-1 text-[10px] tracking-[0.3em] text-zinc-500">
              西門町最強潮流選貨
            
            </div>
          </div>

          <nav className="hidden gap-8 text-sm font-semibold tracking-wider text-zinc-300 md:flex">
            <a href="#new" className="hover:text-[#D86F2D]">
              NEW
            </a>

            <a href="#brands" className="hover:text-[#D86F2D]">
              BRANDS
            </a>

            <a href="#stores" className="hover:text-[#D86F2D]">
              STORES
            </a>
          </nav>

          <button className="rounded-full border border-white/20 px-5 py-2 text-sm hover:border-[#D86F2D] hover:text-[#D86F2D]">
            CART 0
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-24 md:grid-cols-2 md:items-center">
        {/* Left */}
        <div>
          <p className="mb-5 text-xs tracking-[0.35em] text-[#D86F2D]">
            FROM KICKS CENTER
          </p>

          <h1 className="text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
            The Heart of
            <br />
            Taipei Street Culture.
          </h1>

          <p className="mt-7 max-w-lg text-lg leading-8 text-zinc-400">
            台湾のショップから、世界へ。
            <br />
            台湾の今を、もっと近くに。
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <button className="rounded-xl bg-[#D86F2D] px-7 py-4 font-bold text-white transition hover:bg-[#e27a38]">
              商品を見る
            </button>

            <button className="rounded-xl border border-white/20 px-7 py-4 font-bold transition hover:border-[#D86F2D] hover:text-[#D86F2D]">
              ショップ一覧
            </button>
          </div>
        </div>

        {/* Right image */}
        <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-[#181818]">
          <img
            src="/hero.jpg"
            alt="FORMOSA Hero"
            className="h-full w-full object-contain p-10"
          />

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6">
            <p className="text-xs tracking-[0.3em] text-[#D86F2D]">
              CURATED IN TAIWAN
            </p>
          </div>
        </div>
      </section>

      {/* Brand bar */}
      <section
        id="brands"
        className="border-y border-white/10 bg-[#141414] py-7"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-12 gap-y-5 px-6 text-lg font-black tracking-wider text-zinc-500">
          <span>NIKE</span>
          <span>SUPREME</span>
          <span>STUSSY</span>
          <span>BAPE</span>
          <span>CARHARTT WIP</span>
        </div>
      </section>

      {/* Products */}
      <section id="new" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="text-xs tracking-[0.3em] text-[#D86F2D]">
              JUST ARRIVED
            </p>

            <h2 className="mt-3 text-3xl font-black">
              NEW ARRIVALS
            </h2>
          </div>

          <button className="text-sm text-zinc-400 hover:text-[#D86F2D]">
            すべて見る →
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <article key={product.name} className="group">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 bg-[#181818]">
                <div className="absolute left-4 top-4 rounded-full bg-[#D86F2D] px-3 py-1 text-[10px] font-bold tracking-wider text-white">
                  {product.tag}
                </div>
<img
  src={product.image}
  alt={product.name}
  className="h-full w-full object-contain p-6 transition duration-500 group-hover:scale-105"
/>
              </div>

              <div className="pt-4">
                <p className="text-xs font-bold tracking-[0.2em] text-[#D86F2D]">
                  {product.brand}
                </p>

                <h3 className="mt-2 text-base font-semibold">
                  {product.name}
                </h3>

                <p className="mt-2 text-sm text-zinc-300">
                  {product.price}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Stores */}
      <section
        id="stores"
        className="border-t border-white/10 bg-[#141414]"
      >
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-xs tracking-[0.3em] text-[#D86F2D]">
            VERIFIED TAIWAN STORES
          </p>

          <h2 className="mt-3 text-3xl font-black">
            台湾の信頼できるショップから。
          </h2>

          <p className="mt-5 max-w-2xl leading-7 text-zinc-400">
            掲載ショップはプラットフォームが選定。
            商品は台湾の店舗から購入者へ直接発送されます。
          </p>

          <button className="mt-8 rounded-xl border border-[#D86F2D] px-6 py-3 font-bold text-[#D86F2D] transition hover:bg-[#D86F2D] hover:text-white">
            ショップを見る
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-10 text-center text-xs tracking-[0.2em] text-zinc-600">
        FORMOSA © 2026
      </footer>
    </main>
  );
}