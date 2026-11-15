// SPDX-License-Identifier: Apache-2.0
/** Sounds sent from other pages of this site, such as the Ballistic Foley Lab. The messages are described in sendlink.js. */
import { toast } from './dom.js';
import { importFiles } from './files.js';
import { S, byId } from './state.js';
import { select, renderLibrary } from './library.js';
import { renderMix } from './panels/combine.js';
import { parseImport, readyMessage, importedMessage, describeImport, stackIsFree, stemLayers } from './sendlink.js';

const done = new Set();   // ids already imported: a sender that resends after "ready" gets an answer, not a second copy

export function initInbox() {
  window.addEventListener('message', async e => {
    if (e.origin !== location.origin || !e.source) return;
    const m = parseImport(e.data);
    if (!m) return;
    const reply = count => { try { e.source.postMessage(importedMessage(m.id, count), location.origin); } catch (err) { /* sender closed */ } };
    if (done.has(m.id)) { reply(0); return; }
    done.add(m.id);
    const made = await importFiles(m.files.map(f => new File([f.bytes], f.name, { type: 'audio/wav' })));
    const mixes = [], stems = [];
    made.forEach((s, i) => {
      if (!s) return;
      if (m.group) s.group = m.group;
      (m.files[i].role === 'stem' ? stems : mixes).push(s);
    });
    // the stems belong to the mix they came with: it gets a Layers button that loads them into the stack
    const mix = mixes[0] || null;
    if (mix && stems.length) { mix.stems = stems.map(s => s.id); stems.forEach(s => { s.stemOf = mix.id; }); }
    const stacked = stems.length > 0 && stackIsFree(S.layers, byId);
    if (stacked) S.layers = stemLayers(stems.map(s => s.id));
    if (mix) select(mix.id); else renderLibrary();
    renderMix();
    if (mixes.length || stems.length) toast(describeImport({ names: (mixes.length ? mixes : stems).map(s => s.name), stems: mixes.length ? stems.length : 0, from: m.from, stacked }));
    reply(mixes.length + stems.length);
  });
  if (window.opener) {
    try { window.opener.postMessage(readyMessage(), location.origin); } catch (err) { /* opener gone or elsewhere */ }
  }
}
