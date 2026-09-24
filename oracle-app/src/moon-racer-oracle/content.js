// All words and media on the Moon Racer Oracle page live here.
// Edit text, add a card, or swap a track without touching the components.
// Image and audio file names are relative to ASSET_BASE (see config.js).

export const CARD_BACK = "cards/card-back.webp";

export const CARDS = [
  {
    id: "setia",
    image: "cards/setia.webp",
    name: "Setia Saint Haven",
    keys: "Remembrance · Healing",
    quote: "Even in darkness, I remember the truth of who I am.",
    guide:
      "Setia asks you to return to yourself. Whatever the day has asked of you, the part of you that knows your worth is still here.",
  },
  {
    id: "moon-racer",
    image: "cards/moon-racer.webp",
    name: "Moon Racer",
    keys: "Liberation · Movement",
    quote: "I trust myself to follow the path that makes me feel alive.",
    guide:
      "The Moon Racer arrives when it is time to move. Notice where you feel pulled forward, and take one step toward it.",
  },
  {
    id: "monk-thalen",
    image: "cards/monk-thalen.webp",
    name: "Monk Thalen",
    keys: "Inner Knowing · Wisdom",
    quote: "I listen beyond words for the truth meant for me.",
    guide:
      "Thalen invites quiet. The answer you are looking for may already be present in the stillness beneath your thoughts.",
  },
  {
    id: "lyren-vox",
    image: "cards/lyren-vox.webp",
    name: "Lyren Vox",
    keys: "Regeneration · Renewal",
    quote: "In my release I make space for new life to emerge.",
    guide:
      "Lyren speaks of letting go. What you release today becomes room for something new to grow.",
  },
  {
    id: "mythraxis",
    image: "cards/mythraxis.webp",
    name: "The Prophet of Mythraxis",
    keys: "Divine Intuition · Trust",
    quote: "I trust what I know before I understand how I know it.",
    guide:
      "The Prophet reminds you that intuition moves faster than reason. Trust the first quiet yes or no you feel.",
  },
  {
    id: "xenia",
    image: "cards/xenia.webp",
    name: "Xenia Racer Girl",
    keys: "Autonomy · Becoming",
    quote: "I am not bound by who I was programmed to be.",
    guide:
      "Xenia calls you to choose yourself. Old patterns described who you were. They do not decide who you become.",
  },
];

export const HERO = {
  image: "hero-title.webp",
  alt: "Moon Racer Oracle: three guides beneath a full moon. What was, what is, what will be.",
  tagline: ["What Was", "What Is", "What Will Be"],
  intro: "Six signals from the Moon Racer Universe. One has a message for you today.",
  cta: "Draw your card",
};

export const PULL = {
  eyebrow: "The Daily Pull",
  title: "Choose Your Card",
  ritual: ["Breathe", "Hold a question", "Choose the card that calls you"],
  hint: "Tap a card to turn it over.",
};

export const DECK = {
  image: "hero-deck.webp",
  alt: "The Moon Racer Oracle deck and box, with Xenia Racer Girl, Setia Saint Haven, Moon Racer and Lyren Vox standing in the crystal city.",
  eyebrow: "The Deck",
  title: "Meet the Guides",
  intro: "Six voices from the Moon Racer universe, each carrying a unique truth meant to find you.",
};

export const SOUNDS = {
  title: "Moon Racer Oracle",
  eyebrow: "Sounds From The Universe",
  byline: "By Setia Saint Haven",
  tracks: [
    {
      id: "breathe-you-in",
      title: "Breathe You In",
      label: "Unreleased",
      audio: "audio/breathe-you-in.mp3",
      duration: 244, // seconds, shown before the file loads
      image: "track-breathe.webp",
      alt: "Setia Saint Haven with eyes closed, breathing out a stream of opalescent light over the crystal city.",
    },
    {
      id: "endlessly",
      title: "Endlessly",
      label: "Unreleased",
      audio: "audio/endlessly.mp3",
      duration: 223,
      image: "track-endlessly.webp",
      alt: "Setia Saint Haven with arms open, circled by rings of golden light beneath a giant moon.",
    },
  ],
};

export const BACKDROP = "backdrop-city.webp";
