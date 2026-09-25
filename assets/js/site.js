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

// Mobile menu
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

function closeMenu({ focusToggle = false } = {}) {
  navLinks.classList.remove("open");
  navToggle.setAttribute("aria-expanded", "false");
  if (focusToggle) navToggle.focus();
}

navToggle.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(open));
});

navLinks.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMenu()));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && navLinks.classList.contains("open")) closeMenu({ focusToggle: true });
});

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

// Active section in the nav
const navAnchors = [...navLinks.querySelectorAll("a")];
const tracked = navAnchors.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);

if ("IntersectionObserver" in window && tracked.length) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = `#${entry.target.id}`;
        navAnchors.forEach((a) => {
          if (a.getAttribute("href") === id) a.setAttribute("aria-current", "true");
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
