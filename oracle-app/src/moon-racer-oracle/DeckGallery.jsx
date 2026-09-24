"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./MoonRacerOracle.module.css";
import { asset } from "./config";
import { CARDS, DECK } from "./content";
import { cx } from "./hooks";

export default function DeckGallery({ sectionRef }) {
  const [open, setOpen] = useState(null); // the card shown enlarged, or null
  const closeRef = useRef(null);
  const returnFocus = useRef(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnFocus.current?.focus();
    };
  }, [open]);

  return (
    <section ref={sectionRef} className={styles.deckSection} aria-labelledby="mro-deck-title">
      <img className={styles.deckImg} src={asset(DECK.image)} alt={DECK.alt} loading="lazy" />
      <div className={styles.crystalBand} aria-hidden="true" />
      <div className={styles.veil}>
        <div className={cx(styles.deckIntro, styles.wrap)}>
          <span className={styles.eyebrow}>{DECK.eyebrow}</span>
          <h2 id="mro-deck-title" className={styles.goldText}>{DECK.title}</h2>
          <p>{DECK.intro}</p>
        </div>
      </div>
      <div className={cx(styles.deck, styles.wrap)}>
        <div className={styles.grid}>
          {CARDS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.tile}
              aria-label={`View ${c.name} larger`}
              onClick={(e) => {
                returnFocus.current = e.currentTarget;
                setOpen(c);
              }}
            >
              <img src={asset(c.image)} alt={`${c.name}. ${c.keys}.`} loading="lazy" />
            </button>
          ))}
        </div>
      </div>

      {open &&
        createPortal(
          <div
            className={styles.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label={open.name}
            onClick={(e) => e.target === e.currentTarget && setOpen(null)}
          >
            <img src={asset(open.image)} alt={`${open.name}. ${open.keys}. "${open.quote}"`} />
            <button ref={closeRef} type="button" className={cx(styles.btn, styles.btnGhost, styles.lightboxClose)} onClick={() => setOpen(null)}>
              Close
            </button>
          </div>,
          document.body
        )}
    </section>
  );
}
