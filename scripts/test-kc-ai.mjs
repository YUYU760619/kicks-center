import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const knowledge = await import(pathToFileURL(path.join(root, "lib/kc-ai-knowledge.ts")));
const component = readFileSync(path.join(root, "app/kc-ai-assistant.tsx"), "utf8");
const context = readFileSync(path.join(root, "app/kc-ai-context.tsx"), "utf8");
const adminApp = readFileSync(path.join(root, "app/pos-app.tsx"), "utf8");

assert.equal(knowledge.KC_AI_QUICK_QUESTIONS.length, 7);
for (const question of knowledge.KC_AI_QUICK_QUESTIONS) {
  assert.notEqual(knowledge.answerKcAi(question), knowledge.KC_AI_FALLBACK, question);
}
assert.match(knowledge.answerKcAi("商品取回怎麼操作"), /確認取回/);
assert.match(knowledge.answerKcAi("怎麼恢復已取回商品"), /確認恢復在庫/);
assert.match(knowledge.answerKcAi("怎麼商品入庫"), /確認商品入庫/);
assert.match(knowledge.answerKcAi("怎麼修改貨號"), /修改貨號／QR CODE/);
assert.match(knowledge.answerKcAi("怎麼新增廠商"), /新增寄賣廠商/);
assert.match(knowledge.answerKcAi("怎麼銷帳"), /完成銷帳/);
assert.match(knowledge.answerKcAi("POS 如何結帳"), /\/pos/);
assert.equal(knowledge.answerKcAi("明天天氣如何"), knowledge.KC_AI_FALLBACK);

assert.match(component, /KICKS CENTER 智慧助理/);
assert.match(component, /有什麼可以幫你？/);
assert.match(component, /詢問 KICKS CENTER 操作方式⋯/);
assert.match(component, /清除對話/);
assert.match(component, /KC AI 正在輸入/);
assert.doesNotMatch(component, /supabase|fetch\(|\.rpc\(|functions\.invoke|service.?role/i);
assert.match(component, /useKcAi\(\)/);
assert.match(context, /requestKcAi\(cleanQuestion, history\)/);
assert.match(component, /event\.key === "Enter" && !event\.shiftKey/);
assert.match(component, /<textarea[\s\S]*maxLength=\{800\}/);
assert.match(adminApp, /<KcAiAssistant \/>/);

console.log("KC AI UI regression PASS: local fallback, seven quick questions, AI request, typing, Enter/Shift+Enter controls");
