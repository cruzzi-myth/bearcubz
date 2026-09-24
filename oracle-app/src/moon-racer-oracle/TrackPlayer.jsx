"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./MoonRacerOracle.module.css";
import { asset } from "./config";
import { cx } from "./hooks";

// Only one track plays at a time across the page.
let currentAudio = null;

const fmt = (t) => {
  const s = Math.max(0, Math.floor(t || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** A single player card. Never autoplays. */
export default function TrackPlayer({ track }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(track.duration || 0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    const onMeta = () => setDuration(a.duration);
    const onTime = () => !dragging && setTime(a.currentTime);
    const onPlay = () => {
      if (currentAudio && currentAudio !== a) currentAudio.pause();
      currentAudio = a;
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      a.currentTime = 0;
      setTime(0);
    };
    if (a.readyState >= 1) onMeta();
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, [dragging]);

  // Stop the music if the visitor navigates away from the page.
  useEffect(() => {
    const a = audioRef.current;
    return () => {
      a.pause();
      if (currentAudio === a) currentAudio = null;
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const pct = duration ? (time / duration) * 100 : 0;

  return (
    <article className={cx(styles.track, playing && styles.playing)}>
      <div className={styles.trackArt}>
        <img src={asset(track.image)} alt={track.alt} loading="lazy" />
      </div>
      <div className={styles.player}>
        <div className={styles.trackHead}>
          <h3 className={styles.trackTitle}>{track.title}</h3>
          <span className={styles.sep} aria-hidden="true">·</span>
          <span className={styles.badge}>{track.label}</span>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.play}
            onClick={toggle}
            aria-label={`${playing ? "Pause" : "Play"} ${track.title}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {playing ? (
                <>
                  <rect x="6.5" y="5" width="4" height="14" rx="1" />
                  <rect x="13.5" y="5" width="4" height="14" rx="1" />
                </>
              ) : (
                <path d="M8 5.5v13l11-6.5z" />
              )}
            </svg>
          </button>
          <input
            id={`mro-seek-${track.id}`}
            className={styles.seek}
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={time}
            style={{ "--p": `${pct}%` }}
            aria-label={`${track.title} position`}
            onChange={(e) => {
              setDragging(true);
              setTime(+e.target.value);
            }}
            onPointerUp={(e) => {
              audioRef.current.currentTime = +e.target.value;
              setDragging(false);
            }}
            onKeyUp={(e) => {
              audioRef.current.currentTime = +e.target.value;
              setDragging(false);
            }}
          />
          <span className={styles.time}>
            {fmt(time)}
            <span className={styles.timeTotal}> / {fmt(duration)}</span>
          </span>
        </div>
        <audio ref={audioRef} preload="metadata" src={asset(track.audio)} />
      </div>
    </article>
  );
}
