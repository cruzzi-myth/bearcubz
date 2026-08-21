// ============================================================
// MOON RACER — DIGITAL PASSPORT
// Talks only to Supabase's public anon/publishable key. All writes
// go through the `claim_passport` RPC (SECURITY DEFINER function) —
// this file never touches the passport_members table directly for
// inserts, and only reads a row after Supabase Auth has verified
// the visitor's email (magic link), scoped by Row Level Security.
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://drsidtagxezznqviupsr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Vv_H-4keeGhwKknSz0tOlA_FNNE9YUN';
const SITE_URL = 'https://cruzzi-myth.github.io/bearcubz/';
const PASSPORT_URL = 'https://cruzzi-myth.github.io/bearcubz/passport/';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);

const screens = ['welcome', 'form', 'sent', 'success', 'welcome-back', 'verifying'];
function showScreen(name) {
  screens.forEach((s) => {
    const el = $(`screen-${s}`);
    if (el) el.classList.toggle('active', s === name);
  });
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setFormError(msg) {
  const el = $('form-error');
  if (!msg) {
    el.classList.remove('show');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.classList.add('show');
}

function setBusy(busy) {
  const btn = $('btn-submit');
  btn.disabled = busy;
  btn.classList.toggle('loading', busy);
}

// ---------- validation (mirrors the server-side rules in claim_passport) ----------
const NAME_RE = /^[A-Za-z0-9 ._'-]{2,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateName(name) {
  return NAME_RE.test(name);
}
function validateEmail(email) {
  return EMAIL_RE.test(email) && email.length <= 254;
}

// ---------- rendering (textContent only — never innerHTML — so a Racer Name
// can never inject markup into the page) ----------
function renderPassport(prefix, record) {
  $(`${prefix}-name`).textContent = record.racer_name;
  $(`${prefix}-id`).textContent = record.passport_id;
  $(`${prefix}-status`).textContent = record.founder_status;
  $(`${prefix}-tribe`).textContent = record.tribe;
  $(`${prefix}-sector`).textContent = record.sector;
  $(`${prefix}-access`).textContent = record.access_level;
  $(`${prefix}-issued`).textContent = record.issue_date;
}

let lastPassport = null;

// ---------- navigation ----------
$('btn-open-form').addEventListener('click', () => {
  setFormError('');
  showScreen('form');
  $('racer-name').focus({ preventScroll: false });
});
$('btn-back-welcome').addEventListener('click', () => showScreen('welcome'));
$('btn-back-welcome-2').addEventListener('click', () => showScreen('welcome'));

// ---------- form submit ----------
$('passport-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setFormError('');

  const nameInput = $('racer-name');
  const emailInput = $('racer-email');
  const racerName = nameInput.value.trim();
  const email = emailInput.value.trim();

  nameInput.classList.remove('invalid');
  emailInput.classList.remove('invalid');

  if (!validateName(racerName)) {
    nameInput.classList.add('invalid');
    setFormError('Racer Name must be 2–24 characters (letters, numbers, spaces, - _ . \' only).');
    return;
  }
  if (!validateEmail(email)) {
    emailInput.classList.add('invalid');
    setFormError('Enter a valid email address.');
    return;
  }

  setBusy(true);
  const { data, error } = await supabase.rpc('claim_passport', {
    p_email: email,
    p_racer_name: racerName,
  });
  setBusy(false);

  if (error) {
    const msg = error.message || '';
    if (msg.includes('EMAIL_EXISTS')) {
      await sendReturningVerification(email);
      return;
    }
    if (msg.includes('NAME_TAKEN')) {
      nameInput.classList.add('invalid');
      setFormError('That Racer Name is already claimed. Try another.');
      return;
    }
    if (msg.includes('INVALID_EMAIL')) {
      emailInput.classList.add('invalid');
      setFormError('Enter a valid email address.');
      return;
    }
    if (msg.includes('INVALID_NAME')) {
      nameInput.classList.add('invalid');
      setFormError('Racer Name must be 2–24 characters (letters, numbers, spaces, - _ . \' only).');
      return;
    }
    setFormError('Signal lost. Please try again in a moment.');
    return;
  }

  const record = Array.isArray(data) ? data[0] : data;
  if (!record) {
    setFormError('Signal lost. Please try again in a moment.');
    return;
  }
  lastPassport = record;
  renderPassport('success', record);
  showScreen('success');
});

// ---------- returning member: send a Supabase Auth magic link ----------
async function sendReturningVerification(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: PASSPORT_URL },
  });
  if (error) {
    setFormError('Could not send your verification email. Please try again.');
    return;
  }
  $('sent-email-label').textContent = email;
  showScreen('sent');
}

// ---------- returning member: after they click the magic link, Supabase
// fires a SIGNED_IN auth event. We then read *only their own* row, which
// Row Level Security scopes to the verified email in their session. ----------
let handledSession = false;

async function handleVerifiedSession(session) {
  if (!session || handledSession) return;
  handledSession = true;
  showScreen('verifying');

  const { data, error } = await supabase
    .from('passport_members')
    .select('passport_id, racer_name, founder_status, tribe, sector, access_level, issue_date')
    .maybeSingle();

  // Clean the magic-link tokens out of the URL either way.
  history.replaceState(null, '', window.location.pathname);

  if (error || !data) {
    setFormError('We verified your email, but could not find a passport. Please try registering again.');
    showScreen('welcome');
    return;
  }

  lastPassport = data;
  renderPassport('back', data);
  showScreen('welcome-back');
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    handleVerifiedSession(session);
  }
});

// If a magic-link is currently being processed in the URL, show the
// "verifying" screen immediately instead of flashing the welcome screen.
if (window.location.hash.includes('access_token') || window.location.hash.includes('type=magiclink')) {
  showScreen('verifying');
}

// ---------- Save Passport (Web Share API with a clipboard fallback) ----------
async function savePassport() {
  if (!lastPassport) return;
  const p = lastPassport;
  const text =
    `MOON RACER DIGITAL PASSPORT\n` +
    `${p.passport_id}\n` +
    `${p.racer_name}\n` +
    `${p.founder_status} · ${p.tribe}\n` +
    `Sector ${p.sector} · Access ${p.access_level}\n` +
    `Issued ${p.issue_date}\n` +
    `${SITE_URL}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Moon Racer Digital Passport', text });
      return;
    } catch (_) {
      // user cancelled the share sheet — fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Passport details copied.');
  } catch (_) {
    toast('Screenshot this screen to save your passport.');
  }
}
$('btn-save-passport').addEventListener('click', savePassport);
$('btn-save-passport-2').addEventListener('click', savePassport);

// ---------- subtle pointer-driven parallax on the ambient glow (desktop only, cheap) ----------
window.__mrParallax = (event) => {
  const glow = document.querySelector('.bg-glow');
  if (!glow) return;
  const x = (event.clientX / window.innerWidth - 0.5) * 10;
  const y = (event.clientY / window.innerHeight - 0.5) * 10;
  glow.style.transform = `translate(${x}px, ${y}px)`;
};
