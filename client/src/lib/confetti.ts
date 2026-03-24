/**
 * Lightweight canvas-based confetti burst.
 * Single run, ~1s, from top, no layout shift, non-blocking.
 */
const COLORS = [
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#60a5fa",
  "#f97316",
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
}

export function runConfetti(options?: { duration?: number; particleCount?: number }): void {
  const duration = options?.duration ?? 1000;
  const particleCount = options?.particleCount ?? 60;

  if (typeof document === "undefined" || typeof window === "undefined") return;

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const particles: Particle[] = [];
  const w = canvas.width;
  const h = canvas.height;

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: w * (0.2 + Math.random() * 0.6),
      y: -10 - Math.random() * 50,
      vx: (Math.random() - 0.5) * 8,
      vy: 4 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      size: 4 + Math.random() * 6,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 20,
    });
  }

  const start = performance.now();

  function tick(now: number) {
    const elapsed = now - start;
    if (elapsed >= duration) {
      canvas.remove();
      return;
    }
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    const easeOut = 1 - Math.pow(elapsed / duration, 2);
    const opacity = Math.min(1, easeOut * 2);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.rotation += p.rotationSpeed;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
