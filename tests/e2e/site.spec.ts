import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Keep third-party analytics out of tests.
test.beforeEach(async ({ page }) => {
  await page.route(/gc\.zgo\.at|goatcounter\.com/, (route) => route.abort());
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`AC-01: positioning and both hero actions visible without scrolling at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const inView = async (locator) => {
      const box = await locator.boundingBox();
      return box !== null && box.y >= 0 && box.y + box.height <= viewport.height;
    };
    expect(await inView(page.locator(".hero-position"))).toBe(true);
    expect(await inView(page.getByRole("link", { name: "Get in touch" }))).toBe(true);
    expect(await inView(page.getByRole("link", { name: /Résumé/ }))).toBe(true);
  });
}

test("the Résumé button downloads a real PDF", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.getByRole("link", { name: /Résumé/ }).getAttribute("href");
  const res = await request.get(`/${href}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("AC-03: case studies open and close by keyboard and by click", async ({ page }) => {
  await page.goto("/");
  const first = page.locator("details.case").first();
  const summary = first.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(first).not.toHaveAttribute("open", "");
  await summary.click();
  await expect(first).toHaveAttribute("open", "");
});

test.describe("AC-04: works without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("all sections visible, case studies expand, game says it needs JS", async ({ page }) => {
    await page.goto("/");
    for (const id of ["work", "experience", "projects", "ai", "ask", "certifications", "play", "contact"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    await page.locator("details.case summary").first().click();
    await expect(page.locator("details.case").first()).toHaveAttribute("open", "");
    await expect(page.getByText("Balloon Pop needs JavaScript.")).toBeVisible();
    await expect(page.getByText("The assistant needs JavaScript.")).toBeVisible();
    await expect(page.locator("#askPanel")).toBeHidden();
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`AC-18: no serious or critical axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    for (const path of ["/", "/credits.html"]) {
      await page.goto(path);
      await page.locator("details.case").evaluateAll((els) => els.forEach((d) => ((d as HTMLDetailsElement).open = true)));
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    }
  });
}

test("AC-22: animated turtle normally; only the still under reduced motion", async ({ page }) => {
  await page.goto("/");
  expect(await page.locator(".nav-brand img").evaluate((img: HTMLImageElement) => img.currentSrc)).toContain("turtle.webp");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(await page.locator(".nav-brand img").evaluate((img: HTMLImageElement) => img.currentSrc)).toContain("turtle-still.webp");
});

test("theme toggle switches and remembers the choice (FR-12)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
});

test("mobile menu opens, closes on Escape and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Menu" });
  await toggle.click();
  await expect(page.getByRole("link", { name: "Experience" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("no horizontal scroll at 320px (400% reflow)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("placeholders are marked, so the Gate 6 check can find them", async ({ page }) => {
  await page.goto("/");
  // Documents the current count; the release check (40) requires zero.
  expect(await page.locator("[data-placeholder]").count()).toBeGreaterThan(0);
});
