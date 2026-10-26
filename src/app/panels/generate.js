// SPDX-License-Identifier: Apache-2.0
/** Generate tab: procedural synth with sound-type dice, Mutate and auto-play. */
import * as D from '../../dsp/index.js';
import { $, h, toast } from '../dom.js';
import { S, newSound } from '../state.js';
import { fmtDur, defaults, roundLog, safeName } from '../format.js';
import { GEN_GROUPS, GEN_SPECS, GEN_TYPES } from '../../config/generator.js';
import { paramRow, nudge } from '../controls.js';
import { play } from '../audio.js';
import { drawGen } from '../draw.js';
import { addSound } from '../library.js';

let genTimer = 0;
export function renderGenTypes() {
  $('#gen-types').replaceChildren(...Object.keys(GEN_TYPES).map(k => h('button', { class: 'mode', type: 'button', 'aria-pressed': S.gType === k ? 'true' : 'false', onclick: () => rollGen(k) }, k)));
}
export function renderGenParams() {
  const grid = $('#gen-grid');
  grid.replaceChildren(...GEN_GROUPS.map(([title, specs]) => h('div', { class: 'panel gen-group' }, h('h2', { text: title }), specs.map(sp => paramRow(sp, S.gp, genChanged, 'gen')))));
}
export function genRender() {
  S.gOut = { sr: 48000, ch: D.synthGen(S.gp, 48000) }; S.gVer++;
  const n = D.len(S.gOut.ch);
  $('#gen-info').textContent = `${fmtDur(n / 48000)} s · 48 kHz · 24-bit mono`;
  drawGen();
}
export function genChanged() {
  clearTimeout(genTimer);
  genTimer = setTimeout(() => { genRender(); if ($('#gen-auto').checked) play(S.gOut, 0, null, 'gen'); }, 220);
}
export function rollGen(type) {
  S.gType = type;
  S.gp = Object.assign(defaults(GEN_SPECS), GEN_TYPES[type](), { seed: 1 + Math.floor(Math.random() * 999) });
  for (const sp of GEN_SPECS) if (!sp.type && typeof S.gp[sp.k] === 'number') S.gp[sp.k] = D.clamp(sp.log ? roundLog(S.gp[sp.k]) : Math.round(S.gp[sp.k] / (sp.step || 1)) * (sp.step || 1), sp.min, sp.max);
  renderGenTypes(); renderGenParams(); genRender(); play(S.gOut, 0, null, 'gen');
}
export function mutateGen() {
  for (const sp of GEN_SPECS) if (!sp.type && sp.k !== 'seed') S.gp[sp.k] = nudge(sp, S.gp[sp.k], 0.08);
  renderGenParams(); genRender(); play(S.gOut, 0, null, 'gen');
}
export function rollGenQuiet() { S.gType = 'Laser'; S.gp = Object.assign(defaults(GEN_SPECS), GEN_TYPES.Laser(), { seed: 7 }); renderGenTypes(); renderGenParams(); genRender(); }

/** Wire the generator buttons. */
export function initGenerate() {
  $('#gen-play').onclick = () => { if (!S.gOut) genRender(); play(S.gOut, 0, null, 'gen'); };
  $('#gen-mutate').onclick = mutateGen;
  $('#gen-add').onclick = () => {
    if (!S.gOut) return;
    const base = safeName((S.gType || 'synth').toLowerCase()); S.gCount[base] = (S.gCount[base] || 0) + 1;
    addSound(newSound(`${base}_${String(S.gCount[base]).padStart(2, '0')}`, 48000, D.copy(S.gOut.ch), 24, false, 'generated'));
    toast('Added to the library. Select it there to apply effects or make variations.');
  };
}
