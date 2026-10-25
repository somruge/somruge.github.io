const root = document.documentElement;
const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

// Theme toggle (FR-12): system setting by default; the choice is remembered when storage works.
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => root.dataset.theme === "dark" || (!root.dataset.theme && systemDark.matches);
  const label = () => themeToggle.setAttribute("aria-label", isDark() ? "Switch to light mode" : "Switch to dark mode");

  themeToggle.hidden = false;
  label();
  systemDark.addEventListener("change", label);
  themeToggle.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch (e) {
      /* not remembered, still switched */
    }
    label();
  });
}

// Phones: a refresh always opens at the top section. Tapping a tab leaves its #section in the
// address, and Safari restores the old scroll position; on a reload both are cleared. A fresh
// visit to a shared #section link still opens at that section.
if (window.matchMedia("(max-width: 760px)").matches) {
  const nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
  if (nav && nav.type === "reload") {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    window.scrollTo(0, 0);
  }
}

// Reveal on scroll, only when motion is allowed (13 §7)
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reducedMotion && "IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );
  document.querySelectorAll(".reveal").forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) return; // already on screen: never hide it
    el.classList.add("reveal-armed");
    revealObserver.observe(el);
  });
}

// Active section in the header links and the phone tab bar. Every section is watched, so a section
// with no link of its own (the hero, Play) clears the highlight. A link's data-also names another
// section it stands for (the AI tab opens the assistant and also covers "How I use AI").
const navAnchors = [...document.querySelectorAll(".nav-links a, .tabbar a")];
const tracked = [...document.querySelectorAll("main > section[id]")];

if ("IntersectionObserver" in window && tracked.length) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        navAnchors.forEach((a) => {
          if (a.getAttribute("href") === `#${id}` || a.dataset.also === id) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  tracked.forEach((section) => navObserver.observe(section));
}

// Case-study opens as GoatCounter events (31); counts only
document.querySelectorAll("details.case").forEach((d) => {
  d.addEventListener("toggle", () => {
    if (d.open && window.goatcounter && window.goatcounter.count) {
      window.goatcounter.count({ path: `case-study-open/${d.dataset.case}`, event: true });
    }
  });
});

// Project ratings badges: hidden until the app has its first thank-you or rating (owner's choice),
// so the card never shows "0 thank-yous". The count is public read-only JSON; on any error the
// badge simply stays hidden.
(function () {
  document.querySelectorAll("img[data-appreciation]").forEach((img) => {
    fetch(img.dataset.appreciation, { credentials: "omit", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        if (t && (Number(t.thanks) > 0 || Number(t.ratings) > 0)) img.hidden = false;
      })
      .catch(() => {});
  });
})();

// Projects carousel: one project at a time, moving on every 8 seconds and looping. It stops while the
// pointer or keyboard focus is on it, while it is off screen, and when the visitor pauses it; under
// reduced motion it starts paused. Swipe, the arrows or the dots move it by hand.
(function () {
  const carousel = document.getElementById("projectsCarousel");
  if (!carousel) return;
  const track = carousel.querySelector(".carousel-track");
  const slides = [...track.children];
  const controls = carousel.querySelector(".carousel-controls");
  const dotsBox = carousel.querySelector(".carousel-dots");
  const pauseButton = carousel.querySelector(".carousel-pause");
  const INTERVAL = 8000;

  let current = 0;
  let userPaused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let hovered = false;
  let focused = false;
  let onScreen = false;
  let timer = null;

  const dots = slides.map((slide, i) => {
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", "slide");
    slide.setAttribute("aria-label", `${i + 1} of ${slides.length}`);
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `Show project ${i + 1}: ${slide.querySelector("h3").textContent.split(" — ")[0]}`);
    dot.addEventListener("click", () => goTo(i));
    dotsBox.append(dot);
    return dot;
  });

  const offset = (i) => slides[i].offsetLeft - slides[0].offsetLeft;

  function show(i) {
    current = i;
    dots.forEach((dot, j) => dot.setAttribute("aria-current", String(j === i)));
  }

  // While the carousel scrolls itself, the scroll handler below must not read the slides it passes.
  let moving = null;
  function goTo(i) {
    const next = (i + slides.length) % slides.length;
    track.scrollTo({ left: offset(next) });
    show(next);
    clearTimeout(moving);
    moving = setTimeout(() => (moving = null), 1000);
    restart();
  }

  function running() {
    return !userPaused && !hovered && !focused && onScreen && !document.hidden;
  }

  function restart() {
    clearInterval(timer);
    timer = running() ? setInterval(() => goTo(current + 1), INTERVAL) : null;
  }

  function setPaused(paused) {
    userPaused = paused;
    carousel.classList.toggle("is-paused", paused);
    pauseButton.setAttribute("aria-label", paused ? "Play the slideshow" : "Pause the slideshow");
    restart();
  }

  // A swipe or scroll by hand: follow the slide it settles on and give it the full 8 seconds.
  let settle = null;
  track.addEventListener("scroll", () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (moving && Math.abs(offset(current) - track.scrollLeft) > 2) return;
      const i = slides.reduce((best, _, j) => (Math.abs(offset(j) - track.scrollLeft) < Math.abs(offset(best) - track.scrollLeft) ? j : best), 0);
      if (i !== current) {
        show(i);
        restart();
      }
    }, 120);
  });

  carousel.querySelector(".carousel-prev").addEventListener("click", () => goTo(current - 1));
  carousel.querySelector(".carousel-next").addEventListener("click", () => goTo(current + 1));
  pauseButton.addEventListener("click", () => setPaused(!userPaused));
  carousel.addEventListener("mouseenter", () => { hovered = true; restart(); });
  carousel.addEventListener("mouseleave", () => { hovered = false; restart(); });
  carousel.addEventListener("focusin", () => { focused = true; restart(); });
  carousel.addEventListener("focusout", (e) => {
    if (carousel.contains(e.relatedTarget)) return;
    focused = false;
    restart();
  });
  document.addEventListener("visibilitychange", restart);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; restart(); }, { threshold: 0.4 }).observe(carousel);
  } else {
    onScreen = true;
  }

  carousel.classList.add("is-carousel");
  controls.hidden = false;
  show(0);
  setPaused(userPaused);
})();
