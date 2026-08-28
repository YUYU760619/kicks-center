'use client';

import { useParams } from 'next/navigation';
import { VendorDetailPage } from '../../vendor-detail-page';

export default function VendorDetailRoute() {
  const params = useParams<{ id: string }>();
  return <VendorDetailPage vendorId={params.id} />;
}
