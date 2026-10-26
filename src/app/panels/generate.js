// SPDX-License-Identifier: Apache-2.0
/**
 * Generate tab: three engines (Synth, Impact, Texture) defined in src/config/generator.js.
 * Each engine keeps its own parameters and last rolled type, so switching engines does not lose work.
 */
import * as D from '../../dsp/index.js';
import { $, h, toast } from '../dom.js';
import { S, newSound } from '../state.js';
import { fmtDur, defaults, roundLog, safeName, chLabel } from '../format.js';
import { ENGINES, engineSpecs } from '../../config/generator.js';
import { paramRow, syncWhen, nudge } from '../controls.js';
import { play } from '../audio.js';
import { drawGen } from '../draw.js';
import { addSound } from '../library.js';
import { renderMix } from './combine.js';

const SR = 48000;
let genTimer = 0;
const engine = () => ENGINES[S.gEngine];
const params = () => S.gParams[S.gEngine];

export function renderEngines() {
  $('#gen-engines').replaceChildren(...Object.entries(ENGINES).map(([k, e]) => h('button', {
    type: 'button', 'aria-pressed': S.gEngine === k ? 'true' : 'false', onclick: () => setEngine(k),
  }, e.name)));
  $('#gen-desc').textContent = engine().desc;
}
export function renderGenTypes() {
  const cur = S.gTypes[S.gEngine];
  $('#gen-types').replaceChildren(...Object.keys(engine().types).map(k => h('button', { class: 'mode', type: 'button', 'aria-pressed': cur === k ? 'true' : 'false', onclick: () => rollGen(k) }, k)));
}
export function renderGenParams() {
  const grid = $('#gen-grid'), p = params();
  const onChange = () => { syncWhen(grid, p); genChanged(); };
  grid.replaceChildren(...engine().groups.map(([title, specs]) => h('div', { class: 'panel gen-group' }, h('h2', { text: title }), specs.map(sp => paramRow(sp, p, onChange, `gen-${S.gEngine}`)))));
  syncWhen(grid, p);
}
export function genRender() {
  try {
    S.gOut = { sr: SR, ch: D[engine().render](params(), SR) };
  } catch (e) {
    console.error(e); S.gOut = null; toast('Could not render this sound: ' + e.message, 'err'); return;
  }
  S.gVer++;
  $('#gen-info').textContent = `${fmtDur(D.len(S.gOut.ch) / SR)} s · 48 kHz · 24-bit ${chLabel(S.gOut.ch.length)}`;
  drawGen();
}
export function genChanged() {
  clearTimeout(genTimer);
  genTimer = setTimeout(() => { genRender(); if (S.gOut && $('#gen-auto').checked) play(S.gOut, 0, null, 'gen'); }, 220);
}
/** Snap rolled values to each spec's range and step so sliders show exactly what will render. */
function snapToSpecs(p) {
  for (const sp of engineSpecs(S.gEngine)) {
    if (sp.type || typeof p[sp.k] !== 'number') continue;
    const st = sp.step || 1;
    p[sp.k] = D.clamp(sp.log ? roundLog(p[sp.k]) : Math.round(p[sp.k] / st) * st, sp.min, sp.max);
  }
  return p;
}
export function rollGen(type) {
  S.gTypes[S.gEngine] = type;
  S.gParams[S.gEngine] = snapToSpecs(Object.assign(defaults(engineSpecs(S.gEngine)), engine().types[type](), { seed: 1 + Math.floor(Math.random() * 999) }));
  renderGenTypes(); renderGenParams(); genRender();
  if (S.gOut) play(S.gOut, 0, null, 'gen');
}
export function mutateGen() {
  const p = params();
  for (const sp of engineSpecs(S.gEngine)) if (!sp.type && sp.k !== 'seed') p[sp.k] = nudge(sp, p[sp.k], 0.08);
  renderGenParams(); genRender();
  if (S.gOut) play(S.gOut, 0, null, 'gen');
}
function setEngine(k) {
  S.gEngine = k;
  renderEngines(); renderGenTypes(); renderGenParams();
  if (!S.gTypes[k]) rollGen(Object.keys(engine().types)[0]); else genRender();
}
/** First visit to the tab: render the Synth laser without auto-playing. */
export function rollGenQuiet() {
  S.gTypes.synth = 'Laser';
  S.gParams.synth = snapToSpecs(Object.assign(defaults(engineSpecs('synth')), ENGINES.synth.types.Laser(), { seed: 7 }));
  renderEngines(); renderGenTypes(); renderGenParams(); genRender();
}
function addGenerated() {
  if (!S.gOut) return null;
  const base = safeName((S.gTypes[S.gEngine] || S.gEngine).toLowerCase()); S.gCount[base] = (S.gCount[base] || 0) + 1;
  return addSound(newSound(`${base}_${String(S.gCount[base]).padStart(2, '0')}`, SR, D.copy(S.gOut.ch), 24, false, 'generated'));
}

/** Wire the generator buttons. */
export function initGenerate() {
  $('#gen-play').onclick = () => { if (!S.gOut) genRender(); if (S.gOut) play(S.gOut, 0, null, 'gen'); };
  $('#gen-mutate').onclick = mutateGen;
  $('#gen-add').onclick = () => { if (addGenerated()) toast('Added to the library. Select it there to apply effects or make variations.'); };
  $('#gen-layer').onclick = () => {
    const s = addGenerated(); if (!s) return;
    const slot = S.layers.find(l => !l.src || !S.sounds.some(x => x.id === l.src)) || S.layers[S.layers.length - 1];
    Object.assign(slot, { src: s.id, gain: 0, pitch: 0, pan: 0, reverse: false });
    S.mode = 'layer'; renderMix();
    toast(`Added ${s.name} to layer ${S.layers.indexOf(slot) + 1} in Combine & morph. Set its offset there to place it after the action.`);
  };
}
