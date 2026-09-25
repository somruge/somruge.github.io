import { test, expect, type Page, type Route } from "@playwright/test";

// The assistant panel against a fake Worker and a fake Turnstile script, so these tests are
// deterministic and offline. The real Worker is covered by worker/test and npm run eval.
const FAKE_TURNSTILE = `
window.turnstile = {
  render(el, opts) { window.__tsOpts = opts; return "w1"; },
  reset() {},
  execute() { setTimeout(() => window.__tsOpts.callback("XXXX.DUMMY.TOKEN.XXXX"), 0); },
};`;

type Reply = { status?: number; body: unknown };

async function setup(page: Page, { status = { enabled: true, remaining: 10, limit: 10 }, replies = [] as Reply[] } = {}) {
  const turnstileRequests: string[] = [];
  const askBodies: unknown[] = [];
  await page.route(/gc\.zgo\.at|goatcounter\.com/, (r) => r.abort());
  await page.route(/challenges\.cloudflare\.com/, (route: Route) => {
    turnstileRequests.push(route.request().url());
    return route.fulfill({ contentType: "text/javascript", body: FAKE_TURNSTILE });
  });
  await page.route("**/api/status", (r) => r.fulfill({ json: status }));
  await page.route("**/api/ask", (route) => {
    askBodies.push(route.request().postDataJSON());
    const reply = replies.shift() ?? { body: { kind: "refused", remaining: 9 } };
    return route.fulfill({ status: reply.status ?? 200, json: reply.body });
  });
  await page.goto("/");
  await page.locator("#ask").scrollIntoViewIfNeeded();
  return { turnstileRequests, askBodies };
}

const input = (page: Page) => page.getByLabel("Your question");
const answer = (page: Page) => page.locator("#askAnswer");

test("AC-08: Turnstile loads only once the question box is focused", async ({ page }) => {
  const { turnstileRequests } = await setup(page);
  await expect(page.locator("#askRemaining")).toHaveText("10 of 10 questions left today");
  expect(turnstileRequests).toHaveLength(0);
  await input(page).focus();
  await expect.poll(() => turnstileRequests.length).toBe(1);
});

test("AC-09: an answer shows as text with links to allowlisted sections only", async ({ page }) => {
  const { askBodies } = await setup(page, {
    replies: [{ body: { kind: "answer", text: "Som holds PMP and SAFe SPC6.", sections: ["certifications", "evil", "nope"], remaining: 9 } }],
  });
  await input(page).fill("What certifications does Som hold?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(answer(page)).toContainText("Som holds PMP and SAFe SPC6.");
  const links = answer(page).getByRole("link");
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveText("Certifications");
  await expect(links.first()).toHaveAttribute("href", "#certifications");
  await expect(page.locator("#askRemaining")).toHaveText("9 of 10 questions left today");
  expect(askBodies[0]).toEqual({ question: "What certifications does Som hold?", turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" });
  await expect(input(page)).toBeFocused();
});

test("AC-11: HTML in an answer is shown as text and never becomes an element", async ({ page }) => {
  await setup(page, { replies: [{ body: { kind: "answer", text: "<img src=x onerror=alert(1)><b>bold</b>", sections: ["top"], remaining: 9 } }] });
  let dialog = false;
  page.on("dialog", () => (dialog = true));
  await input(page).fill("Tell me something");
  await input(page).press("Enter");
  await expect(answer(page)).toContainText("<img src=x onerror=alert(1)><b>bold</b>");
  await expect(answer(page).locator("img, b")).toHaveCount(0);
  expect(dialog).toBe(false);
});

test("suggested questions submit straight away", async ({ page }) => {
  const { askBodies } = await setup(page, { replies: [{ body: { kind: "answer", text: "Yes, at FEI Systems.", sections: ["work"], remaining: 9 } }] });
  await page.getByRole("button", { name: "Has Som led a SAFe transformation?" }).click();
  await expect(answer(page)).toContainText("Yes, at FEI Systems.");
  expect((askBodies[0] as { question: string }).question).toBe("Has Som led a SAFe transformation?");
});

test("refused and not-on-page replies get their own messages", async ({ page }) => {
  await setup(page, { replies: [{ body: { kind: "refused", remaining: 9 } }, { body: { kind: "not_on_page", remaining: 8 } }] });
  await input(page).fill("Write a poem");
  await input(page).press("Enter");
  await expect(answer(page)).toContainText("I can only answer questions about Som's work");
  await input(page).fill("Does Som know Kubernetes?");
  await input(page).press("Enter");
  await expect(answer(page)).toContainText("That isn't covered on this page.");
});

test("AC-12 (page): the limit message replaces the input", async ({ page }) => {
  await setup(page, { replies: [{ status: 429, body: { error: "limit", remaining: 0 } }] });
  await input(page).fill("One more?");
  await input(page).press("Enter");
  await expect(answer(page)).toContainText("You've asked today's 10 questions.");
  await expect(answer(page).getByRole("link", { name: "Email Som" })).toBeVisible();
  await expect(input(page)).toBeDisabled();
});

test("AC-15 (page): a resting assistant hides the input", async ({ page }) => {
  await setup(page, { status: { enabled: false, remaining: 0, limit: 10 } });
  await expect(answer(page)).toHaveText("The assistant is resting today. Everything it knows is on this page.");
  await expect(input(page)).toBeHidden();
});

test("network errors offer a working Retry", async ({ page }) => {
  await setup(page, { replies: [{ status: 502, body: { error: "unavailable" } }, { body: { kind: "answer", text: "Durham, NC.", sections: ["top"], remaining: 8 } }] });
  await input(page).fill("Where is Som based?");
  await input(page).press("Enter");
  await expect(answer(page)).toContainText("Couldn't reach the assistant.");
  await answer(page).getByRole("button", { name: "Retry" }).click();
  await expect(answer(page)).toContainText("Durham, NC.");
});

test("AC-16 (page): the box stops at 300 characters and counts them", async ({ page }) => {
  await setup(page);
  await input(page).fill("x".repeat(320));
  await expect(input(page)).toHaveValue("x".repeat(300));
  await expect(page.locator("#askCount")).toHaveText("300/300");
});

test("the answered panel has no serious accessibility violations", async ({ page }) => {
  const AxeBuilder = (await import("@axe-core/playwright")).default;
  await page.emulateMedia({ reducedMotion: "reduce" }); // measure settled colours, not the reveal fade
  await setup(page, { replies: [{ body: { kind: "answer", text: "Som holds PMP.", sections: ["certifications"], remaining: 9 } }] });
  await input(page).fill("Certifications?");
  await input(page).press("Enter");
  await expect(answer(page)).toContainText("Som holds PMP.");
  const results = await new AxeBuilder({ page }).include("#ask").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.any.map((c) => c.message).join(" ")}`).join(" | ")}`)).toEqual([]);
});
