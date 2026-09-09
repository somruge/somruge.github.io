(function () {
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const playBtn = document.getElementById("gamePlayBtn");
  const timeEl = document.getElementById("gameTime");
  const scoreEl = document.getElementById("gameScore");
  const resultEl = document.getElementById("gameResult");

  const ROUND_SECONDS = 10;
  const SPAWN_MS = 480;
  const RISE_SPEED = 0.075; // px/ms
  const WOBBLE_AMPLITUDE = 9;
  const WOBBLE_PERIOD = 900; // ms
  const POP_ANIM_MS = 200;
  const GOLDEN_CHANCE = 0.1;
  const BLOCKER_CHANCE = 0.16;

  const NORMAL_COLORS = ["#1F8A70", "#E2725B", "#4F86C6", "#8E5572", "#4CAA5C"];
  const GOLDEN_COLOR = "#F2B705";
  const BLOCKER_COLOR = "#3A3F44";

  let balloons = [];
  let score = 0;
  let timeLeft = ROUND_SECONDS;
  let playing = false;
  let rafId = null;
  let spawnTimer = null;
  let countdownTimer = null;
  let lastFrame = 0;
  let canvasSize = { width: 0, height: 0 };

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  canvasSize = sizeCanvas();
  window.addEventListener("resize", () => {
    if (!playing) canvasSize = sizeCanvas();
  });

  function spawnBalloon() {
    const roll = Math.random();
    const isGolden = roll < GOLDEN_CHANCE;
    const isBlocker = !isGolden && roll < GOLDEN_CHANCE + BLOCKER_CHANCE;
    const r = 16 + Math.random() * 10;
    const baseX = r + Math.random() * (canvasSize.width - r * 2);
    balloons.push({
      baseX,
      x: baseX,
      y: canvasSize.height + r,
      r,
      color: isGolden ? GOLDEN_COLOR : isBlocker ? BLOCKER_COLOR : NORMAL_COLORS[Math.floor(Math.random() * NORMAL_COLORS.length)],
      isGolden,
      isBlocker,
      born: performance.now(),
      phase: Math.random() * Math.PI * 2,
      popping: false,
      popStart: 0,
    });
  }

  function drawBalloon(b, now) {
    const { x, y, r, color } = b;

    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.quadraticCurveTo(x - 5, y + r + 10, x, y + r + 18);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.82, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x - r * 0.28, y - r * 0.4);
    ctx.quadraticCurveTo(x - r * 0.28, y - r * 0.75, x, y - r * 0.75);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 4, y + r);
    ctx.lineTo(x + 4, y + r);
    ctx.lineTo(x, y + r + 7);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    if (b.isGolden) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 13px Manrope, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", x, y);
    } else if (b.isBlocker) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      const s = r * 0.32;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s);
      ctx.lineTo(x - s, y + s);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPop(b, now) {
    const t = (now - b.popStart) / POP_ANIM_MS;
    const radius = b.r * (1 + t * 0.9);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      ctx.beginPath();
      ctx.moveTo(b.x + Math.cos(angle) * radius * 0.4, b.y + Math.sin(angle) * radius * 0.4);
      ctx.lineTo(b.x + Math.cos(angle) * radius, b.y + Math.sin(angle) * radius);
      ctx.stroke();
    }
    ctx.restore();
  }

  function tick(now) {
    if (!lastFrame) lastFrame = now;
    const dt = now - lastFrame;
    lastFrame = now;

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    balloons = balloons.filter((b) => {
      if (b.popping) return now - b.popStart < POP_ANIM_MS;
      return b.y + b.r > -20;
    });

    balloons.forEach((b) => {
      if (b.popping) {
        drawPop(b, now);
        return;
      }
      b.y -= RISE_SPEED * dt;
      b.x = b.baseX + Math.sin((now - b.born) / WOBBLE_PERIOD + b.phase) * WOBBLE_AMPLITUDE;
      drawBalloon(b, now);
    });

    if (playing) rafId = requestAnimationFrame(tick);
  }

  function handleClick(evt) {
    if (!playing) return;
    const rect = canvas.getBoundingClientRect();
    const point = evt.touches ? evt.touches[0] : evt;
    const x = point.clientX - rect.left;
    const y = point.clientY - rect.top;

    for (let i = balloons.length - 1; i >= 0; i--) {
      const b = balloons[i];
      if (b.popping) continue;
      const dx = x - b.x;
      const dy = y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) <= b.r + 4) {
        const delta = b.isBlocker ? -2 : b.isGolden ? 5 : 1;
        score = Math.max(0, score + delta);
        scoreEl.textContent = String(score);
        b.popping = true;
        b.popStart = performance.now();
        break;
      }
    }
  }

  canvas.addEventListener("click", handleClick);
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      handleClick(e);
    },
    { passive: false }
  );

  function resultMessage(finalScore) {
    if (finalScore >= 30) return "🚀 Ship it — elite velocity!";
    if (finalScore >= 18) return "💪 Solid sprint. Team's proud of you.";
    if (finalScore >= 8) return "🙂 Decent sprint, a few blockers got you.";
    return "🔁 Retro time — let's improve next sprint.";
  }

  function endRound() {
    playing = false;
    clearInterval(spawnTimer);
    clearInterval(countdownTimer);
    if (rafId) cancelAnimationFrame(rafId);
    balloons = [];
    lastFrame = 0;
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    resultEl.textContent = `Sprint Velocity: ${score} pts — ${resultMessage(score)}`;
    playBtn.textContent = "Play Again";
    playBtn.disabled = false;
  }

  function startRound() {
    canvasSize = sizeCanvas();
    score = 0;
    timeLeft = ROUND_SECONDS;
    balloons = [];
    playing = true;
    lastFrame = 0;
    scoreEl.textContent = "0";
    timeEl.textContent = String(timeLeft);
    resultEl.textContent = "";
    playBtn.disabled = true;

    spawnTimer = setInterval(spawnBalloon, SPAWN_MS);
    countdownTimer = setInterval(() => {
      timeLeft -= 1;
      timeEl.textContent = String(Math.max(0, timeLeft));
      if (timeLeft <= 0) endRound();
    }, 1000);

    rafId = requestAnimationFrame(tick);
  }

  playBtn.addEventListener("click", startRound);
})();
