import { Locator, Page } from "@playwright/test";

/**
 * Register.tsx and ChildFormFields.tsx pair `<label>`/`<input>` as plain
 * siblings (no `htmlFor`/`id`), so Playwright's `getByLabel()` can't find
 * them. Locates the input/select/textarea immediately following a label
 * with the given exact text, scoped to `scope` (a Page, or a Locator for
 * a specific section when the same label text repeats on the page —
 * e.g. "First name *" appears once for the parent and once per student).
 *
 * Uses `normalize-space(.)` (the label's full string value), not
 * `normalize-space(text())` — some labels interpolate JSX like
 * `{cls.class_name} (£)`, which React renders as two sibling text nodes.
 * XPath's `text()` returns a node-set and only the first node's value is
 * used in a string comparison, silently truncating to "Year 7A" instead
 * of "Year 7A (£)"; `.` concatenates every descendant text node.
 */
export function fieldByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope.locator(
    `xpath=.//label[normalize-space(.)="${labelText}"]/following-sibling::*[self::input or self::select or self::textarea][1]`
  );
}
