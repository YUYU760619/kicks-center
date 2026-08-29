'use client';

import { useParams } from 'next/navigation';
import { AuthGate } from '../../auth-gate';
import { VendorDetailPage } from '../../vendor-detail-page';

export default function VendorDetailRoute() {
  const params = useParams<{ id: string }>();
  return <AuthGate portal="staff"><VendorDetailPage vendorId={params.id} /></AuthGate>;
}
