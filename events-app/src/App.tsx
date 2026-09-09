import { useEffect, useState } from 'react';
import yachtHero from '../../assets/events/yacht-hero-clean.webp';
import carePackage from '../../assets/events/care-package-clean.webp';
import archivePoster from '../../assets/events/transmission-003-complete.webp';
import neonNexusPortrait from '../../assets/events/neon-nexus-portrait.webp';
import neonNexusWide from '../../assets/events/neon-nexus-wide.webp';

const ROOT = '/bearcubz/';
const links = {
  home: ROOT,
  music: `${ROOT}#music`,
  people: `${ROOT}#about`,
  art: `${ROOT}#gallery`,
  merch: `${ROOT}#merch`,
  passport: `${ROOT}passport/`,
  instagram: 'https://www.instagram.com/bearcubzmusic/',
  spotify: 'https://open.spotify.com/artist/7wywlCfgO9T0cqiGe1Q6fV',
  youtube: 'https://www.youtube.com/@bearcubzmusic',
  tiktok: 'https://www.tiktok.com/@bearcubzmusic',
};

type Modal = 'poster' | 'visuals' | 'nexus' | null;

function Crown({ small = false }: { small?: boolean }) {
  return <svg className={small ? 'crown crown--small' : 'crown'} viewBox="0 0 120 72" aria-hidden="true"><path d="M8 57 18 12l30 28L60 7l12 33 30-28 10 45H8Z"/><path d="m18 12 42 45 42-45M48 40l12 17 12-17M8 57h104"/></svg>;
}

function SignalBars() {
  return <div className="signal-bars" aria-label="Signal strength 100 percent">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties}/>)}</div>;
}

