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
import { refreshAccents, renderRefOptions } from './panels/accents.js';
import { buildDemoSet, DEMO_LAYERS } from './demoset.js';

export function metaShort(s) { return `${khz(s.sr)} kHz · ${s.isFloat ? '32f' : s.bits} · ${chLabel(s.ch.length)} · ${(D.len(s.ch) / s.sr).toFixed(2)} s`; }
export function renderLibrary() {
  renderRefOptions();
  $('#lib-count').textContent = S.sounds.length + (S.sounds.length === 1 ? ' sound' : ' sounds');
  $('#lib-list').replaceChildren(...S.sounds.map(s => h('li', { class: 'lib-item' + (s.id === S.selId ? ' is-sel' : '') },
    h('button', { class: 'icon-btn play', type: 'button', title: 'Play', 'aria-label': 'Play ' + s.name, onclick: () => play(s, 0, null, s.id === S.selId ? 'src' : 'lib') }, playIcon()),
    h('button', { class: 'lib-main', type: 'button', 'aria-current': s.id === S.selId ? 'true' : null, onclick: () => select(s.id) },
      h('span', { class: 'lib-name' }, s.name, s.origin === 'example' || s.origin === 'demo' || s.origin === 'kurator' ? h('span', { class: 'tag', text: s.origin }) : null),
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
  $('#ph-demo').addEventListener('click', addDemoSet);
  let depth = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; document.body.classList.add('is-drop'); } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('is-drop'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); depth = 0; document.body.classList.remove('is-drop');
    if (e.dataTransfer && e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]);
  });
}

/** The Playhead demo set (demoset.js) into the library: the finished sounds, and the impact's layers as the layer
 *  stack in their punchy arrangement. */
async function addDemoSet() {
  const btn = $('#ph-demo'), sr = 48000;
  btn.disabled = true;
  try {
    const ex = Object.fromEntries(['gunshot', 'metal', 'footstep', 'servo'].map(k => [k, D.synth[k](sr)]));
    const r = await buildDemoSet(ex, sr, step => toast(step + '…'));
    let first = null;
    for (const s of r.sounds) { const snd = newSound(s.name, sr, s.ch, 24, false, 'demo'); addSound(snd); if (!first) first = snd; }
    const ids = {};
    for (const L of DEMO_LAYERS) { const snd = newSound('impact layer: ' + L.role, sr, r.sources[L.name], 24, false, 'demo'); addSound(snd); ids[L.name] = snd.id; }
    const layer = (src, offset, gain) => ({ src, offset, gain, pitch: 0, pan: 0, reverse: false, stretch: 1, polarity: 1, mute: false, solo: false });
    S.layers = r.layers.map(L => layer(ids[L.name], L.offset, L.gain));
    while (S.layers.length < 4) S.layers.push(layer(null, 0, 0));
    if (first) select(first.id);
    renderMix();
    toast('Playhead demo set added: ' + r.sounds.length + ' sounds, and the impact\'s layers in the layer stack, arranged for punch.');
  } catch (e) {
    console.error(e);
    toast('The demo set could not be made: ' + (e && e.message || e), 'err');
  } finally { btn.disabled = false; }
}
