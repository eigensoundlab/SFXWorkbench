// SPDX-License-Identifier: Apache-2.0
/** Variations tab: seeded random pitch, length, volume, tone, offset and reverse per file, with a naming pattern. */
import * as D from '../../dsp/index.js';
import { $, h, playIcon, toast } from '../dom.js';
import { S, cur, newSound } from '../state.js';
import { fmtVal, fmtDur, safeName, sgn } from '../format.js';
import { VAR_SPEC } from '../../config/tools.js';
import { paramRow } from '../controls.js';
import { play } from '../audio.js';
import { finish } from '../finish.js';
import { ensureOut } from '../output.js';
import { addSound, renderLibrary } from '../library.js';
import { renderMix } from './combine.js';
import { activeSlots, hasAccents, accentReference } from './accents.js';
import { saveSound, saveZip } from '../files.js';

export function renderVarParams() {
  const box = $('#var-params');
  const nameIn = h('input', { type: 'text', id: 'var-pattern', value: S.vname, spellcheck: 'false', onchange: e => { S.vname = e.target.value || '{name}_var{nn}'; } });
  box.replaceChildren(h('h2', { text: 'Randomize per file' }), ...VAR_SPEC.map(sp => paramRow(sp, S.vp, () => {}, 'var')),
    h('div', { class: 'var-name-row' }, h('label', { for: 'var-pattern', text: 'File names' }), nameIn),
    h('p', { class: 'hint', text: 'Use {name}, {nn} (01, 02…) and {n} in file names. The same seed always gives the same set. A loudness target in Finishing evens out the volume variation.' }));
}
export function varName(base, i) { return (S.vname || '{name}_var{nn}').replace(/\{name\}/g, base).replace(/\{nn\}/g, String(i + 1).padStart(2, '0')).replace(/\{n\}/g, String(i + 1)); }
export function generateVariations() {
  const s = cur(); if (!s) return toast('Select a sound first.');
  const out = ensureOut();
  if (S.vp.chain && S.chainOn && out && out.err) return toast('The effect chain has an error. Fix it or untick "Run the effect chain".', 'err');
  const R = D.rng(S.vp.seed), base = safeName(s.name), list = [];
  for (let i = 0; i < S.vp.count; i++) {
    let ch = s.ch;
    const offMs = R() * S.vp.offset, rev = R() * 100 < S.vp.rev, st = (R() * 2 - 1) * S.vp.pitch, tone = R() * S.vp.tone / 100, gdb = (R() * 2 - 1) * S.vp.gain, sf = 1 + (R() * 2 - 1) * S.vp.stretch / 100;
    if (offMs > 0.5) { const k = Math.min(D.len(ch) - 1, Math.round(offMs * s.sr / 1000)); ch = ch.map(c => c.slice(k)); }
    if (rev) ch = ch.map(c => c.slice().reverse());
    const r = S.vp.chain && S.chainOn ? D.processChain({ sr: s.sr, ch }, S.chain) : { sr: s.sr, ch: D.copy(ch) };
    if (S.vp.accents && hasAccents()) r.ch = D.renderAccents(r.ch, r.sr, activeSlots(s), { seed: S.vp.seed * 1000 + i, jitter: true, reference: accentReference(r.sr) }).ch;
    if (Math.abs(sf - 1) > 0.004) r.ch = D.timeStretch(r.ch, r.sr, sf, 'wsola', 30);
    if (Math.abs(st) > 0.005) r.ch = D.varispeed(r.ch, () => Math.pow(2, st / 12));
    let fc = 0;
    if (tone > 0.005) { fc = 20000 * Math.pow(2, -tone * 5); r.ch = D.FX.filter(r.ch, r.sr, { mode: 'lowpass', freq: fc, q: 0.707, sweep: false }); }
    r.ch = finish(D.scale(r.ch, D.dbToLin(gdb)), r.sr).ch;
    const info = [`${sgn(st) || '+'}${Math.abs(st).toFixed(2)} st`, `${sgn(gdb) || '+'}${Math.abs(gdb).toFixed(1)} dB`];
    if (Math.abs(sf - 1) > 0.004) info.push(`length ×${sf.toFixed(2)}`);
    if (fc) info.push('LP ' + fmtVal({ u: 'Hz' }, fc));
    if (offMs > 0.5) info.push(`+${Math.round(offMs)} ms`);
    if (rev) info.push('reversed');
    if (S.vp.accents && hasAccents()) info.push('accents');
    list.push({ name: varName(base, i), sr: r.sr, ch: r.ch, bits: s.bits, isFloat: s.isFloat, info: info.join(' · ') });
  }
  S.vars = list; renderVars();
  toast(`Generated ${list.length} variation${list.length === 1 ? '' : 's'}`);
}
export function renderVars() {
  const ol = $('#var-list');
  if (!S.vars.length) { ol.replaceChildren(h('li', { class: 'empty', text: 'Generate a set to audition it here. Variations use the selected sound and, by default, the effect chain.' })); return; }
  ol.replaceChildren(...S.vars.map(v => h('li', { class: 'var-item' },
    h('button', { class: 'icon-btn play', type: 'button', title: 'Play', 'aria-label': 'Play ' + v.name, onclick: () => play(v, 0, null, 'var') }, playIcon()),
    h('div', { class: 'var-txt' }, h('span', { class: 'var-name', text: v.name + '.wav' }), h('span', { class: 'var-info', text: `${fmtDur(D.len(v.ch) / v.sr)} s · ${v.info}` })),
    h('button', { class: 'btn small', type: 'button', onclick: () => saveSound(v, v, v.name) }, 'Save'),
    h('button', { class: 'btn small', type: 'button', onclick: () => { addSound(newSound(v.name, v.sr, D.copy(v.ch), v.bits, v.isFloat, 'render')); toast(`Added ${v.name} to the library`); } }, '+ Library'))));
}
export function playSequence(items) {
  const sr = items[0].sr, gap = Math.round(0.25 * sr), nc = Math.max(...items.map(v => v.ch.length));
  const total = items.reduce((t, v) => t + D.len(v.ch) + gap, 0);
  const ch = Array.from({ length: nc }, () => new Float32Array(total));
  let p = 0;
  for (const v of items) { const vc = D.mapChannels(v.ch, nc); vc.forEach((c, k) => ch[k].set(c, p)); p += D.len(v.ch) + gap; }
  play({ sr, ch }, 0, null, 'var');
}

/** Wire the variations tab buttons. */
export function initVariations() {
  $('#btn-gen').onclick = generateVariations;
  $('#btn-reseed').onclick = () => { S.vp.seed = 1 + Math.floor(Math.random() * 999); renderVarParams(); generateVariations(); };
  $('#btn-play-all').onclick = () => S.vars.length ? playSequence(S.vars) : toast('Generate variations first.');
  $('#btn-save-all').onclick = () => S.vars.length ? saveZip((cur() ? cur().name : 'sfx') + '_variations', S.vars) : toast('Generate variations first.');
  $('#btn-vars-lib').onclick = () => {
    if (!S.vars.length) return toast('Generate variations first.');
    S.vars.forEach(v => S.sounds.push(newSound(v.name, v.sr, D.copy(v.ch), v.bits, v.isFloat, 'render')));
    renderLibrary(); renderMix(); toast(`Added ${S.vars.length} sounds to the library`);
  };
}
