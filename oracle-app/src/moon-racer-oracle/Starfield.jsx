"use client";
import { useEffect, useRef } from "react";
import styles from "./MoonRacerOracle.module.css";

// Soft gold four-point glints twinkling behind the card pull.
export default function Starfield({ reduce }) {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext("2d");
    let stars = [];
    let w = 0;
    let h = 0;
    let raf = 0;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: Math.round((w * h) / 16000) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.3,
        p: Math.random() * Math.PI * 2,
        s: 0.6 + Math.random() * 1.4,
      }));
    };

    const frame = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = reduce ? 0.6 : 0.35 + 0.45 * Math.sin((t / 1000) * s.s + s.p);
        const R = s.r * 2.6;
        const q = s.r * 0.5;
        ctx.fillStyle = `rgba(214,165,86,${a})`;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - R);
        ctx.lineTo(s.x + q, s.y - q);
        ctx.lineTo(s.x + R, s.y);
        ctx.lineTo(s.x + q, s.y + q);
        ctx.lineTo(s.x, s.y + R);
        ctx.lineTo(s.x - q, s.y + q);
        ctx.lineTo(s.x - R, s.y);
        ctx.lineTo(s.x - q, s.y - q);
        ctx.closePath();
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduce]);

  return <canvas ref={ref} className={styles.stars} aria-hidden="true" />;
}
