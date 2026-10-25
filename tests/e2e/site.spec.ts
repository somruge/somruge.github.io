import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Keep third-party analytics out of tests.
test.beforeEach(async ({ page }) => {
  await page.route(/gc\.zgo\.at|goatcounter\.com/, (route) => route.abort());
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
  { width: 390, height: 664 }, // iPhone 13 in Safari, with its toolbars
]) {
  test(`AC-01: positioning and both hero actions visible without scrolling at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    // On phones the tab bar covers the bottom of the screen, so "visible" means above it.
    const tabbar = await page.locator(".tabbar").boundingBox();
    const bottom = tabbar ? tabbar.y : viewport.height;
    const inView = async (locator) => {
      const box = await locator.boundingBox();
      return box !== null && box.y >= 0 && box.y + box.height <= bottom;
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

for (const scheme of ["light", "dark"] as const) for (const width of [1280, 390]) {
  test(`AC-18: no serious or critical axe violations (${scheme}, ${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
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
  expect(await page.locator(".nav-brand picture img").evaluate((img: HTMLImageElement) => img.currentSrc)).toContain("turtle.webp");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(await page.locator(".nav-brand picture img").evaluate((img: HTMLImageElement) => img.currentSrc)).toContain("turtle-still.webp");
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

test("phones: header shortcuts and a tab bar replace the section links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".nav-links")).toBeHidden();
  await expect(page.locator(".nav-avatar")).toBeVisible();
  const tabbar = page.getByRole("navigation", { name: "Sections, tab bar" });
  await expect(tabbar.getByRole("link")).toHaveText(["Work", "Experience", "Projects", "AI", "Certs"]);

  await tabbar.getByRole("link", { name: "Projects" }).click();
  await expect(page).toHaveURL(/#projects$/);
  await expect(tabbar.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "true");

  await page.getByRole("link", { name: "Play Balloon Pop" }).click();
  await expect(page).toHaveURL(/#play$/);
  await page.getByRole("link", { name: "Contact", exact: true }).click();
  await expect(page).toHaveURL(/#contact$/);
});

test("phones: no hero photo; Get in touch and Résumé side by side", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await expect(page.locator(".hero-photo")).toBeHidden();
  const touch = await page.getByRole("link", { name: "Get in touch" }).boundingBox();
  const resume = await page.getByRole("link", { name: /Résumé/ }).boundingBox();
  expect(Math.abs(touch!.y - resume!.y)).toBeLessThan(1);
  expect(touch!.height).toBeLessThan(50); // one line each, no wrapping
});

test("phones: case cards stack label, title, role, result and a read-more row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const card = page.locator("details.case").first();
  const top = async (sel: string) => (await card.locator(sel).boundingBox())!.y;
  const order = [await top(".case-org"), await top(".case-title"), await top(".case-role"), await top(".case-outcome"), await top(".case-chevron")];
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await expect(card.locator(".case-sep")).toBeHidden();
});

test("phones: a refresh opens at the top, even after tapping a tab", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".tabbar").getByRole("link", { name: "Projects" }).click();
  await expect(page).toHaveURL(/#projects$/);
  await page.reload();
  await expect(page).not.toHaveURL(/#/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator(".hero-position")).toBeInViewport();
});

test("phones: project buttons sit at the same height on every slide", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tops = await page.locator("#projects .card .actions").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

test("phones: certificates have dots and a pause button and move on every 8 seconds", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const section = page.locator("#certifications");
  const dots = section.locator(".carousel-dots button");
  await section.locator(".certs").scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(dots).toHaveCount(6);
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(section.locator(".carousel-prev, .carousel-next")).toHaveCount(0);

  await page.clock.runFor(8100);
  await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
  await section.getByRole("button", { name: /Show certificate 6: ITIL/ }).click();
  await expect(dots.nth(5)).toHaveAttribute("aria-current", "true");

  await section.getByRole("button", { name: "Pause the certificates" }).click();
  await section.getByRole("button", { name: "Play the certificates" }).blur();
  await page.mouse.move(0, 0);
  await page.clock.runFor(20000);
  await expect(dots.nth(5)).toHaveAttribute("aria-current", "true");
});

test("wider screens: certificates stay a grid with no dots", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await expect(page.locator("#certifications .cert-controls")).toBeHidden();
});

test("phones: the footer ends above the tab bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  const tabbar = await page.locator(".tabbar").boundingBox();
  for (const locator of [page.getByText("Views and figures are my own"), page.getByRole("link", { name: "Credits & privacy" })]) {
    const box = await locator.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(tabbar!.y);
  }
});

test("phones: certificates are one swipeable row; wider screens keep the grid", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const certs = page.locator(".certs");
  const row = await certs.evaluate((el) => {
    const tops = [...el.children].map((li) => Math.round(li.getBoundingClientRect().top));
    return { oneRow: new Set(tops).size === 1, scrolls: el.scrollWidth > el.clientWidth };
  });
  expect(row).toEqual({ oneRow: true, scrolls: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(certs).toHaveCSS("display", "grid");
});

test("wider screens keep the section links and no tab bar", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await expect(page.locator(".nav-links")).toBeVisible();
  await expect(page.locator(".tabbar")).toBeHidden();
  await expect(page.locator(".nav-quick").first()).toBeHidden();
  await expect(page.locator(".nav-avatar")).toBeHidden();
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
