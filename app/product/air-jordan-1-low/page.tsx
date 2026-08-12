"use client";

import { useRouter } from "next/navigation";

export default function ProductPage() {
    const router = useRouter();
  return (
    <main
      style={{
        background: "#0d0d0d",
        color: "white",
        minHeight: "100vh",
        padding: "40px",
        fontFamily: "sans-serif",
      }}
    >
      <img
        src="/shoe1.jpg"
        alt="Air Jordan 1 Low"
        style={{
          width: "400px",
          borderRadius: "20px",
        }}
      />

      <h1 style={{ marginTop: "30px", fontSize: "42px" }}>
        Air Jordan 1 Low
      </h1>

      <h2 style={{ color: "#ff7a00" }}>NT$ 4,980</h2>

      <p style={{ maxWidth: "600px", lineHeight: 1.8 }}>
        經典 Air Jordan 1 Low，適合日常穿搭，100% Authentic。
      </p>

      <button
  onClick={() => router.push("/cart")}
  style={{
    marginTop: "30px",
    padding: "15px 40px",
    background: "#ff7a00",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "18px",
    cursor: "pointer",
  }}
>
  加入購物車
</button>
</main>
  );
}