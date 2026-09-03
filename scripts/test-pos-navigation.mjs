import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildAdminPageUrl,
  readAdminPage,
} from "../lib/admin-navigation.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const posApp = readFileSync(path.join(projectRoot, "app/pos-app.tsx"), "utf8");

for (const page of ["inbound", "vendors", "settlement", "sales", "dashboard"]) {
  const replacedUrl = buildAdminPageUrl(
    "https://kicks-center.vercel.app/?page=inventory",
    page,
  );
  const remountedPage = readAdminPage(new URL(replacedUrl, "https://kicks-center.vercel.app").search);
  assert.equal(remountedPage, page, `${page} must survive a PosApp remount`);
  assert.notEqual(remountedPage, "inventory", `${page} must not fall back to stale inventory`);
}

assert.equal(readAdminPage("?page=unknown"), "dashboard");
assert.equal(readAdminPage(""), "dashboard");
assert.equal(
  buildAdminPageUrl("https://kicks-center.vercel.app/?source=vendor#top", "sales"),
  "/?source=vendor&page=sales#top",
);

assert.match(posApp, /window\.history\.replaceState\(/);
assert.match(posApp, /buildAdminPageUrl\(window\.location\.href, p\)/);
assert.match(posApp, /window\.addEventListener\("popstate", syncPageFromUrl\)/);
assert.match(posApp, /window\.removeEventListener\("popstate", syncPageFromUrl\)/);
assert.match(posApp, /setPage\(readAdminPage\(window\.location\.search\)\)/);
assert.match(posApp, /action={<Btn variant="ghost" onClick={\(\) => go\("dashboard"\)}>← 返回首頁<\/Btn>}/);
assert.match(posApp, /function Inventory\([\s\S]*?go,[\s\S]*?}: Ctx\)/);

console.log("POS navigation regression passed: URL-synced views survive remount, inventory has a responsive home action, and invalid pages fall back safely");
