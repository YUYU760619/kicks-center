import { AuthGate } from "@/app/auth-gate";
import { SecurePosRegister } from "@/app/secure-pos-register";

export default function PosPage() {
  return (
    <AuthGate portal="staff">
      <SecurePosRegister />
    </AuthGate>
  );
}
