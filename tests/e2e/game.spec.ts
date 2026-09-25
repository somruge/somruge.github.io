import { test, expect, type Page } from "@playwright/test";

// Deterministic rounds: a fake clock runs the 10 s round instantly, and Math.random() = 0.5
// spawns every balloon as a normal (+1) balloon in the middle lane, the default keyboard lane.
async function setup(page: Page, { brokenStorage = false } = {}) {
  await page.route(/gc\.zgo\.at|goatcounter\.com/, (route) => route.abort());
  await page.clock.install();
  await page.addInitScript((broken) => {
    Math.random = () => 0.5;
    if (broken) {
      Storage.prototype.getItem = () => {
        throw new Error("blocked");
      };
      Storage.prototype.setItem = () => {
        throw new Error("blocked");
      };
    }
  }, brokenStorage);
  await page.goto("/#play");
}

async function playOneRoundByKeyboard(page: Page) {
  await page.getByRole("button", { name: /Play/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#gameCanvas")).toBeFocused();
  await page.clock.runFor(1500); // three balloons have spawned in the middle lane
  await page.keyboard.press("Space"); // +1
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space"); // empty lane: no change
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space"); // +1
  await page.clock.runFor(10_000);
}

test("AC-05: a full round can be played and scored with the keyboard only", async ({ page }) => {
  await setup(page);
  await playOneRoundByKeyboard(page);
  await expect(page.locator("#gameResult")).toHaveText(/^Score: 2 pts/);
  await expect(page.getByRole("button", { name: "Play again" })).toBeFocused();
});

test("AC-06: only the final result is announced", async ({ page }) => {
  await setup(page);
  const card = page.locator(".game-card");
  await expect(card.locator("[aria-live]")).toHaveCount(1);
  await expect(card.locator("[aria-live]")).toHaveAttribute("id", "gameResult");

  await page.getByRole("button", { name: /Play/ }).click();
  await page.clock.runFor(1500);
  await page.locator("#gameCanvas").press("Space");
  await expect(page.locator("#gameScore")).toHaveText("1");
  await expect(page.locator("#gameResult")).toHaveText(""); // nothing announced mid-round

  await page.clock.runFor(10_000);
  await expect(page.locator("#gameResult")).toHaveText(/^Score: 1 pts/);
});

test("AC-07: personal best survives a reload", async ({ page }) => {
  await setup(page);
  await playOneRoundByKeyboard(page);
  await expect(page.locator("#gameBest")).toHaveText("New personal best: 2 pts");
  await page.reload();
  await expect(page.locator("#gameBest")).toHaveText("Personal best: 2 pts");
});

test("AC-07: the game still works when storage throws", async ({ page }) => {
  await setup(page, { brokenStorage: true });
  await playOneRoundByKeyboard(page);
  await expect(page.locator("#gameResult")).toHaveText(/^Score: 2 pts/);
  await expect(page.locator("#gameBest")).toBeHidden();
});

test("Tab leaves the game canvas (no keyboard trap)", async ({ page }) => {
  await setup(page);
  await page.locator("#gameCanvas").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#gameCanvas")).not.toBeFocused();
});
