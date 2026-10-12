"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Neuron-style page effects: the magic cursor (dot + lagging ring that grows
// over links and buttons) and reveal-on-scroll for anything with .reveal.
// Pure DOM, no library; respects prefers-reduced-motion via CSS.
export default function NeuronFx() {
  const pathname = usePathname();

  useEffect(() => {
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const dot = document.createElement("div");
    const ring = document.createElement("div");
    dot.className = "mc-dot";
    ring.className = "mc-ring";
    document.body.append(dot, ring);
    let mx = -100, my = -100, rx = -100, ry = -100, raf = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      const t = e.target as HTMLElement | null;
      const link = t?.closest("a, button, [role=button], input, textarea, select, label");
      ring.classList.toggle("is-link", Boolean(link));
    };
    const loop = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
      dot.remove();
      ring.remove();
    };
  }, []);

  useEffect(() => {
    // Reveal anything with .reveal when it scrolls in; a MutationObserver
    // picks up sections that mount later (data loads, Suspense).
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08 }
    );
    const scan = () => document.querySelectorAll<HTMLElement>(".reveal:not(.in):not([data-rv])").forEach((el) => {
      el.dataset.rv = "1";
      io.observe(el);
    });
    scan();
    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  return null;
}
