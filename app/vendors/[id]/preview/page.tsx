"use client";

import { useParams } from "next/navigation";
import { AdminVendorPreview } from "../../../admin-vendor-preview";
import { AuthGate } from "../../../auth-gate";

export default function AdminVendorPreviewRoute() {
  const params = useParams<{ id: string }>();
  return <AuthGate portal="admin"><AdminVendorPreview vendorId={params.id} /></AuthGate>;
}
