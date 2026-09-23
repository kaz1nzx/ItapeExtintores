"use client";
import { useEffect, useRef } from "react";

type Ember = { x: number; y: number; r: number; drift: number; rise: number; heat: number };

/**
 * A slow field of rising embers behind the sign-in story panel. Purely
 * decorative: it is aria-hidden, it stops while the tab is hidden, and it never
 * starts at all when the visitor asks for reduced motion.
 */
export default function EmberField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let embers: Ember[] = [];
    const seed = (): Ember => ({
      x: Math.random() * width,
      y: height + Math.random() * height * 0.5,
      r: 0.6 + Math.random() * 1.9,
      drift: (Math.random() - 0.5) * 0.22,
      rise: 0.18 + Math.random() * 0.5,
      heat: 0.25 + Math.random() * 0.75,
    });

    const measure = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const wanted = Math.min(58, Math.round((width * height) / 12000));
      embers = Array.from({ length: wanted }, seed);
    };
    measure();

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const e of embers) {
        e.y -= e.rise;
        e.x += e.drift;
        if (e.y < -10 || e.x < -10 || e.x > width + 10) Object.assign(e, seed(), { y: height + 8 });
        const fade = Math.max(0, Math.min(1, e.y / height));
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(233, 108, 63, ${e.heat * fade * 0.55})`;
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return <canvas ref={ref} className="ember-field" aria-hidden="true" />;
}
