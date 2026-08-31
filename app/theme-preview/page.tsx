import { notFound } from "next/navigation";
import { PosApp } from "@/app/pos-app";

export default function ThemePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PosApp preview />;
}
