import { PORTAL_HOST_CONFIG } from './portalHostConfig';

export const WELCOME_MESSAGE = `Signal established. Welcome to THE COLLECTIVE.

I'm ${PORTAL_HOST_CONFIG.displayName}, your guide through Signal Portal.

I can help you explore your collaborations, listen to demos, review proposals, and share your thoughts.

Where would you like to begin?`;

export const NO_PROJECTS_MESSAGE =
  "No collaborations are currently available to your account. Once one is authorized, I'll be able to guide you through it.";

export function projectSelectionPrompt(label: string): string {
  return `You have more than one authorized collaboration. Which one would you like to ${label}?`;
}

export function unavailableAssetMessage(what: string): string {
  return `That ${what} hasn't been uploaded yet for this collaboration. You can check back later or send a message to THE COLLECTIVE.`;
}

export const NAVIGATION_CONFIRMATIONS: Record<'listen' | 'proposal' | 'visuals' | 'respond', string> = {
  listen: 'Opening your private listening chamber.',
  proposal: 'Opening the proposal archive.',
  visuals: 'Opening the visual concept gallery.',
  respond: 'Opening the transmission chamber — I\'ll leave it ready for your message.',
};

export const ABOUT_THE_COLLECTIVE =
  'THE COLLECTIVE is the creative circle behind BEλR CUBZ and the Moon Racer universe — the people and process that turn a track into a full visual and interactive world. Signal Portal is how invited artists collaborate with us directly: your own demos, proposals, and concept art, in one place.';

/**
 * A small, deterministic keyword matcher — not a language model, and
 * not meant to understand arbitrary phrasing. Every entry only ever
 * returns pre-written, approved copy. Order matters: first match
 * wins, so more specific keywords are listed before general ones.
 */
const FAQ: { keywords: string[]; response: string }[] = [
  {
    keywords: ['collective', 'who are you', 'what is this'],
    response: ABOUT_THE_COLLECTIVE,
  },
  {
    keywords: ['moon racer', 'universe', 'game'],
    response:
      'Moon Racer is the interactive universe built around BEλR CUBZ\'s music — its own story, characters, and world. Signal Portal is separate from it: your collaboration here doesn\'t require any involvement with Moon Racer the game.',
  },
  {
    keywords: ['bpm', 'key', 'tempo', 'genre'],
    response:
      'Track metadata — BPM, key, and genre — is shown on your collaboration card on the Dashboard, and again at the top of the Listening Chamber for that project.',
  },
  {
    keywords: ['listen', 'demo', 'audio', 'play'],
    response:
      'Open the Listening Chamber from your Dashboard or ask me to take you there — demos play directly in the browser once authorized, with no downloads.',
  },
  {
    keywords: ['proposal', 'deal', 'contract', 'deck'],
    response:
      'Any proposal prepared for your collaboration is viewable in the Proposal Archive. Viewing it is just that — viewing. It\'s not an acceptance of anything, and I can\'t tell you about terms that aren\'t written in the document itself.',
  },
  {
    keywords: ['visual', 'artwork', 'cover', 'image', 'concept'],
    response: 'Concept artwork and cover options for your collaboration live in the Visual Concept Gallery, once uploaded and marked ready to view.',
  },
  {
    keywords: ['feedback', 'respond', 'message', 'reply'],
    response:
      'The Transmission Chamber is where you can send feedback on your collaboration, and see any reply from THE COLLECTIVE. Nothing is sent until you choose to send it.',
  },
  {
    keywords: ['royalt', 'payment', 'paid', 'money', 'split'],
    response:
      "I don't have information about royalties, payment terms, or splits — those are discussed directly with THE COLLECTIVE, not something I can confirm or guess at.",
  },
  {
    keywords: ['release date', 'when will', 'come out', 'drop'],
    response: "I don't have a release date to share — nothing about timing is confirmed here until THE COLLECTIVE tells you directly.",
  },
];

const UNKNOWN_FALLBACK =
  "I'm not able to answer that one — I only know about your authorized collaborations and Signal Portal itself. Try one of the actions below, or ask THE COLLECTIVE directly through the Transmission Chamber.";

export function matchFaq(input: string): string {
  const lower = input.toLowerCase();
  for (const entry of FAQ) {
    if (entry.keywords.some((k) => lower.includes(k))) return entry.response;
  }
  return UNKNOWN_FALLBACK;
}
