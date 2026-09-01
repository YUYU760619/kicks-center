export const ADMIN_PAGES = [
  "dashboard",
  "inventory",
  "inbound",
  "pos",
  "vendors",
  "settlement",
  "sales",
  "settings",
] as const;

export type AdminPage = (typeof ADMIN_PAGES)[number];

export function readAdminPage(search: string): AdminPage {
  const requested = new URLSearchParams(search).get("page");
  return ADMIN_PAGES.some((page) => page === requested)
    ? (requested as AdminPage)
    : "dashboard";
}

export function buildAdminPageUrl(href: string, page: AdminPage): string {
  const url = new URL(href);
  url.searchParams.set("page", page);
  return `${url.pathname}${url.search}${url.hash}`;
}