const actions = [
  { icon: '◉', title: 'Full album', subtitle: 'A complete listening experience', href: links.music },
  { icon: '△', title: 'Cyberpunk visuals', subtitle: 'Enter the visual archive', modal: 'visuals' as const },
  { icon: '◇', title: 'Exclusive drops', subtitle: 'Merch and collectibles', href: links.merch },
  { icon: '✦', title: 'Signal rewards', subtitle: 'Giveaways and digital passports', href: links.passport },
];

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  useEffect(() => {
    if (!modal) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setModal(null);
    document.body.classList.add('modal-open');
    window.addEventListener('keydown', close);
    return () => { document.body.classList.remove('modal-open'); window.removeEventListener('keydown', close); };
  }, [modal]);

  return <main>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-nav">
      <a className="wordmark" href={links.home} aria-label="Moon Racer homepage"><Crown small/><span>MOON RACER</span></a>
      <nav className={menuOpen ? 'nav-links is-open' : 'nav-links'} aria-label="Main navigation">
        <a href={links.music}>Music</a><a href={links.people}>People</a><a href={links.art}>Art</a><a href={links.home}>A Higher Tomorrow</a>
      </nav>
      <span className="online"><i/>Signal online</span>
      <a className="outline-button nav-cta" href="#next-transmission">Next transmission</a>
      <button className="menu-button" type="button" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><span/><span/><span/></button>
    </header>

    <section className="hero" id="main-content">
      <img src={yachtHero} alt="Moon Racer and Racer Girl approaching a neon-lit yacht club gathering in Marina del Rey" width="1672" height="941"/>
      <div className="hero-overlay"/><div className="tech-grid" aria-hidden="true"/>
      <div className="hero-content">
        <p className="eyebrow">Bear Cubz presents</p>
        <div className="transmission-label">Transmission <b>003</b></div>
        <h1>The transmission<br/>was received.</h1>
        <p className="cyan-lead">A care package on a yacht!?</p>
        <p className="intro">Music. People. Art. A higher tomorrow.<br/>More than music—a movement in real life.</p>
        <div className="strength"><span>Signal strength</span><SignalBars/><b>100%</b></div>
        <div className="button-row"><a className="primary-button" href="#next-transmission">Follow the signal <span>→</span></a><button className="outline-button" type="button" onClick={() => setModal('poster')}>▶ View transmission</button></div>
      </div>
    </section>

    <section className="archive" id="archive">
      <div className="section-rail"><b>01 / Archived transmission</b><i/><span>One album. One night. One beginning.</span></div>
      <div className="archive-grid">
        <button className="poster-frame" type="button" onClick={() => setModal('poster')} aria-label="Open Transmission 003 poster"><img src={archivePoster} alt="Transmission 003: The First Signal Was Received at Marina del Rey Yacht Club" width="1024" height="1536" loading="lazy"/><span>Open archive ↗</span></button>
        <div className="archive-copy">
          <p className="eyebrow">Marina del Rey Yacht Club</p>
          <h2>The first signal<br/>became <em>real.</em></h2>
          <p>Transmission 003 brought the Moon Racers together at the water. Music, cinematic visuals, exclusive artifacts and the Original Tribe turned the signal into a night we’ll never forget.</p>
          <div className="data-grid"><div><b>003</b><span>Transmission</span></div><div><b>Complete</b><span>Status</span></div><div><b>Received</b><span>Signal</span></div></div>
          <div className="action-list">
            {actions.map(action => action.href ? <a key={action.title} href={action.href}><i>{action.icon}</i><span><b>{action.title}</b><small>{action.subtitle}</small></span><strong>›</strong></a> : <button key={action.title} type="button" onClick={() => setModal(action.modal!)}><i>{action.icon}</i><span><b>{action.title}</b><small>{action.subtitle}</small></span><strong>›</strong></button>)}
          </div>
        </div>
      </div>
    </section>

    <section className="nexus" id="future-events">
      <div className="section-rail"><b>02 / Incoming transmission</b><i/><span>Music × fashion × culture × community</span></div>
      <div className="nexus-grid">
        <article className="nexus-feature">
          <img src={neonNexusWide} alt="Neon Nexus concept art for an upcoming cyberpunk live-event campaign" width="1536" height="1024" loading="lazy"/>
          <div className="nexus-shade"/>
          <div className="nexus-copy">
            <p className="eyebrow">Future live cyberpunk event series</p>
            <div className="incoming-badge"><i/> Signal detected</div>
            <h2>Neon<br/><em>Nexus</em></h2>
            <p>A collision of live music, future fashion, immersive art and a community built differently. Dress, create and become someone else.</p>
            <div className="nexus-tags"><span>Music</span><span>Fashion</span><span>Art</span><span>Culture</span></div>
            <div className="button-row"><button className="primary-button" type="button" onClick={() => setModal('nexus')}>Explore transmission <span>↗</span></button><a className="outline-button" href={links.instagram} target="_blank" rel="noopener noreferrer">Follow for updates</a></div>
          </div>
          <div className="upcoming-stamp"><small>Status</small><b>Upcoming</b></div>
        </article>
        <button className="nexus-poster" type="button" onClick={() => setModal('nexus')} aria-label="Open the Neon Nexus future event campaign">
          <img src={neonNexusPortrait} alt="Neon Nexus upcoming cyberpunk music, fashion and culture event poster" width="1024" height="1536" loading="lazy"/>
          <span>Open future-event dossier ↗</span>
        </button>
      </div>
      <p className="nexus-note">Concept campaign · Venue and event details will be announced when the next transmission is confirmed.</p>
    </section>

    <section className="next" id="next-transmission">
      <div className="section-rail"><b>03 / Unidentified delivery</b><i/><span>The next chapter is already in motion.</span></div>
      <article className="next-panel">
        <img src={carePackage} alt="Moon Racer care package with apparel, album, collectibles and mystery drops aboard a yacht" width="1672" height="941" loading="lazy"/>
        <div className="next-overlay"/><div className="scan" aria-hidden="true"/>
        <div className="next-copy"><p className="eyebrow">Future live cyberpunk events</p><h2>What will the<br/>signal drop next?</h2><p>New music. New worlds. New experiences.<br/>The Moon Racer universe always has another transmission incoming.</p><div className="button-row"><a className="primary-button" href={links.instagram} target="_blank" rel="noopener noreferrer">Stay tuned @BEARCUBZMUSIC <span>↗</span></a><a className="outline-button" href={links.passport}>Claim your Passport</a></div></div>
        <div className="classified"><small>Next drop</small><b>Classified</b></div>
      </article>
    </section>

    <footer><Crown/><p>The signal connects us all.</p><div className="socials"><a href={links.instagram} target="_blank" rel="noopener noreferrer">Instagram</a><a href={links.spotify} target="_blank" rel="noopener noreferrer">Spotify</a><a href={links.youtube} target="_blank" rel="noopener noreferrer">YouTube</a><a href={links.tiktok} target="_blank" rel="noopener noreferrer">TikTok</a></div><a className="back-home" href={links.home}>← Return to BEAR CUBZ</a></footer>

    {modal && <div className="modal" role="dialog" aria-modal="true" aria-label={modal === 'poster' ? 'Transmission 003 poster' : modal === 'nexus' ? 'Neon Nexus future event campaign' : 'Cyberpunk visual archive'} onMouseDown={event => event.target === event.currentTarget && setModal(null)}><button className="modal-close" type="button" onClick={() => setModal(null)} aria-label="Close">×</button>{modal === 'poster' ? <img src={archivePoster} alt="Full Transmission 003 event poster"/> : modal === 'nexus' ? <div className="nexus-modal"><img className="nexus-modal-wide" src={neonNexusWide} alt="Neon Nexus upcoming cyberpunk event campaign — wide concept art"/><img className="nexus-modal-portrait" src={neonNexusPortrait} alt="Neon Nexus future event poster"/></div> : <div className="visual-modal"><div><img src={yachtHero} alt="Moon Racer yacht club event"/><span>Arrival // Marina del Rey</span></div><div><img src={carePackage} alt="Moon Racer care package aboard a yacht"/><span>Signal drop // Contents unknown</span></div></div>}</div>}
  </main>;
}

export default App;
