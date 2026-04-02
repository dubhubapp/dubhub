/**
 * Lightweight canvas-based confetti burst.
 * Single run, from top, no layout shift, non-blocking.
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

export function runConfetti(options?: {
  duration?: number;
  particleCount?: number;
  /** Wait until after the next paint so layout (e.g. modals) can settle first. */
  deferAfterPaint?: boolean;
}): void {
  const duration = options?.duration ?? 1000;
  const particleCount = options?.particleCount ?? 60;
  const deferAfterPaint = options?.deferAfterPaint ?? false;

  if (typeof document === "undefined" || typeof window === "undefined") return;

  const startAnimation = () => {
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;contain:strict";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    } as CanvasRenderingContext2DSettings);
    if (!ctx) {
      canvas.remove();
      return;
    }

    const c2d = ctx;

    const particles: Particle[] = [];
    const w = canvas.width;
    const ch = canvas.height;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: w * (0.2 + Math.random() * 0.6),
        y: -10 - Math.random() * 50,
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 3.5,
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

      c2d.setTransform(1, 0, 0, 1, 0, 0);
      c2d.clearRect(0, 0, w, ch);

      const easeOut = 1 - Math.pow(elapsed / duration, 2);
      const opacity = Math.min(1, easeOut * 2);
      c2d.globalAlpha = opacity;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.rotation += p.rotationSpeed;

        const rad = (p.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        c2d.setTransform(cos, sin, -sin, cos, p.x, p.y);
        c2d.fillStyle = p.color;
        const half = p.size / 2;
        c2d.fillRect(-half, -half, p.size, p.size);
      }

      c2d.setTransform(1, 0, 0, 1, 0, 0);
      c2d.globalAlpha = 1;

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  };

  if (deferAfterPaint) {
    requestAnimationFrame(() => {
      requestAnimationFrame(startAnimation);
    });
  } else {
    startAnimation();
  }
}
