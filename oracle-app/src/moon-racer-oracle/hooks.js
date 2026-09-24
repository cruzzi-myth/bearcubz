"use client";
import { useEffect, useLayoutEffect, useState } from "react";

// useLayoutEffect in the browser, useEffect during server rendering (Next.js).
export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduce;
}

// Loads Cinzel + Cormorant Garamond from Google Fonts once, the first time the page mounts.
// If your site already self-hosts these fonts, you can delete this hook call.
export function useOracleFonts() {
  useEffect(() => {
    if (document.getElementById("mro-fonts")) return;
    const pre1 = Object.assign(document.createElement("link"), { rel: "preconnect", href: "https://fonts.googleapis.com" });
    const pre2 = Object.assign(document.createElement("link"), { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" });
    const css = Object.assign(document.createElement("link"), {
      id: "mro-fonts",
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap",
    });
    document.head.append(pre1, pre2, css);
  }, []);
}

export const cx = (...names) => names.filter(Boolean).join(" ");
