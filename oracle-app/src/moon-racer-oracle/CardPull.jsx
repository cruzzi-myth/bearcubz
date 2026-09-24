"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./MoonRacerOracle.module.css";
import { asset } from "./config";
import { CARDS, CARD_BACK, PULL } from "./content";
import { cx, useIsoLayoutEffect } from "./hooks";
import Starfield from "./Starfield";

const TILT = ["-6deg", "0deg", "6deg"];
const SLOT_LABELS = ["Choose the left card", "Choose the middle card", "Choose the right card"];
const NUMERALS = ["I", "II", "III", "IV", "V"];

/**
 * Three face-down cards. The visitor picks one; it glides to centre, flips,
 * and reveals a random card from CARDS (never the same card twice in a row).
 */
export default function CardPull({ sectionRef, onMeetDeck, reduce }) {
  // phase: "idle" (three cards) → "reveal" (big card on stage) → "resetting" (fading back)
  const [phase, setPhase] = useState("idle");
  const [picked, setPicked] = useState(-1);
  const [card, setCard] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [read, setRead] = useState(false);

  const bigRef = useRef(null);
  const againRef = useRef(null);
  const from = useRef(null);
  const last = useRef(-1);
  const timers = useRef([]);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Preload every face so the flip never lands on a blank card.
  useEffect(() => {
    CARDS.forEach((c) => {
      const img = new Image();
      img.src = asset(c.image);
    });
  }, []);

  const pick = (i, e) => {
    if (phase !== "idle") return;
    let n;
    do n = Math.floor(Math.random() * CARDS.length);
    while (n === last.current && CARDS.length > 1);
    last.current = n;
    from.current = { rect: e.currentTarget.getBoundingClientRect(), tilt: TILT[i] };
    setCard(CARDS[n]);
    setPicked(i);
    setPhase("reveal");
  };

  // Glide the big card from where the chosen card sat to its place on the stage, then flip.
  useIsoLayoutEffect(() => {
    if (phase !== "reveal" || !from.current || !bigRef.current) return;
    const big = bigRef.current;
    const { rect, tilt } = from.current;
    from.current = null;
    const to = big.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - (to.left + to.width / 2);
    const dy = rect.top + rect.height / 2 - (to.top + to.height / 2);
    const s = rect.width / to.width;

    big.style.transition = "none";
    big.style.transform = `translate(${dx}px, ${dy}px) scale(${s}) rotate(${tilt})`;
    void big.offsetWidth; // commit the starting position
    big.style.transition = reduce ? "none" : "transform .9s cubic-bezier(.2,.8,.2,1)";
    big.style.transform = "none";

    later(() => setFlipped(true), reduce ? 0 : 850);
    later(() => {
      setRead(true);
      againRef.current?.focus({ preventScroll: true });
    }, reduce ? 0 : 1900);
  }, [phase]);

  const again = () => {
    if (!read) return;
    setRead(false);
    setFlipped(false);
    setPhase("resetting");
    later(() => {
      setPhase("idle");
      setPicked(-1);
      setCard(null);
    }, reduce ? 0 : 700);
  };

  const active = phase !== "idle";

  return (
    <section
      ref={sectionRef}
      className={cx(styles.pull, flipped && styles.revealed)}
      aria-labelledby="mro-draw-title"
    >
      <div
        className={styles.pullAura}
        style={card ? { backgroundImage: `url(${asset(card.image)})` } : undefined}
        aria-hidden="true"
      />
      <div className={styles.pullShade} aria-hidden="true" />
      <Starfield reduce={reduce} />

      <div className={styles.wrap}>
        <div className={cx(styles.pullHead, styles.veil)}>
          <span className={styles.eyebrow}>{PULL.eyebrow}</span>
          <h2 id="mro-draw-title" className={styles.goldText}>{PULL.title}</h2>
          <div className={styles.moonRule} aria-hidden="true">☽ ◯ ☾</div>
          <div className={styles.ritual}>
            {PULL.ritual.map((step, i) => (
              <span key={step}>
                <b>{NUMERALS[i]}</b> {step}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.table}>
          <div>
            <div className={cx(styles.spread, active && styles.dim)}>
              {TILT.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={cx(styles.slot, picked === i && styles.picked)}
                  aria-label={SLOT_LABELS[i]}
                  onClick={(e) => pick(i, e)}
                  tabIndex={active ? -1 : 0}
                >
                  <img src={asset(CARD_BACK)} alt="" />
                </button>
              ))}
            </div>
            <p className={styles.hint}>{PULL.hint}</p>
          </div>

          {active && card && (
            <div className={cx(styles.stage, flipped && styles.flipped, read && styles.read)}>
              <div className={styles.big} ref={bigRef}>
                <div className={styles.flipper}>
                  <div className={styles.face}>
                    <img src={asset(CARD_BACK)} alt="" />
                  </div>
                  <div className={cx(styles.face, styles.front)}>
                    <img src={asset(card.image)} alt={`${card.name}. ${card.keys}. "${card.quote}"`} />
                  </div>
                </div>
              </div>
              <div className={styles.reading} aria-live="polite">
                <span className={styles.eyebrow}>Your card</span>
                <h3>
                  <span className={styles.goldText}>{card.name}</span>
                </h3>
                <div className={styles.keys}>{card.keys}</div>
                <blockquote className={styles.quote}>{card.quote}</blockquote>
                <p className={styles.guide}>{card.guide}</p>
                <div className={styles.actions}>
                  <button ref={againRef} type="button" className={styles.btn} onClick={again}>
                    Draw again
                  </button>
                  <button type="button" className={cx(styles.btn, styles.btnGhost)} onClick={onMeetDeck}>
                    Meet the full deck
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
