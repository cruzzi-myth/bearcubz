// Moon Racer: export the CANONICAL avatar IDs from the web registry (network-app) into a JSON file
// that the Unreal catalog builder consumes. Read-only on the website sources; never edit the JSON by hand.
//   node MoonRacerUE/Scripts/Tools/export_avatar_catalog.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const player = read('network-app/src/types/player.ts');
const options = read('network-app/src/data/avatarOptions.ts');
const species = read('network-app/src/data/avatarSpecies.ts');

const speciesIds = [...player.match(/AVATAR_SPECIES\s*=\s*\[([^\]]+)\]/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
if (speciesIds.length !== 6) throw new Error('expected exactly 6 canonical species, got ' + speciesIds.length);

function list(name) {
  const m = options.match(new RegExp('export const ' + name + ':[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];'));
  if (!m) throw new Error('missing ' + name);
  return [...m[1].matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)'\s*\}/g)].map((x) => ({ id: x[1], label: x[2] }));
}
const displayNames = {};
for (const id of speciesIds) {
  const m = species.match(new RegExp("\\n  " + id + ": \\{\\s*id: '" + id + "',\\s*displayName: '([^']+)'"));
  displayNames[id] = m ? m[1] : id;
}
// Canonical Human accessory / headwear option IDs (the only species with these groups today).
function humanGroup(groupId) {
  const m = species.match(new RegExp("id: '" + groupId + "', label: '[^']*', wizardStep: 'style', control: 'choice', options: \\[([\\s\\S]*?)\\] \\}"));
  if (!m) throw new Error('missing human group ' + groupId);
  return [...m[1].matchAll(/\{ id: '([^']+)', label: '([^']+)' \}/g)].map((x) => ({ id: x[1], label: x[2] })).filter((o) => o.id !== 'none');
}
const out = {
  _generated: 'by Scripts/Tools/export_avatar_catalog.mjs from network-app/src (canonical). DO NOT EDIT BY HAND.',
  schema: 1,
  species: speciesIds.map((id) => ({ id, displayName: displayNames[id] })),
  hair: list('HAIR_OPTIONS'),
  eyes: list('EYE_OPTIONS'),
  outfits: list('OUTFIT_OPTIONS'),
  signalAccents: list('ACCENT_OPTIONS'),
  humanAccessories: humanGroup('accessory'),
  humanHeadwear: humanGroup('headwear'),
};
const dest = resolve(here, '../Data/avatar_catalog.canonical.json');
writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log('wrote', dest, JSON.stringify({ species: out.species.length, hair: out.hair.length, eyes: out.eyes.length, outfits: out.outfits.length, signalAccents: out.signalAccents.length }));
