"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Order = {
  id: number;
  created_at: string;
  order_number: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  total: number;
  status: string;
};

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [loggedIn, setLoggedIn] = useState(false);
const [selectedOrder, setSelectedOrder] = useState<number | null>(null);

 async function handleLogin() {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

   if (error) {
    alert("登入失敗，請確認帳號密碼");
    return;
  }

  setLoggedIn(true);
  window.location.reload();
}

async function handleLogout() {
  await supabase.auth.signOut();
  setLoggedIn(false);
  window.location.reload();
}

useEffect(() => {
     async function initAdmin() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setLoggedIn(false);
      setLoading(false);
      return;
    }

    setLoggedIn(true);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setOrders(data || []);
    }

    setLoading(false);
  }

  initAdmin();
}, []);
async function handleStatusChange(orderId: number, newStatus: string) {
  const { error } = await supabase
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId);

  if (error) {
    console.error(error);
    alert("更新訂單狀態失敗");
    return;
  }

  setOrders((prev) =>
    prev.map((order) =>
      order.id === orderId
        ? { ...order, status: newStatus }
        : order
    )
  );
}
    
    

if (!loggedIn) {
  return (
    <main className="min-h-screen bg-[#0d0d0d] px-6 py-16 text-white">
      <div className="mx-auto max-w-md">
        <p className="text-sm font-bold tracking-[0.3em] text-[#D86F2D]">
          KICKS CENTER
        </p>

        <div className="mt-2 flex items-center justify-between">
  <h1 className="text-4xl font-black">
    訂單管理
    </h1>
  <button
    onClick={handleLogout}
    className="rounded-xl border border-white/20 px-5 py-2 font-bold hover:bg-white/10"
  >
        登出
  </button>
</div>

        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#181818] p-6">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#0d0d0d] px-4 py-3 outline-none"
          />

          <input
            type="password"
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#0d0d0d] px-4 py-3 outline-none"
          />

          <button
            onClick={handleLogin}
            className="rounded-xl bg-[#D86F2D] px-6 py-3 font-bold"
          >
            登入
          </button>
        </div>
      </div>
    </main>
  );
}
return (
  <main className="min-h-screen bg-[#0d0d0d] px-6 py-12 text-white">
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-bold tracking-[0.3em] text-[#D86F2D]">
        KICKS CENTER
      </p>

      <div className="mt-2 flex items-center justify-between">
  <h1 className="text-4xl font-black">
    訂單管理
  </h1>

  <button
    onClick={handleLogout}
    className="rounded-xl border border-white/20 px-5 py-2 font-bold hover:bg-white/10"
  >
    登出
  </button>
</div>

      {loading ? (
        <p className="mt-10 text-zinc-400">
          讀取訂單中...
        </p>
      ) : (
        <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left">
            <thead className="bg-[#181818]">
              <tr>
                <th className="p-4">時間</th>
                <th className="p-4">訂單編號</th>
                <th className="p-4">姓名</th>
                <th className="p-4">電話</th>
                <th className="p-4">金額</th>
                <th className="p-4">狀態</th>
              </tr>
              
            </thead>

            <tbody>
              {orders.map((order) => (
  <>
                <tr
    key={order.id}
    className="border-t border-white/10"
  >
                  <td className="p-4">
                    {new Date(order.created_at).toLocaleString("zh-TW", {
                      timeZone: "Asia/Taipei",
                    })}
                  </td>

                  <td className="p-4 font-bold">
  <button
    onClick={() =>
      setSelectedOrder(
        selectedOrder === order.id ? null : order.id
      )
    }
    className="text-[#D86F2D] hover:underline"
  >
    {order.order_number}
  </button>
</td>

                  <td className="p-4">{order.name}</td>
                  <td className="p-4">{order.phone}</td>

                  <td className="p-4 font-bold">
                    NT$ {Number(order.total).toLocaleString()}
                  </td><td className="p-4">
  <select
    value={order.status}
    onChange={(e) =>
      handleStatusChange(order.id, e.target.value)
    }
    className="rounded-lg border border-white/20 bg-[#181818] px-3 py-2 text-white outline-none"
  >
    <option value="新訂單">新訂單</option>
    <option value="已確認">已確認</option>
    <option value="已出貨">已出貨</option>
    <option value="已完成">已完成</option>
  </select>
</td>
                </tr>{selectedOrder === order.id && (
  <tr className="border-t border-white/10 bg-[#151515]">
    <td colSpan={6} className="p-5">
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <p>
          <span className="text-zinc-400">Email：</span>
          {order.email}
        </p>

        <p>
          <span className="text-zinc-400">地址：</span>
          {order.address}
        </p>

        <p>
          <span className="text-zinc-400">電話：</span>
          {order.phone}
        </p>

        <p>
          <span className="text-zinc-400">總金額：</span>
          NT$ {Number(order.total).toLocaleString()}
        </p>
      </div>
    </td>
  </tr>
)}
</>
))}


            </tbody>
          </table>
        </div>
      )}
    </div>
  </main>
);
}