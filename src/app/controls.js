// SPDX-License-Identifier: Apache-2.0
/** Parameter rows (slider, select, checkbox) generated from parameter specs, plus random nudging for Mutate. */
import * as D from '../dsp/index.js';
import { h } from './dom.js';
import { fmtVal, toSlider, fromSlider, roundLog } from './format.js';

export function paramRow(sp, obj, onChange, idp) {
  const id = `${idp}-${sp.k}`;
  const row = h('div', { class: 'prm', 'data-when': sp.when || null, 'data-when-not': sp.whenNot || null });
  if (sp.type === 'select') {
    row.classList.add('prm-sel');
    const sel = h('select', { id, onchange: e => { obj[sp.k] = e.target.value; onChange(); } }, sp.opts.map(([v, t]) => h('option', { value: v, text: t })));
    sel.value = obj[sp.k];
    row.append(h('label', { for: id, text: sp.l }), sel);
  } else if (sp.type === 'bool') {
    row.classList.add('prm-bool');
    row.append(h('label', { class: 'chk' }, h('input', { type: 'checkbox', id, checked: !!obj[sp.k], onchange: e => { obj[sp.k] = e.target.checked; onChange(); } }), h('span', { text: sp.l })));
  } else {
    const out = h('output', { class: 'val', for: id, text: fmtVal(sp, obj[sp.k]) });
    const r = h('input', { type: 'range', id, min: sp.log ? 0 : sp.min, max: sp.log ? 1000 : sp.max, step: sp.log ? 1 : (sp.step ?? 1), title: 'Double-click to reset' });
    r.value = toSlider(sp, obj[sp.k]);
    r.addEventListener('input', () => { obj[sp.k] = fromSlider(sp, +r.value); out.textContent = fmtVal(sp, obj[sp.k]); onChange(); });
    r.addEventListener('dblclick', () => { obj[sp.k] = sp.d; r.value = toSlider(sp, sp.d); out.textContent = fmtVal(sp, sp.d); onChange(); });
    row.append(h('label', { for: id, text: sp.l }), r, out);
  }
  return row;
}
export function syncWhen(root, obj) {
  root.querySelectorAll('[data-when],[data-when-not]').forEach(r => {
    const on = r.dataset.when ? !!obj[r.dataset.when] : !obj[r.dataset.whenNot];
    r.classList.toggle('is-dim', !on);
    r.querySelectorAll('input,select').forEach(i => { i.disabled = !on; });
  });
}
export function nudge(sp, v, amt) {
  if (sp.type || sp.k === 'seed') return v;
  let nv;
  if (sp.log) { const t = Math.log(v / sp.min) / Math.log(sp.max / sp.min) + (Math.random() * 2 - 1) * amt; nv = roundLog(sp.min * Math.pow(sp.max / sp.min, D.clamp(t, 0, 1))); }
  else { const st = sp.step || 1, span = Math.max(Math.abs(v), (sp.max - sp.min) * 0.05); nv = D.clamp(v + (Math.random() * 2 - 1) * amt * span, sp.min, sp.max); nv = Math.round(nv / st) * st; nv = +nv.toFixed(3); }
  return nv;
}
