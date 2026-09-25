import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHandler, type Deps, type Env } from "../src/app";
import { parseAnswer } from "../src/answer";

const PROFILE = `# Som Ruge — site content

## top
Som Ruge
Product Management and AI / Digital Transformation Leader

## certifications
- PMP
- SAFe SPC6
`;

const ORIGIN = "https://somruge.github.io";

// Fake Durable Object namespace: one counter per name, like the real Limiter.
function fakeLimiter({ broken = false } = {}) {
  const counts = new Map<string, number>();
  return {
    counts,
    idFromName: (name: string) => name,
    get: (id: string) => ({
      async hit(limit: number) {
        if (broken) throw new Error("unavailable");
        const used = counts.get(id) ?? 0;
        if (used >= limit) return { allowed: false, remaining: 0 };
        counts.set(id, used + 1);
        return { allowed: true, remaining: limit - used - 1 };
      },
      async peek(limit: number) {
        return Math.max(0, limit - (counts.get(id) ?? 0));
      },
      async markExhausted() {
        counts.set(id, 1);
      },
      async exhausted() {
        return (counts.get(id) ?? 0) > 0;
      },
    }),
  };
}

function setup({ reply = "Som holds PMP and SAFe SPC6. [certifications]", enabled = "true", turnstileOk = true, limit = "10", aiError = null as Error | null, brokenLimiter = false } = {}) {
  const run = vi.fn(async () => {
    if (aiError) throw aiError;
    return { choices: [{ message: { content: reply } }], usage: { neurons: 27 } };
  });
  const limiter = fakeLimiter({ broken: brokenLimiter });
  const env = {
    AI: { run },
    LIMITER: limiter,
    ASSISTANT_ENABLED: enabled,
    AI_MODEL: "@cf/openai/gpt-oss-20b",
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:8080`,
    DAILY_LIMIT: limit,
    TURNSTILE_SECRET: "secret",
    IP_HASH_KEY: "key",
  } as unknown as Env;
  const logs: Record<string, unknown>[] = [];
  const turnstile = vi.fn(async () => Response.json({ success: turnstileOk }));
  const deps: Deps = {
    fetch: turnstile as unknown as typeof fetch,
    now: () => new Date("2026-09-25T12:00:00Z"),
    log: (e) => logs.push(e),
  };
  const handle = createHandler(PROFILE);
  const call = (init: { method?: string; path?: string; origin?: string | null; body?: unknown; ip?: string } = {}) => {
    const headers: Record<string, string> = { "CF-Connecting-IP": init.ip ?? "203.0.113.7" };
    if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
    const body = init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body);
    return handle(new Request(`https://somruge-ask.example.workers.dev${init.path ?? "/ask"}`, { method: init.method ?? "POST", headers, body }), env, deps);
  };
  const ask = (question = "What certifications does Som hold?", extra: Record<string, unknown> = {}) =>
    call({ body: { question, turnstileToken: "token", ...extra } });
  return { run, limiter, logs, turnstile, call, ask };
}

