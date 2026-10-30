// SPDX-License-Identifier: Apache-2.0
/**
 * Generate tab: three engines (Synth, Impact, Texture) defined in src/config/generator.js.
 * Each engine keeps its own parameters and last rolled type, so switching engines does not lose work.
 */
import * as D from '../../dsp/index.js';
import { $, h, toast } from '../dom.js';
import { tokens } from '../draw.js';
import { S, cur, newSound } from '../state.js';
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

/** Measure the selected library sound for the Resynth engine. quiet: no error toast (automatic first measurement). */
export function measureSelected(quiet = false) {
  const s = cur();
  if (!s) { if (!quiet) toast('Select a sound in the library first.'); return false; }
  try {
    let ch = s.ch;
    if (s.sr !== SR) ch = D.resample(ch, s.sr, SR);
    S.gMeasured = { ...D.measureModes(ch, SR), name: s.name };
    renderMeasure();
    return true;
  } catch (e) {
    if (!quiet) toast(`${s.name}: ${e.message}`, 'err');
    return false;
  }
}

function renderMeasure() {
  const box = $('#gen-measure');
  box.hidden = !engine().measure;
  if (box.hidden) return;
  const m = S.gMeasured || D.defaultMeasurement(SR), d = D.describeMeasurement(m), hz = v => (v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : v.toFixed(1) + ' Hz');
  $('#gen-measure-info').textContent = `${m.name || 'Measured sound'}: ${d.count} modes (${d.strong} strong), lowest strong ${hz(d.f1)}, longest ring ${d.longest.toFixed(2)} s.`
    + (S.gMeasured ? '' : ' Select a recorded hit, knock or clang and press Measure.');
  drawModes();
}

/** Mode view: log frequency axis; grey = measured, accent = after the current changes. Height = level, opacity = ring time. */
export function drawModes() {
  const cv = $('#modes-view');
  if (!engine().measure || !cv || $('#gen-measure').hidden) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'), T = tokens(), m = S.gMeasured || D.defaultMeasurement(SR);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = T.well; g.fillRect(0, 0, W, H);
  const lo = Math.log(30), hi = Math.log(20000), x = f => (Math.log(Math.max(30, f)) - lo) / (hi - lo) * W, base = H - 14;
  g.fillStyle = T.line; g.font = '10px "IBM Plex Mono", monospace';
  for (const [f, l] of [[100, '100'], [1000, '1k'], [10000, '10k']]) { g.fillRect(Math.round(x(f)), 0, 1, base); g.fillStyle = T.muted; g.fillText(l, x(f) + 3, H - 3); g.fillStyle = T.line; }
  const hOf = a => Math.max(2, (1 + Math.max(-60, 20 * Math.log10(a + 1e-9)) / 60) * (base - 6));
  const tauMax = Math.max(...m.modes.map(q => q.tau));
  for (const q of m.modes) { g.fillStyle = T.muted; g.globalAlpha = 0.6; g.fillRect(Math.round(x(q.f)), base - hOf(q.a), 1, hOf(q.a)); }
  for (const q of D.transformModes(m, params(), SR)) {
    g.fillStyle = T.accent; g.globalAlpha = 0.35 + 0.65 * Math.min(1, q.tau / tauMax);
    g.fillRect(Math.round(x(q.f)) - 1, base - hOf(q.g), 3, hOf(q.g));
  }
  g.globalAlpha = 1;
}

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
  const onChange = () => { syncWhen(grid, p); genChanged(); drawModes(); };
  grid.replaceChildren(...engine().groups.map(([title, specs]) => h('div', { class: 'panel gen-group' }, h('h2', { text: title }), specs.map(sp => paramRow(sp, p, onChange, `gen-${S.gEngine}`)))));
  syncWhen(grid, p);
}
export function genRender() {
  try {
    const p = engine().measure ? { ...params(), measured: S.gMeasured } : params();
    S.gOut = { sr: SR, ch: D[engine().render](p, SR) };
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
  renderGenTypes(); renderGenParams(); renderMeasure(); genRender();
  if (S.gOut) play(S.gOut, 0, null, 'gen');
}
export function mutateGen() {
  const p = params();
  for (const sp of engineSpecs(S.gEngine)) if (!sp.type && sp.k !== 'seed') p[sp.k] = nudge(sp, p[sp.k], 0.08);
  renderGenParams(); drawModes(); genRender();
  if (S.gOut) play(S.gOut, 0, null, 'gen');
}
function setEngine(k) {
  S.gEngine = k;
  if (engine().measure && !S.gMeasured) measureSelected(true);
  renderEngines(); renderGenTypes(); renderGenParams(); renderMeasure();
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
  $('#gen-measure-btn').onclick = () => { if (measureSelected()) { genRender(); if (S.gOut) play(S.gOut, 0, null, 'gen'); toast('Measured. Pick a type or change the settings to reshape it.'); } };
  $('#gen-add').onclick = () => { if (addGenerated()) toast('Added to the library. Select it there to apply effects or make variations.'); };
  $('#gen-layer').onclick = () => {
    const s = addGenerated(); if (!s) return;
    const slot = S.layers.find(l => !l.src || !S.sounds.some(x => x.id === l.src)) || S.layers[S.layers.length - 1];
    Object.assign(slot, { src: s.id, gain: 0, pitch: 0, pan: 0, reverse: false });
    S.mode = 'layer'; renderMix();
    toast(`Added ${s.name} to layer ${S.layers.indexOf(slot) + 1} in Combine & morph. Set its offset there to place it after the action.`);
  };
}
