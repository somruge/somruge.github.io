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

// Sliders: a row that moves on one item every 8 seconds and loops. It stops while the pointer or
// keyboard focus is on it, while it is off screen, and when the visitor pauses it; under reduced
// motion it starts paused. Swipe, the dots (and arrows, when there are any) move it by hand.
// `active` limits the slider to when it applies (the certificates row only slides on phones).
function makeSlider({ root, track, slides, dotsBox, pauseButton, prev, next, dotLabel, pauseLabels, active = () => true }) {
  const INTERVAL = 8000;
  let current = 0;
  let userPaused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let hovered = false;
  let focused = false;
  let onScreen = false;
  let timer = null;

  const dots = slides.map((slide, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", dotLabel(slide, i));
    dot.addEventListener("click", () => goTo(i));
    dotsBox.append(dot);
    return dot;
  });

  const offset = (i) => slides[i].offsetLeft - slides[0].offsetLeft;

  function show(i) {
    current = i;
    dots.forEach((dot, j) => dot.setAttribute("aria-current", String(j === i)));
  }

  // While the slider scrolls itself, the scroll handler below must not read the slides it passes.
  let moving = null;
  function goTo(i) {
    const n = (i + slides.length) % slides.length;
    track.scrollTo({ left: offset(n) });
    show(n);
    clearTimeout(moving);
    moving = setTimeout(() => (moving = null), 1000);
    restart();
  }

  function running() {
    return active() && !userPaused && !hovered && !focused && onScreen && !document.hidden;
  }

  function restart() {
    clearInterval(timer);
    timer = running() ? setInterval(() => goTo(current + 1), INTERVAL) : null;
  }

  function setPaused(paused) {
    userPaused = paused;
    root.classList.toggle("is-paused", paused);
    pauseButton.setAttribute("aria-label", paused ? pauseLabels.play : pauseLabels.pause);
    restart();
  }

  // A swipe or scroll by hand: follow the item it settles on and give it the full 8 seconds. When
  // the row is scrolled to its end, the last item counts as current even if it can't reach the start.
  let settle = null;
  track.addEventListener("scroll", () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (moving && Math.abs(offset(current) - track.scrollLeft) > 2) return;
      const atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
      const i = atEnd ? slides.length - 1 : slides.reduce((best, _, j) => (Math.abs(offset(j) - track.scrollLeft) < Math.abs(offset(best) - track.scrollLeft) ? j : best), 0);
      if (i !== current) {
        show(i);
        restart();
      }
    }, 120);
  });

  if (prev) prev.addEventListener("click", () => goTo(current - 1));
  if (next) next.addEventListener("click", () => goTo(current + 1));
  pauseButton.addEventListener("click", () => setPaused(!userPaused));
  root.addEventListener("mouseenter", () => { hovered = true; restart(); });
  root.addEventListener("mouseleave", () => { hovered = false; restart(); });
  root.addEventListener("focusin", () => { focused = true; restart(); });
  root.addEventListener("focusout", (e) => {
    if (root.contains(e.relatedTarget)) return;
    focused = false;
    restart();
  });
  document.addEventListener("visibilitychange", restart);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; restart(); }, { threshold: 0.4 }).observe(track);
  } else {
    onScreen = true;
  }

  show(0);
  setPaused(userPaused);
  return { restart };
}

// Projects carousel: one project at a time. Without JavaScript the cards stay a stacked list.
(function () {
  const carousel = document.getElementById("projectsCarousel");
  if (!carousel) return;
  const track = carousel.querySelector(".carousel-track");
  const slides = [...track.children];
  slides.forEach((slide, i) => {
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", "slide");
    slide.setAttribute("aria-label", `${i + 1} of ${slides.length}`);
  });
  makeSlider({
    root: carousel,
    track,
    slides,
    dotsBox: carousel.querySelector(".carousel-dots"),
    pauseButton: carousel.querySelector(".carousel-pause"),
    prev: carousel.querySelector(".carousel-prev"),
    next: carousel.querySelector(".carousel-next"),
    dotLabel: (slide, i) => `Show project ${i + 1}: ${slide.querySelector("h3").textContent.split(" — ")[0]}`,
    pauseLabels: { pause: "Pause the slideshow", play: "Play the slideshow" },
  });
  carousel.classList.add("is-carousel");
  carousel.querySelector(".carousel-controls").hidden = false;
})();

// Certificates: on phones the tiles are one swipeable row (site.css); here it gets dots and a
// pause button and moves on every 8 seconds, like the projects. Wider screens keep the grid, with
// no controls and no movement.
(function () {
  const section = document.getElementById("certifications");
  const track = section && section.querySelector(".certs");
  const controls = section && section.querySelector(".cert-controls");
  if (!track || !controls) return;
  const phone = window.matchMedia("(max-width: 760px)");
  const slider = makeSlider({
    root: section,
    track,
    slides: [...track.children],
    dotsBox: controls.querySelector(".carousel-dots"),
    pauseButton: controls.querySelector(".carousel-pause"),
    dotLabel: (slide, i) => `Show certificate ${i + 1}: ${slide.querySelector("h3 a").firstChild.textContent.trim()}`,
    pauseLabels: { pause: "Pause the certificates", play: "Play the certificates" },
    active: () => phone.matches,
  });
  section.classList.add("carousel");
  phone.addEventListener("change", slider.restart);
  controls.hidden = false;
})();
