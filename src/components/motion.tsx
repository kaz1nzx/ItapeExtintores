"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// useLayoutEffect has no server counterpart; React warns if it runs there.
const useVisualEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Counts from the previously shown value to the next one. The first render
 * matches the server output, then the effect rewinds and animates before the
 * browser paints, so the final number is never seen twice.
 */
export function CountUp({
  value,
  format,
  duration = 900,
  className = "",
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  useVisualEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    shown.current = value;
    if (still() || from === value) {
      el.textContent = format(value);
      return;
    }
    let frame = 0;
    const begun = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - begun) / duration);
      el.textContent = format(from + (value - from) * (1 - (1 - t) ** 4));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    el.textContent = format(from);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, format, duration]);
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}

/** Holds children just below their resting place until they are scrolled into view. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (still()) {
      setVisible(true);
      return;
    }
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        watcher.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Leans towards the pointer. Mouse only, so touch and keyboard stay untouched. */
export function Magnetic({
  children,
  strength = 10,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || still() || !window.matchMedia("(pointer: fine)").matches) return;
    const lean = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const x = (e.clientX - (box.left + box.width / 2)) / (box.width / 2);
      const y = (e.clientY - (box.top + box.height / 2)) / (box.height / 2);
      el.style.transform = `translate(${x * strength}px, ${y * strength * 0.45}px)`;
    };
    const rest = () => {
      el.style.transform = "";
    };
    el.addEventListener("pointermove", lean);
    el.addEventListener("pointerleave", rest);
    return () => {
      el.removeEventListener("pointermove", lean);
      el.removeEventListener("pointerleave", rest);
    };
  }, [strength]);
  return (
    <div ref={ref} className={`magnetic ${className}`}>
      {children}
    </div>
  );
}
