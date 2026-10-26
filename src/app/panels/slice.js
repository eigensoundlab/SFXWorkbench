// SPDX-License-Identifier: Apache-2.0
/** Slice & loop tab: split takes at silences, and build seamless loops plus start/loop/stop sets. Both use the source without the effect chain. */
import * as D from '../../dsp/index.js';
import { $, h, playIcon, toast } from '../dom.js';
import { S, cur, newSound } from '../state.js';
import { fmtDur, safeName } from '../format.js';
import { SLICE_SPEC, LOOP_SPEC } from '../../config/tools.js';
import { paramRow } from '../controls.js';
import { play } from '../audio.js';
import { finish } from '../finish.js';
import { drawSrc } from '../draw.js';
import { addSound, renderLibrary } from '../library.js';
import { renderMix } from './combine.js';
import { saveSound, saveZip } from '../files.js';

export function updateSliceInfo() {
  const s = cur(), info = $('#sl-info'), list = $('#sl-list');
  const valid = S.slices && s && S.slices.key === s.id + ':' + s.ver;
  if (!valid) { info.textContent = s ? 'Press "Find takes" to split the selected sound.' : ''; list.replaceChildren(); drawSrc(); return; }
  const L = S.slices.list;
  info.textContent = L.length ? `${L.length} take${L.length === 1 ? '' : 's'} found, marked on the source waveform.` : 'No takes found. Lower the threshold or the minimum silence.';
  list.replaceChildren(...L.map((r, i) => h('li', {},
    h('button', { class: 'icon-btn play', type: 'button', title: 'Play take ' + (i + 1), 'aria-label': 'Play take ' + (i + 1), onclick: () => play(s, r.a, r.b, 'src') }, playIcon()),
    `${String(i + 1).padStart(2, '0')} · ${((r.b - r.a) / s.sr).toFixed(2)} s`)));
  drawSrc();
}
export function sliceItems() {
  const s = cur(); if (!s || !S.slices || S.slices.key !== s.id + ':' + s.ver) return null;
  return S.slices.list.map((r, i) => {
    const raw = D.extract(s.ch, r.a, r.b, S.sp.fade, s.sr);
    return { name: `${safeName(s.name)}_${String(i + 1).padStart(2, '0')}`, sr: s.sr, ch: finish(raw, s.sr).ch, bits: s.bits, isFloat: s.isFloat };
  });
}
export function loopRegion() {
  const s = cur(); if (!s) return null;
  const n = D.len(s.ch);
  let a = S.sel ? S.sel.a : 0, b = S.sel ? S.sel.b : n;
  if (S.lp.snap) { const m = D.monoMix(s.ch), r = Math.round(0.005 * s.sr); a = D.zeroSnap(m, a, r); b = D.zeroSnap(m, b, r); }
  if (b - a < Math.round(0.02 * s.sr)) return null;
  return { s, a, b, n };
}
export function buildLoop() {
  const R = loopRegion(); if (!R) { toast('Select at least 20 ms to loop.'); return null; }
  const { s, a, b } = R;
  const whole = finish(s.ch, s.sr, { loop: true }).ch;
  const L = D.makeLoop(whole, a, b, S.lp.xf * s.sr / 1000, S.lp.shape);
  const how = { pre: 'crossfaded with the audio before the loop', post: 'crossfaded with the audio after the loop', internal: 'crossfaded into itself, so it is a little shorter', none: 'too short to crossfade' }[L.method];
  $('#lp-info').textContent = `Loop ${fmtDur(D.len(L.ch) / s.sr)} s, ${how}.`;
  return { s, a, b, whole, loop: { name: safeName(s.name) + '_loop', sr: s.sr, ch: L.ch, bits: s.bits, isFloat: s.isFloat } };
}

/** Wire the take splitter and the loop tool. */
export function initSlice() {
  $('#slice-params').replaceChildren(...SLICE_SPEC.map(sp => paramRow(sp, S.sp, () => {}, 'sl')));
  $('#loop-params').replaceChildren(...LOOP_SPEC.map(sp => paramRow(sp, S.lp, () => {}, 'lp')));
  $('#sl-detect').onclick = () => {
    const s = cur(); if (!s) return toast('Select a sound first.');
    S.slices = { key: s.id + ':' + s.ver, list: D.detectSlices(s.ch, s.sr, S.sp) };
    updateSliceInfo();
  };
  $('#sl-lib').onclick = () => {
    const items = sliceItems(); if (!items || !items.length) return toast('Find takes first.');
    items.forEach(it => S.sounds.push(newSound(it.name, it.sr, it.ch, it.bits, it.isFloat, 'render'))); renderLibrary(); renderMix();
    toast(`Added ${items.length} takes to the library`);
  };
  $('#sl-save').onclick = () => { const items = sliceItems(); if (!items || !items.length) return toast('Find takes first.'); saveZip(cur().name + '_takes', items); };
  $('#lp-play').onclick = () => { const L = buildLoop(); if (L) { play(L.loop, 0, null, 'loop', true); toast('Looping. Press Stop or Esc to end.'); } };
  $('#lp-lib').onclick = () => { const L = buildLoop(); if (L) { addSound(newSound(L.loop.name, L.loop.sr, L.loop.ch, L.loop.bits, L.loop.isFloat, 'render')); toast(`Added ${L.loop.name} to the library`); } };
  $('#lp-save').onclick = () => { const L = buildLoop(); if (L) saveSound(L.loop, L.loop, L.loop.name); };
  $('#lp-set').onclick = () => {
    const L = buildLoop(); if (!L) return;
    const { s, a, b, whole } = L, n = D.len(whole), base = safeName(s.name), items = [];
    if (a > Math.round(0.005 * s.sr)) items.push({ name: base + '_start', sr: s.sr, ch: whole.map(c => c.slice(0, a)), bits: s.bits, isFloat: s.isFloat });
    items.push(L.loop);
    if (n - b > Math.round(0.005 * s.sr)) items.push({ name: base + '_stop', sr: s.sr, ch: D.extract(whole, b, n, 5, s.sr), bits: s.bits, isFloat: s.isFloat });
    if (items.length === 1) toast('No audio before or after the selection, so only the loop is included.');
    saveZip(base + '_start_loop_stop', items);
  };
}
