// SPDX-License-Identifier: Apache-2.0
/** Combine & morph tab: layer stack and the two-sound morph modes. */
import * as D from '../../dsp/index.js';
import { $, h, toast } from '../dom.js';
import { S, byId, newSound } from '../state.js';
import { fmtDur } from '../format.js';
import { MIX, LAYER_SPEC } from '../../config/tools.js';
import { paramRow } from '../controls.js';
import { play } from '../audio.js';
import { addSound } from '../library.js';

export function soundOptions(allowNone) {
  const opts = S.sounds.map(s => h('option', { value: String(s.id), text: s.name }));
  if (allowNone) opts.unshift(h('option', { value: '', text: '— none —' }));
  return opts;
}
export function renderMix() {
  const chips = $('#mode-chips');
  chips.replaceChildren(...Object.entries(MIX).map(([k, m]) => h('button', { class: 'mode', type: 'button', role: 'radio', 'aria-checked': S.mode === k ? 'true' : 'false', onclick: () => { S.mode = k; renderMix(); } }, m.name)));
  const m = MIX[S.mode];
  $('#mode-desc').replaceChildren(m.desc + ' ', m.tryIt ? h('em', { text: m.tryIt }) : '');
  const body = $('#mix-body');
  if (!byId(S.A)) S.A = S.sounds[0] ? S.sounds[0].id : null;
  if (!byId(S.B)) S.B = S.sounds[1] ? S.sounds[1].id : S.A;
  if (S.mode === 'layer') {
    body.replaceChildren(h('div', { class: 'layers' }, S.layers.map((L, i) => {
      const sel = h('select', { id: `ly${i}-src`, 'aria-label': `Layer ${i + 1} sound`, onchange: e => { L.src = e.target.value ? +e.target.value : null; } }, soundOptions(true));
      sel.value = L.src && byId(L.src) ? String(L.src) : '';
      return h('div', { class: 'panel layer' },
        h('span', { class: 'ab-key layer-idx', text: String(i + 1) }),
        h('div', { class: 'src-cell' }, sel),
        LAYER_SPEC.map(sp => paramRow(sp, L, () => {}, `ly${i}`)),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: `ly${i}-rev`, checked: L.reverse, onchange: e => { L.reverse = e.target.checked; } }), h('span', { text: 'Reverse' })));
    }), h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'ly-norm', checked: S.layerNorm, onchange: e => { S.layerNorm = e.target.checked; } }), h('span', { text: 'Normalize the bounce to −1 dBFS' }))));
    return;
  }
  const mk = (key, label) => {
    const sel = h('select', { id: 'mix-' + key, 'aria-label': 'Sound ' + label, onchange: e => { S[key] = +e.target.value; } }, soundOptions(false));
    sel.value = S[key] ? String(S[key]) : '';
    return h('div', { class: 'ab-row' }, h('span', { class: 'ab-key', text: label }), sel);
  };
  const params = S.mp[S.mode];
  const pbox = h('div', { class: 'panel mix-params' }, m.params.map(sp => paramRow(sp, params, () => {}, 'mx-' + S.mode)));
  body.replaceChildren(h('div', { class: 'mix-layout' },
    h('div', { class: 'panel ab' }, h('h2', { text: 'Sources' }), mk('A', 'A'), mk('B', 'B'),
      h('button', { class: 'btn small', type: 'button', onclick: () => { [S.A, S.B] = [S.B, S.A]; renderMix(); } }, 'Swap A and B'),
      h('p', { class: 'hint', text: 'The result uses A\'s sample rate, channel count and bit depth.' })),
    pbox));
}
export function renderMixResult() {
  const status = $('#mix-status');
  try {
    let res, name, meta;
    if (S.mode === 'layer') {
      const ls = S.layers.filter(l => l.src && byId(l.src));
      if (!ls.length) throw new Error('Pick a sound for at least one layer.');
      meta = byId(ls[0].src);
      const ch = D.layerMix(ls.map(l => { const s = byId(l.src); return { ch: s.ch, sr: s.sr, offset: l.offset, gain: l.gain, pitch: l.pitch, reverse: l.reverse, pan: l.pan / 100 }; }), meta.sr);
      res = { sr: meta.sr, ch: S.layerNorm ? D.matchPeak(ch, D.dbToLin(-1)) : ch };
      name = ls.map(l => byId(l.src).name).slice(0, 3).join('+') + '_layered';
    } else {
      const A = byId(S.A), B = byId(S.B);
      if (!A || !B) throw new Error('Choose sounds for A and B.');
      meta = A;
      let bch = B.sr !== A.sr ? D.resample(B.ch, B.sr, A.sr) : B.ch;
      bch = D.mapChannels(bch, A.ch.length);
      res = { sr: A.sr, ch: D.MORPH[S.mode](A.ch, bch, A.sr, S.mp[S.mode]) };
      name = `${A.name}_${MIX[S.mode].short}_${B.name}`.slice(0, 60);
    }
    if (!D.len(res.ch)) throw new Error('The result is empty.');
    const snd = addSound(newSound(name, res.sr, res.ch, meta.bits, meta.isFloat, 'render'), { select: true });
    status.textContent = `Added ${snd.name} (${fmtDur(D.len(res.ch) / res.sr)} s) and selected it.`;
    play(snd, 0, null, 'src');
  } catch (e) {
    console.error(e); status.textContent = ''; toast(e.message || String(e), 'err');
  }
}

/** Wire the render button (deferred a tick so the status text paints first). */
export function initCombine() {
  $('#btn-render-mix').onclick = () => { $('#mix-status').textContent = 'Rendering…'; setTimeout(renderMixResult, 30); };
}
