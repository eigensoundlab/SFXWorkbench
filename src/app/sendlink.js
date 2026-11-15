// SPDX-License-Identifier: Apache-2.0
/**
 * Sounds sent from other pages of this site, the pure part (no DOM, so it runs in Node tests).
 *
 * A page on the same origin, such as the Ballistic Foley Lab (https://eigensoundlab.github.io/ballistic/), opens
 * SFX Workbench in a window named "sfxworkbench" and posts
 *   { type: 'sfxworkbench:import', v: 1, id, from, group, files: [{ name, bytes, role }] }
 * with WAV or AIFF file bytes as ArrayBuffers. `group` names the library group the sounds go into (default: `from`).
 * `role` is 'mix' (the default) or 'stem': stems are the separate layers of the mix before it, and can go into the
 * layer stack. SFX Workbench answers its opener with { type: 'sfxworkbench:ready', v: 1 } when it starts, so a sender
 * whose first message arrived before the page loaded can send again, and with
 * { type: 'sfxworkbench:imported', v: 1, id, count } once the files are in the library. inbox.js reads messages from
 * this page's own origin only, so no other site can put sounds into the library.
 */

export const READY = 'sfxworkbench:ready';
export const IMPORT = 'sfxworkbench:import';
export const IMPORTED = 'sfxworkbench:imported';
export const MAX_FILES = 32;
export const MAX_BYTES = 1024 * 1024 * 1024;
export const MAX_STACK = 4;

const ID = /^[A-Za-z0-9._-]{1,160}$/;
const AUDIO = /\.(wav|wave|aif|aiff|aifc)$/i;
const text = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, n) : '');

/** A file name without folders or characters file systems refuse, ending in an audio extension, at most 120 characters. */
export function cleanName(name) {
  let n = String(name ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '').trim();
  if (!AUDIO.test(n)) n = (n || 'sound') + '.wav';
  if (n.length > 120) { const ext = n.match(AUDIO)[0]; n = n.slice(0, 120 - ext.length) + ext; }
  return n;
}

/** The import request in a message, or null when the message is anything else or out of bounds. */
export function parseImport(m) {
  if (!m || typeof m !== 'object' || m.type !== IMPORT || m.v !== 1) return null;
  if (typeof m.id !== 'string' || !ID.test(m.id) || !Array.isArray(m.files) || !m.files.length || m.files.length > MAX_FILES) return null;
  const files = [];
  let total = 0;
  for (const f of m.files) {
    if (!f || !(f.bytes instanceof ArrayBuffer) || !f.bytes.byteLength) return null;
    total += f.bytes.byteLength;
    if (total > MAX_BYTES) return null;
    files.push({ name: cleanName(f.name), bytes: f.bytes, role: f.role === 'stem' ? 'stem' : 'mix' });
  }
  const from = text(m.from, 60);
  return { id: m.id, from, group: text(m.group, 60) || from, files };
}

export const readyMessage = () => ({ type: READY, v: 1 });
export const importedMessage = (id, count) => ({ type: IMPORTED, v: 1, id, count });

const DEFAULT_LAYER = { offset: 0, gain: 0, pitch: 0, pan: 0, reverse: false, stretch: 1, polarity: 1, mute: false, solo: false };

/** Layer stack rows for a set of stems, in order, each at its own level and in place, padded to the four slots. */
export function stemLayers(ids) {
  const rows = ids.slice(0, MAX_STACK).map(src => ({ src, ...DEFAULT_LAYER }));
  while (rows.length < MAX_STACK) rows.push({ src: null, ...DEFAULT_LAYER });
  return rows;
}

/**
 * Whether received stems may replace the layer stack without asking: only when it holds nothing the user built.
 * That is every layer empty, or one of the built-in examples, or a stem received earlier that was never moved,
 * re-levelled or otherwise changed. soundOf(id) returns the library sound or null.
 */
export function stackIsFree(layers, soundOf) {
  return layers.every(L => {
    const s = L.src != null ? soundOf(L.src) : null;
    if (!s || s.origin === 'example') return true;
    return s.stemOf != null && Object.entries(DEFAULT_LAYER).every(([k, v]) => (L[k] ?? v) === v);
  });
}

/** The toast once the sounds are in. */
export function describeImport({ names, stems = 0, from = '', stacked = false }) {
  if (!names.length) return '';
  const what = names.length === 1 ? names[0] : `${names.length} sounds`;
  const head = `Received ${what}${stems ? ` and ${stems === 1 ? 'its stem' : `its ${stems} stems`}` : ''}${from ? ' from ' + from : ''}.`;
  if (!stems) return head;
  return head + (stacked ? ' The stems are in the layer stack (Combine & morph).'
    : ' Your layer stack was kept: use Layers next to the sound to load the stems.');
}
