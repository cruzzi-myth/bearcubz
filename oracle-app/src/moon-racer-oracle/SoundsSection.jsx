"use client";
import styles from "./MoonRacerOracle.module.css";
import { SOUNDS } from "./content";
import { cx } from "./hooks";
import TrackPlayer from "./TrackPlayer";

export default function SoundsSection() {
  return (
    <section aria-labelledby="mro-sounds-title">
      <div className={styles.veil}>
        <div className={cx(styles.wrap, styles.foot)}>
          <div className={styles.moons} aria-hidden="true">☽ ◐ ○ ◑ ☾</div>
          <h2 id="mro-sounds-title" className={styles.sigTitle}>
            <span className={styles.goldText}>{SOUNDS.title}</span>
          </h2>
          <span className={styles.eyebrow}>{SOUNDS.eyebrow}</span>
          <p className={styles.sig}>{SOUNDS.byline}</p>
        </div>
      </div>
      <div className={cx(styles.wrap, styles.tracks)}>
        {SOUNDS.tracks.map((t) => (
          <TrackPlayer key={t.id} track={t} />
        ))}
      </div>
    </section>
  );
}
