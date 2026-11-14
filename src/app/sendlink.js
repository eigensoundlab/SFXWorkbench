// SPDX-License-Identifier: Apache-2.0
/**
 * Sounds sent from other pages of this site, the pure part (no DOM, so it runs in Node tests).
 *
 * A page on the same origin, such as the Ballistic Foley Lab (https://eigensoundlab.github.io/ballistic/), opens
 * SFX Workbench in a window named "sfxworkbench" and posts
 *   { type: 'sfxworkbench:import', v: 1, id, from, files: [{ name, bytes }] }
 * with WAV or AIFF file bytes as ArrayBuffers. SFX Workbench answers its opener with { type: 'sfxworkbench:ready', v: 1 }
 * when it starts, so a sender whose first message arrived before the page loaded can send again, and with
 * { type: 'sfxworkbench:imported', v: 1, id, count } once the files are in the library. inbox.js reads messages from this
 * page's own origin only, so no other site can put sounds into the library.
 */

export const READY = 'sfxworkbench:ready';
export const IMPORT = 'sfxworkbench:import';
export const IMPORTED = 'sfxworkbench:imported';
export const MAX_FILES = 32;
export const MAX_BYTES = 1024 * 1024 * 1024;

const ID = /^[A-Za-z0-9._-]{1,160}$/;
const AUDIO = /\.(wav|wave|aif|aiff|aifc)$/i;

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
    files.push({ name: cleanName(f.name), bytes: f.bytes });
  }
  const from = typeof m.from === 'string' ? m.from.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) : '';
  return { id: m.id, from, files };
}

export const readyMessage = () => ({ type: READY, v: 1 });
export const importedMessage = (id, count) => ({ type: IMPORTED, v: 1, id, count });

/** One line for the toast once the sounds are in: "Received <name> from Ballistic Foley Lab". */
export function describeImport(names, from) {
  if (!names.length) return '';
  const what = names.length === 1 ? names[0] : `${names.length} sounds`;
  return `Received ${what}${from ? ' from ' + from : ''}`;
}
