// "Ask about my work" panel (spec 12 §3, 14, FR-30 to FR-36).
// Model output is only ever inserted as text; section links are built from an allowlist (FR-33).
(function () {
  const section = document.getElementById("ask");
  if (!section) return;

  const panel = document.getElementById("askPanel");
  const form = document.getElementById("askForm");
  const input = document.getElementById("askInput");
  const button = document.getElementById("askButton");
  const count = document.getElementById("askCount");
  const answer = document.getElementById("askAnswer");
  const remainingEl = document.getElementById("askRemaining");
  const slot = document.getElementById("turnstileSlot");
  const chips = [...section.querySelectorAll(".chip")];

  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const api = (local ? section.dataset.apiDev : section.dataset.apiProd) || "";
  const sitekey = (local ? section.dataset.sitekeyDev : section.dataset.sitekeyProd) || "";
  const TIMEOUT_MS = 25_000;
  const MAX = 300;

  const SECTION_NAMES = {
    top: "Intro",
    outcomes: "Outcomes",
    work: "Selected work",
    experience: "Experience",
    projects: "Projects",
    ai: "How I apply AI",
    certifications: "Certifications",
    contact: "Contact",
  };

  let busy = false;
  let dailyLimit = 10;
  let widgetId = null;
  let turnstileLoading = null;
  let pendingToken = null;

  const track = (path) => {
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path, event: true });
  };

  // ---------- rendering ----------

  function setMessage(text, { tone = "", extra = null } = {}) {
    answer.replaceChildren();
    answer.className = `ask-answer${tone ? ` ask-${tone}` : ""}`;
    const p = document.createElement("p");
    p.textContent = text;
    answer.append(p);
    if (extra) answer.append(extra);
  }

  function showThinking() {
    answer.className = "ask-answer ask-thinking";
    answer.replaceChildren();
    const p = document.createElement("p");
    const dots = document.createElement("span");
    dots.className = "dots";
    dots.setAttribute("aria-hidden", "true");
    dots.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
    p.append(dots, document.createTextNode(" Thinking…"));
    answer.append(p);
  }

  function renderAnswer(text, sections) {
    answer.className = "ask-answer ask-answered";
    answer.replaceChildren();
    for (const para of text.split(/\n{2,}/)) {
      const p = document.createElement("p");
      p.textContent = para; // never innerHTML (AC-11)
      answer.append(p);
    }
    const links = (sections || []).filter((id) => /^[a-z0-9-]+$/.test(id) && SECTION_NAMES[id] && document.getElementById(id));
    if (links.length) {
      const from = document.createElement("p");
      from.className = "ask-sources";
      from.append(document.createTextNode("From: "));
      links.forEach((id, i) => {
        if (i) from.append(document.createTextNode(" · "));
        const a = document.createElement("a");
        a.href = `#${id}`;
        a.textContent = SECTION_NAMES[id];
        from.append(a);
      });
      answer.append(from);
    }
  }

  function setRemaining(n) {
    remainingEl.textContent = typeof n === "number" ? `${n} of ${dailyLimit} questions left today` : "";
  }

  function setInputEnabled(on) {
    input.disabled = !on;
    button.disabled = !on || busy;
    chips.forEach((c) => (c.disabled = !on || busy));
  }

  function rest() {
    panel.classList.add("ask-resting");
    form.hidden = true;
    section.querySelector(".ask-suggestions").hidden = true;
    remainingEl.textContent = "";
    setMessage("The assistant is resting today. Everything it knows is on this page.", { tone: "resting" });
  }

  function limitReached() {
    setRemaining(0);
    setInputEnabled(false);
    const a = document.createElement("a");
    a.className = "btn btn-primary";
    a.href = "mailto:ruge.somanath@gmail.com";
    a.textContent = "Email Som";
    setMessage(`You've asked today's ${dailyLimit} questions. Thanks for your interest! The best next step is to get in touch.`, {
      tone: "limit",
      extra: a,
    });
  }

  function error(retryQuestion) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn btn-secondary";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => ask(retryQuestion));
    setMessage("Couldn't reach the assistant.", { tone: "error", extra: retry });
  }

  // ---------- Turnstile (loaded on first use only, FR-31) ----------

  function loadTurnstile() {
    if (turnstileLoading) return turnstileLoading;
    turnstileLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => {
        try {
          widgetId = window.turnstile.render(slot, {
            sitekey,
            execution: "execute",
            appearance: "interaction-only",
            callback: (token) => pendingToken && pendingToken.resolve(token),
            "error-callback": () => pendingToken && pendingToken.reject(new Error("turnstile")),
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      s.onerror = () => reject(new Error("turnstile-load"));
      document.head.append(s);
    });
    return turnstileLoading;
  }

  async function getToken() {
    await loadTurnstile();
    return new Promise((resolve, reject) => {
      pendingToken = { resolve, reject };
      window.turnstile.reset(widgetId); // tokens are single-use
      window.turnstile.execute(widgetId);
    }).finally(() => (pendingToken = null));
  }

  // ---------- API ----------

  async function request(path, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${api}${path}`, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkStatus() {
    if (!api || !sitekey) return rest();
    try {
      const res = await request("/status");
      const data = await res.json();
      if (!data.enabled) return rest();
      if (typeof data.limit === "number") dailyLimit = data.limit;
      if (data.remaining <= 0) return limitReached();
      setRemaining(data.remaining);
    } catch (e) {
      /* the panel still works; the first question will report any problem */
    }
  }

  async function ask(question) {
    const q = question.trim();
    if (!q || q.length > MAX || busy) return;
    busy = true;
    setInputEnabled(true);
    button.setAttribute("aria-busy", "true");
    showThinking();

    let token;
    try {
      token = await getToken();
    } catch (e) {
      busy = false;
      button.removeAttribute("aria-busy");
      setInputEnabled(true);
      setMessage("Couldn't verify you're human. Try again.", { tone: "error" });
      return;
    }

    try {
      const res = await request("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, turnstileToken: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        track("ask-limit");
        limitReached();
      } else if (res.status === 503) {
        rest();
      } else if (res.status === 403 && data.error === "turnstile") {
        setMessage("Couldn't verify you're human. Try again.", { tone: "error" });
      } else if (!res.ok) {
        track("ask-error");
        error(q);
      } else {
        if (data.kind === "answer") {
          track("ask-question");
          renderAnswer(data.text, data.sections);
        } else if (data.kind === "not_on_page") {
          track("ask-refused");
          setMessage("That isn't covered on this page. Try one of the suggested questions, or get in touch.", { tone: "refused" });
        } else {
          track("ask-refused");
          setMessage("I can only answer questions about Som's work and projects on this page. Try one of the suggested questions.", { tone: "refused" });
        }
        if (typeof data.remaining === "number") setRemaining(data.remaining);
      }
    } catch (e) {
      track("ask-error");
      error(q);
    } finally {
      busy = false;
      button.removeAttribute("aria-busy");
      if (!input.disabled) setInputEnabled(true);
      if (!form.hidden && !input.disabled) input.focus({ preventScroll: true });
    }
  }

  // ---------- wiring ----------

  const updateCount = () => (count.textContent = `${input.value.length}/${MAX}`);
  input.addEventListener("input", updateCount);
  input.addEventListener("focus", () => loadTurnstile().catch(() => {}), { once: true });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("focus", () => input.scrollIntoView({ block: "nearest" }));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(input.value);
  });

  chips.forEach((chip) =>
    chip.addEventListener("click", () => {
      input.value = chip.textContent;
      updateCount();
      loadTurnstile().catch(() => {});
      ask(chip.textContent);
    })
  );

  // Check status only when the section comes near the screen (FR-36), not on every page load.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          checkStatus();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(section);
  } else {
    checkStatus();
  }
})();
