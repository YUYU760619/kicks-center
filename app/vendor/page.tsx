import { AuthGate } from "../auth-gate";
import { VendorPortal } from "../vendor-portal";

export default function VendorPortalPage() {
  return <AuthGate portal="vendor"><VendorPortal /></AuthGate>;
}
