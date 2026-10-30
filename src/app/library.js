// SPDX-License-Identifier: Apache-2.0
/** Library list: render, add, select and remove sounds. */
import * as D from '../dsp/index.js';
import { $, h, playIcon, toast } from './dom.js';
import { S, newSound } from './state.js';
import { importFiles } from './files.js';
import { khz, chLabel } from './format.js';
import { play, stop } from './audio.js';
import { renderDeck } from './deck.js';
import { renderMix } from './panels/combine.js';
import { updateSliceInfo } from './panels/slice.js';
import { scheduleRender } from './output.js';
import { refreshAccents } from './panels/accents.js';

export function metaShort(s) { return `${khz(s.sr)} kHz · ${s.isFloat ? '32f' : s.bits} · ${chLabel(s.ch.length)} · ${(D.len(s.ch) / s.sr).toFixed(2)} s`; }
export function renderLibrary() {
  $('#lib-count').textContent = S.sounds.length + (S.sounds.length === 1 ? ' sound' : ' sounds');
  $('#lib-list').replaceChildren(...S.sounds.map(s => h('li', { class: 'lib-item' + (s.id === S.selId ? ' is-sel' : '') },
    h('button', { class: 'icon-btn play', type: 'button', title: 'Play', 'aria-label': 'Play ' + s.name, onclick: () => play(s, 0, null, s.id === S.selId ? 'src' : 'lib') }, playIcon()),
    h('button', { class: 'lib-main', type: 'button', 'aria-current': s.id === S.selId ? 'true' : null, onclick: () => select(s.id) },
      h('span', { class: 'lib-name' }, s.name, s.origin === 'example' ? h('span', { class: 'tag', text: 'example' }) : null),
      h('span', { class: 'lib-meta', text: metaShort(s) })),
    h('button', { class: 'lib-del', type: 'button', title: 'Remove from library', 'aria-label': 'Remove ' + s.name, onclick: () => removeSound(s.id) }, '×'))));
}
export function addSound(s, opts = {}) {
  S.sounds.push(s);
  if (opts.select) select(s.id); else { renderLibrary(); renderMix(); }
  return s;
}
export function select(id) {
  stop(false);
  S.selId = id; S.sel = null; S.cursor = 0;
  renderLibrary(); renderDeck(); renderMix(); updateSliceInfo(); scheduleRender(); refreshAccents();
}
export function removeSound(id) {
  const i = S.sounds.findIndex(s => s.id === id); if (i < 0) return;
  const [gone] = S.sounds.splice(i, 1);
  if (S.selId === id) { const next = S.sounds[Math.min(i, S.sounds.length - 1)]; S.selId = next ? next.id : null; S.sel = null; S.cursor = 0; S.out = null; renderDeck(); scheduleRender(); }
  if (S.A === id) S.A = null;
  if (S.B === id) S.B = null;
  S.layers.forEach(l => { if (l.src === id) l.src = null; });
  renderLibrary(); renderMix();
  toast(`Removed ${gone.name}`);
}

/** Wire importing (file picker and drag-and-drop anywhere on the page) and the Basics menu. */
export function initLibrary() {
  $('#file-in').addEventListener('change', e => { importFiles([...e.target.files]); e.target.value = ''; });
  $('#gen-sel').addEventListener('change', e => {
    const k = e.target.value; e.target.value = ''; if (!k) return;
    const label = { subdrop: 'sub_drop', noise: 'noise_burst', sweep: 'sine_sweep', click: 'click' }[k];
    addSound(newSound(label, 48000, D.synth[k](48000), 24, false, 'generated'), { select: true });
  });
  let depth = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; document.body.classList.add('is-drop'); } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('is-drop'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); depth = 0; document.body.classList.remove('is-drop');
    if (e.dataTransfer && e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]);
  });
}
