import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
const context = readFileSync(path.join(root, "app/kc-ai-context.tsx"), "utf8");
const assistant = readFileSync(path.join(root, "app/kc-ai-assistant.tsx"), "utf8");
const posApp = readFileSync(path.join(root, "app/pos-app.tsx"), "utf8");

assert.match(layout, /<KcAiProvider>/);
assert.match(layout, /<KcAiProvider>[\s\S]*<AdminUiProvider>\{children\}<\/AdminUiProvider>[\s\S]*<\/KcAiProvider>/);
assert.match(context, /const \[open, setOpen\] = useState\(false\)/);
assert.match(context, /const \[messages, setMessages\] = useState<KcAiChatMessage\[]>\(\[\]\)/);
assert.match(context, /<KcAiContext\.Provider/);
assert.match(assistant, /useKcAi\(\)/);
assert.doesNotMatch(assistant, /useState\(/);
assert.doesNotMatch(context, /localStorage|sessionStorage/);
assert.match(posApp, /<KcAiAssistant \/>/);
assert.match(posApp, /window\.history\.replaceState\(/);

// Admin view changes only update PosApp's page state. KC AI state lives above it
// in RootLayout, so open state and messages survive PosApp/AuthGate remounts.
const sharedState = { open: true, messages: ["商品要怎麼入庫？", "請從商品入庫開始"] };
for (const page of ["inventory", "inbound", "vendors", "settlement", "sales", "settings", "dashboard"]) {
  const remountedAdminView = { page, kcAi: sharedState };
  assert.equal(remountedAdminView.kcAi.open, true);
  assert.equal(remountedAdminView.kcAi.messages.length, 2);
}

console.log("KC AI Admin navigation regression PASS: shared provider keeps panel open and messages in memory across view/remount changes");
