// Request handling for the portfolio assistant (spec 09 §3, 22 §3, 24 §2).
// Kept free of Cloudflare-only imports so it can be tested in Node with fake bindings.
import type { Limiter } from "./limiter";
import { parseAnswer } from "./answer";
import { sectionIds, systemPrompt } from "./prompt";

export interface Env {
  AI: Ai;
  LIMITER: DurableObjectNamespace<Limiter>;
  ASSISTANT_ENABLED: string;
  AI_MODEL: string;
  ALLOWED_ORIGINS: string;
  DAILY_LIMIT: string;
  TURNSTILE_SECRET: string;
  IP_HASH_KEY: string;
}

export interface Deps {
  fetch: typeof fetch;
  now: () => Date;
  log: (entry: Record<string, unknown>) => void;
}

const MAX_BODY_BYTES = 2048;
const MAX_QUESTION_CHARS = 300;
const AI_TIMEOUT_MS = 20_000;
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const defaultDeps: Deps = {
  fetch: (...args) => fetch(...args),
  now: () => new Date(),
  // Counts, outcomes and timings only: never question or answer text (BR-04).
  log: (entry) => console.log(JSON.stringify(entry)),
};

export function createHandler(profile: string) {
  const sections = sectionIds(profile);
  const system = systemPrompt(profile, sections);

  return async function handle(req: Request, env: Env, deps: Deps = defaultDeps): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());

    // Origin first: other sites get nothing, not even an error body they can read (AC-13).
    if (!allowed.includes(origin)) return new Response(null, { status: 403 });

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Methods": "GET, POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const limit = Number(env.DAILY_LIMIT);
    const day = deps.now().toISOString().slice(0, 10);
    const quota = () => env.LIMITER.get(env.LIMITER.idFromName(`quota:${day}`));
    const visitor = async () => {
      const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
      return env.LIMITER.get(env.LIMITER.idFromName(await hmacHex(env.IP_HASH_KEY, `${day}|${ip}`)));
    };
    const enabled = async () => env.ASSISTANT_ENABLED === "true" && !(await quota().exhausted());

    if (url.pathname === "/status" && req.method === "GET") {
      const on = await enabled();
      const remaining = on ? await (await visitor()).peek(limit) : 0;
      return json({ enabled: on, remaining, limit });
    }

    if (url.pathname !== "/ask" || req.method !== "POST") return json({ error: "not_found" }, 404);

    const started = Date.now();
    const done = (outcome: string, extra: Record<string, unknown> = {}) =>
      deps.log({ event: "ask", outcome, ms: Date.now() - started, ...extra });

    // Payload (BR-03, AC-16)
    const body = await req.text();
    const input = parsePayload(body);
    if (!input) {
      done("invalid");
      return json({ error: "invalid" }, 400);
    }

    // Kill switch and spent quota, before any paid or external work (AC-15)
    if (!(await enabled())) {
      done("resting");
      return json({ error: "resting" }, 503);
    }

    // Turnstile (AC-14)
    const ip = req.headers.get("CF-Connecting-IP") ?? "";
    if (!(await verifyTurnstile(deps.fetch, env.TURNSTILE_SECRET, input.turnstileToken, ip))) {
      done("turnstile");
      return json({ error: "turnstile" }, 403);
    }

    // Daily limit; fails closed if the limiter is unavailable (AC-12, spec 29)
    let remaining: number;
    try {
      const res = await (await visitor()).hit(limit);
      if (!res.allowed) {
        done("limit");
        return json({ error: "limit", remaining: 0 }, 429);
      }
      remaining = res.remaining;
    } catch {
      done("limiter_error");
      return json({ error: "limit", remaining: 0 }, 429);
    }

    // Model (D-014, D-019)
    let result: { choices?: { message?: { content?: string | null } }[]; usage?: { neurons?: number } };
    try {
      result = (await withTimeout(
        env.AI.run(env.AI_MODEL as keyof AiModels, {
          messages: [
            { role: "system", content: system },
            { role: "user", content: input.question },
          ],
          max_tokens: 1024,
          temperature: 0.2,
        } as never),
        AI_TIMEOUT_MS
      )) as typeof result;
    } catch (e) {
      if (isQuotaError(e)) {
        await quota().markExhausted();
        done("quota");
        return json({ error: "resting" }, 503);
      }
      done("ai_error");
      return json({ error: "unavailable" }, 502);
    }

    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      done("empty");
      return json({ error: "unavailable" }, 502);
    }
    const answer = parseAnswer(content, sections);
    done(answer.kind, { neurons: result.usage?.neurons });
    return json({ ...answer, remaining });
  };
}

function parsePayload(body: string): { question: string; turnstileToken: string } | null {
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("question") || !keys.includes("turnstileToken")) return null;
  const { question, turnstileToken } = data as Record<string, unknown>;
  if (typeof question !== "string" || typeof turnstileToken !== "string" || !turnstileToken) return null;
  const q = question.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (q.length < 1 || q.length > MAX_QUESTION_CHARS) return null;
  return { question: q, turnstileToken };
}

async function verifyTurnstile(doFetch: typeof fetch, secret: string, token: string, ip: string) {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await doFetch(SITEVERIFY, { method: "POST", body: form });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

async function hmacHex(key: string, message: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

// Workers AI reports a used-up free allocation as an error; match it loosely (spec 28 §1).
function isQuotaError(e: unknown) {
  return /neuron|allocation|quota|capacity exceeded|4006/i.test(String(e));
}