describe("POST /ask", () => {
  it("answers an on-topic question with allowlisted section links (AC-09 shape)", async () => {
    const { ask } = setup();
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(await res.json()).toEqual({ kind: "answer", text: "Som holds PMP and SAFe SPC6.", sections: ["certifications"], remaining: 9 });
  });

  it("sends the grounded system prompt and the question to the configured model", async () => {
    const { ask, run } = setup();
    await ask();
    const [model, input] = run.mock.calls[0] as unknown as [string, { messages: { role: string; content: string }[]; max_tokens: number; temperature: number }];
    expect(model).toBe("@cf/openai/gpt-oss-20b");
    expect(input.max_tokens).toBe(1024);
    expect(input.temperature).toBe(0.2);
    expect(input.messages[0].content).toContain("using ONLY the profile below");
    expect(input.messages[0].content).toContain("[top] [certifications]");
    expect(input.messages[0].content).toContain("he/him/his");
    expect(input.messages[1]).toEqual({ role: "user", content: "What certifications does Som hold?" });
  });

  it("maps OUT_OF_SCOPE and NOT_ON_PAGE to kinds (BR-07)", async () => {
    expect(await (await setup({ reply: "OUT_OF_SCOPE" }).ask("Write a poem")).json()).toMatchObject({ kind: "refused" });
    expect(await (await setup({ reply: "NOT_ON_PAGE [top]" }).ask("Kubernetes?")).json()).toMatchObject({ kind: "not_on_page" });
  });

  it("AC-13: rejects other origins and missing Origin before any work", async () => {
    for (const origin of ["https://evil.example", null]) {
      const { call, run, turnstile } = setup();
      const res = await call({ origin, body: { question: "hi", turnstileToken: "t" } });
      expect(res.status).toBe(403);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(run).not.toHaveBeenCalled();
      expect(turnstile).not.toHaveBeenCalled();
    }
  });

  it("AC-14: rejects a failed Turnstile check with no model call", async () => {
    const { ask, run } = setup({ turnstileOk: false });
    const res = await ask();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "turnstile" });
    expect(run).not.toHaveBeenCalled();
  });

  it("AC-12: the 11th question from the same IP on the same day gets 429", async () => {
    const { ask, run } = setup();
    for (let i = 0; i < 10; i++) expect((await ask()).status).toBe(200);
    const res = await ask();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "limit", remaining: 0 });
    expect(run).toHaveBeenCalledTimes(10);
  });

  it("counts visitors separately, by a hash rather than the raw IP", async () => {
    const { call, limiter } = setup({ limit: "1" });
    const body = { question: "Hi?", turnstileToken: "t" };
    expect((await call({ body, ip: "203.0.113.1" })).status).toBe(200);
    expect((await call({ body, ip: "203.0.113.2" })).status).toBe(200);
    expect((await call({ body, ip: "203.0.113.1" })).status).toBe(429);
    const names = [...limiter.counts.keys()];
    expect(names.some((n) => n.includes("203.0.113"))).toBe(false);
    expect(names.every((n) => /^[0-9a-f]{64}$/.test(n))).toBe(true);
  });

  it("fails closed when the limiter is unavailable", async () => {
    const { ask, run } = setup({ brokenLimiter: true });
    expect((await ask()).status).toBe(429);
    expect(run).not.toHaveBeenCalled();
  });

  it("AC-15: kill switch returns resting with no Turnstile or model call", async () => {
    const { ask, run, turnstile } = setup({ enabled: "false" });
    const res = await ask();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "resting" });
    expect(run).not.toHaveBeenCalled();
    expect(turnstile).not.toHaveBeenCalled();
  });

  it("a spent Workers AI allocation turns the assistant to resting for the day", async () => {
    const { ask, call, run } = setup({ aiError: new Error("4006: you have used up your daily free allocation of 10,000 neurons") });
    expect((await ask()).status).toBe(503);
    const status = await (await call({ method: "GET", path: "/status" })).json();
    expect(status).toMatchObject({ enabled: false });
    expect((await ask()).status).toBe(503);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("other model errors return a generic 502", async () => {
    const res = await setup({ aiError: new Error("boom: internal detail") }).ask();
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("internal detail");
  });

  it("AC-16: rejects invalid payloads with 400 and no model call", async () => {
    const cases = [
      { question: "x".repeat(301), turnstileToken: "t" },
      { question: "   ", turnstileToken: "t" },
      { question: "hi", turnstileToken: "t", extra: 1 },
      { question: 42, turnstileToken: "t" },
      { question: "hi" },
      "not json",
      JSON.stringify({ question: "a".repeat(2100), turnstileToken: "t" }),
    ];
    for (const body of cases) {
      const { call, run } = setup();
      const res = await call({ body });
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect(run).not.toHaveBeenCalled();
    }
  });

  it("AC-17: logs never contain question or answer text", async () => {
    const { ask, logs } = setup({ reply: "Som holds a secret-sounding certification. [certifications]" });
    await ask("my private question about something");
    const text = JSON.stringify(logs);
    expect(text).not.toContain("private question");
    expect(text).not.toContain("secret-sounding");
    expect(logs[0]).toMatchObject({ event: "ask", outcome: "answer", neurons: 27 });
  });
});

describe("GET /status and CORS", () => {
  it("reports enabled and remaining questions", async () => {
    const { ask, call } = setup();
    await ask();
    expect(await (await call({ method: "GET", path: "/status" })).json()).toEqual({ enabled: true, remaining: 9, limit: 10 });
  });

  it("answers the CORS preflight for allowed origins", async () => {
    const res = await setup().call({ method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
  });

  it("returns 404 for other paths", async () => {
    expect((await setup().call({ method: "GET", path: "/admin" })).status).toBe(404);
  });
});

describe("parseAnswer", () => {
  const allowed = ["top", "experience", "certifications"];

  it("keeps only allowlisted tags and strips all tags from the text", () => {
    expect(parseAnswer("Som led SAFe. [experience] [evil] [top]", allowed)).toEqual({ kind: "answer", text: "Som led SAFe.", sections: ["experience", "top"] });
  });

  it("treats an answer with no valid tag as out of scope (M0: free-text refusals)", () => {
    expect(parseAnswer("I'm sorry, but I can't help with that.", allowed)).toEqual({ kind: "refused" });
    expect(parseAnswer("Sure! [evil]", allowed)).toEqual({ kind: "refused" });
  });

  it("AC-11: passes HTML through as inert text for the page to render with textContent", () => {
    const a = parseAnswer('<img src=x onerror=alert(1)> [top]', allowed);
    expect(a).toEqual({ kind: "answer", text: "<img src=x onerror=alert(1)>", sections: ["top"] });
  });

  it("caps the answer length", () => {
    const a = parseAnswer(`${"word ".repeat(400)}[top]`, allowed);
    expect(a.kind === "answer" && a.text.length).toBe(1200);
  });
});
