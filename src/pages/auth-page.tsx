import { useEffect, useRef } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { toAbsoluteUrl } from "@/lib/helpers";

// ── Animated floating dots background ──
function DotsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef<[number, number, number]>([167, 139, 250]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let W = window.innerWidth;
    let H = window.innerHeight;
    let animId: number;

    const DOT_COUNT = 80;
    const CONNECT_DIST = 130;

    // Read primary color from CSS variable and convert to RGB
    function hexToRgb(hex: string): [number, number, number] {
      const h = hex.replace('#', '');
      return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
      ];
    }

    function readPrimary() {
      const hex = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-primary').trim();
      if (hex) colorRef.current = hexToRgb(hex);
    }

    readPrimary();

    // Re-read when theme or accent class changes on <html>
    const observer = new MutationObserver(readPrimary);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const dots: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      alpha: number;
    }[] = [];

    function resize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
    }

    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < DOT_COUNT; i++) {
      dots.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2.2 + 1,
        alpha: Math.random() * 0.35 + 0.15,
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const [pr, pg, pb] = colorRef.current;

      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0) d.x = W;
        if (d.x > W) d.x = 0;
        if (d.y < 0) d.y = H;
        if (d.y > H) d.y = 0;
      }

      // Lines between nearby dots
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const opacity = (1 - dist / CONNECT_DIST) * 0.12;
            ctx.strokeStyle = `rgba(${pr},${pg},${pb},${opacity})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(dots[i].x, dots[i].y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.stroke();
          }
        }
      }

      // Dots
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pr},${pg},${pb},${d.alpha})`;
        ctx.fill();
        if (d.r > 2) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r + 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${pr},${pg},${pb},${d.alpha * 0.12})`;
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 h-full w-full"
    />
  );
}

export default function AuthPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Animated dots */}
      <DotsCanvas />

      {/* Gradient wash overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 600px 600px at 20% 30%, color-mix(in srgb, var(--color-primary) 12%, transparent) 0%, transparent 70%), radial-gradient(ellipse 500px 500px at 80% 70%, color-mix(in srgb, var(--color-primary) 10%, transparent) 0%, transparent 70%)",
        }}
      />

      {/* Glass card */}
      <div
        className="login-card relative z-[2] w-[min(420px,90vw)] rounded-3xl px-10 pb-10 pt-12 animate-[cardIn_0.8s_cubic-bezier(0.16,1,0.3,1)_both]"
        style={{
          border: '1px solid color-mix(in srgb, var(--color-primary) 12%, transparent)',
          background: 'color-mix(in srgb, var(--color-card) 45%, transparent)',
          backdropFilter: 'blur(50px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(50px) saturate(1.3)',
          boxShadow: '0 40px 80px rgba(0,0,0,0.25), 0 0 0 1px color-mix(in srgb, var(--color-primary) 5%, transparent), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.1)',
        }}
      >
        {/* Top highlight line */}
        <div
          className="absolute left-6 right-6 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-primary) 30%, transparent), transparent)' }}
        />

        {/* Brand */}
        <div className="mb-9 flex justify-center">
          <img
            src={toAbsoluteUrl("media/logos/xperttalk-logo2.png")}
            alt="XpertLab"
            className="h-auto max-w-55"
          />
        </div>

        {/* Login form */}
        <LoginForm />

        {/* Quote */}
        <div className="mt-7 border-t border-primary/8 pt-5 text-center">
          <p className="text-[17px] italic leading-relaxed text-primary/55 [font-family:'Caveat',cursive]">
            "Every great conversation starts with a single message."
          </p>
        </div>
      </div>
    </div>
  );
}
