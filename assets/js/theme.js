// Loaded in <head> so a saved theme applies before first paint (FR-12), and so
// JS-only parts (the game) can be shown without a flash of the no-JS message.
(function () {
  document.documentElement.classList.add("js");
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
  } catch (e) {
    /* storage unavailable: follow the system setting */
  }
})();
