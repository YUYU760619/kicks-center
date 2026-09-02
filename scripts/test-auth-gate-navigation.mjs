import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authGate = readFileSync(path.join(projectRoot, "app/auth-gate.tsx"), "utf8");

assert.match(authGate, /const authorizationSequence = useRef\(0\)/);
assert.match(authGate, /const requestId = \+\+authorizationSequence\.current/);
assert.match(authGate, /requestId !== authorizationSequence\.current/);
assert.match(authGate, /setStatus\("checking"\)/);
assert.match(authGate, /setMember\(null\)/);
assert.match(authGate, /setValidatedPortal\(null\)/);
assert.match(authGate, /resolved\.user_id !== sessionUserId/);
assert.match(authGate, /window\.addEventListener\("pageshow", handlePageShow\)/);
assert.match(authGate, /if \(event\.persisted\) void revalidate\(\)/);
assert.match(authGate, /window\.removeEventListener\("pageshow", handlePageShow\)/);
assert.match(
  authGate,
  /const visibleStatus = !portalSupabase[\s\S]*validatedPortal === portal[\s\S]*\? status[\s\S]*: "checking"/,
);

assert.match(authGate, /const portalSupabase = getPortalSupabase\(portal\)/);

assert.match(authGate, /portal === "admin"[\s\S]*resolved\.role === "admin"/);
assert.match(
  authGate,
  /portal === "staff"[\s\S]*resolved\.role === "admin" \|\| resolved\.role === "staff"/,
);
assert.match(
  authGate,
  /resolved\.role === "vendor" && Boolean\(resolved\.vendor_id\)/,
);

console.log("AuthGate navigation regression passed: portal reset, latest-request guard, BFCache revalidation, role rules preserved");
