(function () {
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const playBtn = document.getElementById("gamePlayBtn");
  const timeEl = document.getElementById("gameTime");
  const scoreEl = document.getElementById("gameScore");
  const resultEl = document.getElementById("gameResult");

  const FIBONACCI = [1, 2, 3, 5, 8, 13];
  const ROUND_SECONDS = 10;
  const SPAWN_MS = 550;
  const BUBBLE_TTL_MS = 1100;
  const BUBBLE_RADIUS = 22;
  const BLOCKER_CHANCE = 0.18;

  const styles = getComputedStyle(document.documentElement);
  const colorAccent = styles.getPropertyValue("--accent").trim() || "#1f8a70";
  const colorAccentText = styles.getPropertyValue("--accent-text").trim() || "#ffffff";
  const colorBlocker = "#d94f4f";

  let bubbles = [];
  let score = 0;
  let timeLeft = ROUND_SECONDS;
  let playing = false;
  let rafId = null;
  let spawnTimer = null;
  let countdownTimer = null;

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  let canvasSize = sizeCanvas();
  window.addEventListener("resize", () => {
    if (!playing) canvasSize = sizeCanvas();
  });

  function spawnBubble() {
    const isBlocker = Math.random() < BLOCKER_CHANCE;
    const value = isBlocker ? 0 : FIBONACCI[Math.floor(Math.random() * FIBONACCI.length)];
    const x = BUBBLE_RADIUS + Math.random() * (canvasSize.width - BUBBLE_RADIUS * 2);
    const y = BUBBLE_RADIUS + Math.random() * (canvasSize.height - BUBBLE_RADIUS * 2);
    bubbles.push({ x, y, r: BUBBLE_RADIUS, value, isBlocker, born: performance.now() });
  }

  function draw() {
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    const now = performance.now();

    bubbles = bubbles.filter((b) => now - b.born < BUBBLE_TTL_MS);

    bubbles.forEach((b) => {
      const age = (now - b.born) / BUBBLE_TTL_MS;
      ctx.globalAlpha = 1 - age * 0.35;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.isBlocker ? colorBlocker : colorAccent;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colorAccentText;
      ctx.font = "700 15px Manrope, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.isBlocker ? "✕" : String(b.value), b.x, b.y + 1);
    });

    if (playing) rafId = requestAnimationFrame(draw);
  }

  function handleClick(evt) {
    if (!playing) return;
    const rect = canvas.getBoundingClientRect();
    const point = evt.touches ? evt.touches[0] : evt;
    const x = point.clientX - rect.left;
    const y = point.clientY - rect.top;

    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      const dx = x - b.x;
      const dy = y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) <= b.r) {
        score = b.isBlocker ? Math.max(0, score - 2) : score + b.value;
        scoreEl.textContent = String(score);
        bubbles.splice(i, 1);
        break;
      }
    }
  }

  canvas.addEventListener("click", handleClick);
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handleClick(e);
  }, { passive: false });

  function resultMessage(finalScore) {
    if (finalScore >= 40) return "🚀 Ship it — elite velocity!";
    if (finalScore >= 25) return "💪 Solid sprint. Team's proud of you.";
    if (finalScore >= 10) return "🙂 Decent sprint, a few blockers got you.";
    return "🔁 Retro time — let's improve next sprint.";
  }

  function endRound() {
    playing = false;
    clearInterval(spawnTimer);
    clearInterval(countdownTimer);
    if (rafId) cancelAnimationFrame(rafId);
    bubbles = [];
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    resultEl.textContent = `Sprint Velocity: ${score} pts — ${resultMessage(score)}`;
    playBtn.textContent = "Play Again";
    playBtn.disabled = false;
  }

  function startRound() {
    canvasSize = sizeCanvas();
    score = 0;
    timeLeft = ROUND_SECONDS;
    bubbles = [];
    playing = true;
    scoreEl.textContent = "0";
    timeEl.textContent = String(timeLeft);
    resultEl.textContent = "";
    playBtn.disabled = true;

    spawnTimer = setInterval(spawnBubble, SPAWN_MS);
    countdownTimer = setInterval(() => {
      timeLeft -= 1;
      timeEl.textContent = String(Math.max(0, timeLeft));
      if (timeLeft <= 0) endRound();
    }, 1000);

    rafId = requestAnimationFrame(draw);
  }

  playBtn.addEventListener("click", startRound);
})();
