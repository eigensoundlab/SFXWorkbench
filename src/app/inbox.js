// SPDX-License-Identifier: Apache-2.0
/** Sounds sent from other pages of this site, such as the Ballistic Foley Lab. The messages are described in sendlink.js. */
import { toast } from './dom.js';
import { importFiles } from './files.js';
import { parseImport, readyMessage, importedMessage, describeImport } from './sendlink.js';

const done = new Set();   // ids already imported: a sender that resends after "ready" gets an answer, not a second copy

export function initInbox() {
  window.addEventListener('message', async e => {
    if (e.origin !== location.origin || !e.source) return;
    const m = parseImport(e.data);
    if (!m) return;
    const reply = count => { try { e.source.postMessage(importedMessage(m.id, count), location.origin); } catch (err) { /* sender closed */ } };
    if (done.has(m.id)) { reply(0); return; }
    done.add(m.id);
    const made = (await importFiles(m.files.map(f => new File([f.bytes], f.name, { type: 'audio/wav' })))).filter(Boolean);
    if (made.length) toast(describeImport(made.map(s => s.name), m.from));
    reply(made.length);
  });
  if (window.opener) {
    try { window.opener.postMessage(readyMessage(), location.origin); } catch (err) { /* opener gone or elsewhere */ }
  }
}
