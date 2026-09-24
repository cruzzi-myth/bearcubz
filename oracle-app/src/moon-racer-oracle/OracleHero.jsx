"use client";
import { Fragment, useEffect, useRef } from "react";
import styles from "./MoonRacerOracle.module.css";
import { asset } from "./config";
import { HERO } from "./content";

export default function OracleHero({ onDraw }) {
  const taglineRef = useRef(null);

  // Keep "What Was ✦ What Is ✦ What Will Be" on one line at every screen width.
  useEffect(() => {
    const t = taglineRef.current;
    if (!t) return;
    const fit = () => {
      t.style.fontSize = "";
      const room = t.parentElement.clientWidth - 32;
      let size = parseFloat(getComputedStyle(t).fontSize);
      while (t.scrollWidth > room && size > 10) {
        size -= 1;
        t.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(t.parentElement);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div>
        <img className={styles.heroImg} src={asset(HERO.image)} alt={HERO.alt} />
      </div>
      <div className={styles.crystalBand} aria-hidden="true" />
      <div className={styles.veil}>
        <div className={`${styles.heroUnder} ${styles.wrap}`}>
          <h1 ref={taglineRef} className={`${styles.tagline} ${styles.goldText}`} aria-label={HERO.tagline.join(", ")}>
            {HERO.tagline.map((phrase, i) => (
              <Fragment key={phrase}>
                {i > 0 && <span className={styles.taglineDot} aria-hidden="true">✦</span>}
                <span aria-hidden="true">{phrase}</span>
              </Fragment>
            ))}
          </h1>
          <div className={styles.moonRule} aria-hidden="true">☽ ◯ ☾</div>
          <p className={styles.intro}>{HERO.intro}</p>
          <button type="button" className={styles.btn} onClick={onDraw}>
            {HERO.cta} <span aria-hidden="true">☾</span>
          </button>
        </div>
      </div>
    </>
  );
}
