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

test("MahaPrabha Gurukul and Trip Planner are the featured projects, then PNotes", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator("#projects .card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveClass(/card-featured/);
  await expect(cards.nth(0).getByRole("heading")).toContainText("MahaPrabha Gurukul");
  await expect(cards.nth(1)).toHaveClass(/card-featured/);
  await expect(cards.nth(1).getByRole("heading")).toContainText("Som's Trip Planner");
  await expect(cards.nth(1).getByRole("link", { name: /Try the live demo/ })).toHaveAttribute("href", "https://soms-trip-planner.somruge.workers.dev/");
  await expect(cards.nth(1).getByRole("link", { name: /How it's built/ })).toHaveAttribute("href", "https://soms-trip-planner.somruge.workers.dev/about");
  await expect(cards.nth(2).getByRole("heading")).toContainText("PNotes");
});

test("projects carousel moves on after 8 seconds, by the arrows and dots, and can be paused", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  const carousel = page.locator("#projectsCarousel");
  const dots = carousel.locator(".carousel-dots button");
  await carousel.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0); // keep the pointer off it, which would pause it
  await expect(dots).toHaveCount(3);
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");

  await page.clock.runFor(8100);
  await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#trip-planner")).toBeInViewport({ ratio: 0.9 });

  await carousel.getByRole("button", { name: "Next project" }).click();
  await expect(dots.nth(2)).toHaveAttribute("aria-current", "true");
  await carousel.getByRole("button", { name: "Next project" }).click();
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "true"); // loops back to the first
  await carousel.getByRole("button", { name: /Show project 3: PNotes/ }).click();
  await expect(dots.nth(2)).toHaveAttribute("aria-current", "true");

  await carousel.getByRole("button", { name: "Pause the slideshow" }).click();
  await page.mouse.move(0, 0);
  await carousel.getByRole("button", { name: "Play the slideshow" }).blur();
  await page.clock.runFor(20000);
  await expect(dots.nth(2)).toHaveAttribute("aria-current", "true");
});

test("projects carousel starts paused under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#projectsCarousel").getByRole("button", { name: "Play the slideshow" })).toBeVisible();
});

test("MahaPrabha Gurukul card links to the live app and shows its ratings badge", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("#mahaprabha-gurukul");
  await expect(card.getByRole("heading")).toContainText("MahaPrabha Gurukul");
  await expect(card.getByRole("link", { name: /Start learning/ })).toHaveAttribute("href", "https://mahaprabha-gurukul.pages.dev/");
  await expect(card.getByRole("link", { name: /How it's checked/ })).toHaveAttribute("href", "https://mahaprabha-gurukul.pages.dev/about");
  const badge = card.locator("img[data-appreciation]");
  await expect(badge).toHaveAttribute("src", "https://mahaprabha-gurukul.pages.dev/api/appreciation/badge.svg");
});

test("the MahaPrabha ratings badge stays hidden until the first thank-you", async ({ page }) => {
  let summary = { ratings: 0, average: null, thanks: 0 };
  await page.route("https://mahaprabha-gurukul.pages.dev/api/appreciation/summary", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(summary) }));
  await page.route("https://mahaprabha-gurukul.pages.dev/api/appreciation/badge.svg", (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="28"><rect width="200" height="28" fill="#155e75"/></svg>' }));
  await page.goto("/");
  const badge = page.locator("#mahaprabha-gurukul img[data-appreciation]");
  await page.waitForTimeout(500);
  await expect(badge).toBeHidden();
  summary = { ratings: 0, average: null, thanks: 1 };
  await page.reload();
  await page.locator("#mahaprabha-gurukul").scrollIntoViewIfNeeded(); // the badge loads lazily, near the screen
  await expect(badge).toBeVisible();
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

test("no placeholder content remains (Gate 6 requirement)", async ({ page }) => {
  for (const path of ["/", "/credits.html"]) {
    await page.goto(path);
    await expect(page.locator("[data-placeholder], .placeholder")).toHaveCount(0);
  }
});
