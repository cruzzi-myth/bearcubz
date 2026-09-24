"use client";
import { useRef } from "react";
import styles from "./MoonRacerOracle.module.css";
import { asset } from "./config";
import { BACKDROP } from "./content";
import { useOracleFonts, usePrefersReducedMotion } from "./hooks";
import OracleHero from "./OracleHero";
import CardPull from "./CardPull";
import DeckGallery from "./DeckGallery";
import SoundsSection from "./SoundsSection";

const CrystalBand = () => <div className={styles.crystalBand} aria-hidden="true" />;

/**
 * The full Moon Racer Oracle page body.
 * Render it between your site's header and footer, outside any max-width container,
 * so the hero and deck images can run edge to edge.
 */
export default function MoonRacerOracle() {
  useOracleFonts();
  const reduce = usePrefersReducedMotion();
  const drawRef = useRef(null);
  const deckRef = useRef(null);
  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });

  return (
    <div className={styles.root}>
      <div className={styles.siteBg} style={{ backgroundImage: `url(${asset(BACKDROP)})` }} aria-hidden="true" />
      <OracleHero onDraw={() => scrollTo(drawRef)} />
      <CrystalBand />
      <CardPull sectionRef={drawRef} onMeetDeck={() => scrollTo(deckRef)} reduce={reduce} />
      <CrystalBand />
      <DeckGallery sectionRef={deckRef} />
      <CrystalBand />
      <SoundsSection />
    </div>
  );
}
