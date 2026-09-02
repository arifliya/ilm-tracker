import { Page } from "@playwright/test";

/**
 * Dashboard sidebar nav items (`SidebarItem.tsx`) are plain `<div onClick>`
 * with a `<span>{label}</span>` inside — not real `<button>`s — so
 * `getByRole('button', ...)` never matches them. Use this instead of
 * `getByRole` for any sidebar navigation click.
 *
 * `.first()`: some sections repeat their own nav label elsewhere on the
 * page (e.g. a section heading once selected) — BaseDashboard.tsx always
 * renders the sidebar before the main content, so the first match in DOM
 * order is reliably the nav item itself, not a later heading/text reuse.
 */
export async function clickNavItem(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).first().click();
}
