// SPDX-License-Identifier: Apache-2.0
/**
 * Entry point: builds the example library, wires every module, and handles tabs, keyboard shortcuts and theme changes.
 * Module map: see docs/ARCHITECTURE.md.
 */
import * as D from './dsp/index.js';
import { $ } from './app/dom.js';
import { S, newSound, makeFx } from './app/state.js';
import { PRESETS } from './config/presets.js';
import { playing, stop } from './app/audio.js';
import { drawSrc, drawOut, drawGen } from './app/draw.js';
import { scheduleRender, playOutput, toggleCompare } from './app/output.js';
import { inViewer, downloadsCap } from './app/files.js';
import { renderLibrary, initLibrary } from './app/library.js';
import { renderDeck, initDeck, edit, undo, playSource, updateSelInfo } from './app/deck.js';
import { renderChain, initEffects } from './app/panels/effects.js';
import { renderVarParams, renderVars, initVariations } from './app/panels/variations.js';
import { renderMix, initCombine } from './app/panels/combine.js';
import { rollGenQuiet, initGenerate } from './app/panels/generate.js';
import { updateSliceInfo, initSlice } from './app/panels/slice.js';
import { initRecorder, recorderBusy, toggleRecord } from './app/recorder.js';
import { initFolders } from './app/folders.js';
import { initAccents, refreshAccents, drawAcc } from './app/panels/accents.js';

const TABS = ['fx', 'var', 'mix', 'acc', 'gen', 'sl'];

function setTab(id) {
  S.tab = id;
  for (const t of TABS) {
    $('#tab-' + t).setAttribute('aria-selected', t === id ? 'true' : 'false');
    $('#pane-' + t).hidden = t !== id;
  }
  if (id === 'gen') { if (!S.gOut) rollGenQuiet(); else drawGen(); }
  if (id === 'acc') refreshAccents();
  drawSrc();
}

function initShortcuts() {
  document.addEventListener('keydown', e => {
    const t = e.target, typing = t.matches && t.matches('input[type="text"], textarea, select');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space' && !(t.matches && t.matches('button, input[type="checkbox"]'))) {
      e.preventDefault();
      if (recorderBusy()) { toggleRecord(); return; }
      if (playing()) { stop(); return; }
      if (e.shiftKey) playSource(); else playOutput(0);
    } else if (e.key === 'Escape') {
      stop();
      if (S.sel) { S.sel = null; drawSrc(); updateSelInfo(); }
    } else if (e.key.toLowerCase() === 'b' && !(t.matches && t.matches('input'))) {
      toggleCompare();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel && !(t.matches && t.matches('input'))) {
      e.preventDefault(); edit('delete');
    }
  });
}

function initRedraw() {
  const redraw = () => { for (const id of ['#wave-src', '#wave-out', '#wave-gen', '#wave-acc']) $(id)._c = null; drawSrc(); drawOut(); drawGen(); drawAcc(); };
  new ResizeObserver(() => { drawSrc(); drawOut(); drawGen(); drawAcc(); }).observe($('#wave-src'));
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw); } catch (e) { /* older browsers */ }
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
}

function initRail() {
  const show = which => {
    $('#rail-lib').setAttribute('aria-pressed', which === 'lib' ? 'true' : 'false');
    $('#rail-dir').setAttribute('aria-pressed', which === 'dir' ? 'true' : 'false');
    $('#rail-lib-view').hidden = which !== 'lib';
    $('#rail-dir-view').hidden = which !== 'dir';
  };
  $('#rail-lib').onclick = () => show('lib');
  $('#rail-dir').onclick = () => show('dir');
}

function loadExamples() {
  const sr = 48000;
  const demos = [['gunshot', 'gunshot'], ['laser', 'laser'], ['metal_hit', 'metal'], ['servo', 'servo'], ['whoosh', 'whoosh'], ['footstep', 'footstep']];
  const made = {};
  for (const [name, fn] of demos) {
    const s = newSound(name, sr, D.synth[fn](sr), 24, false, 'example');
    S.sounds.push(s); made[name] = s;
  }
  S.selId = made.gunshot.id;
  S.chain = PRESETS.Weapons['Rifle shot'].map(([t, p]) => makeFx(t, p));
  S.A = made.servo.id; S.B = made.gunshot.id;
  S.layers = [
    { src: made.whoosh.id, offset: 0, gain: -8, pitch: 0, pan: 0, reverse: true },
    { src: made.gunshot.id, offset: 880, gain: 0, pitch: 0, pan: 0, reverse: false },
    { src: made.metal_hit.id, offset: 885, gain: -10, pitch: -5, pan: -20, reverse: false },
    { src: null, offset: 0, gain: 0, pitch: 0, pan: 0, reverse: false },
  ];
}

function boot() {
  loadExamples();
  initDeck(); initLibrary(); initRail(); initRecorder(); initFolders(); initAccents(); initEffects(); initVariations(); initCombine(); initGenerate(); initSlice();
  initShortcuts(); initRedraw();
  for (const t of TABS) $('#tab-' + t).onclick = () => setTab(t);
  $('#env-note').textContent = inViewer()
    ? 'Everything runs in this browser tab; no audio is uploaded. In Claude, saved WAVs arrive inside a .zip because this view only allows certain file types.'
    : 'Everything runs in this browser tab; no audio is uploaded. Single files save directly as .wav; sets save as one .zip.';
  if (inViewer()) downloadsCap();
  renderLibrary(); renderDeck(); renderChain(); renderVarParams(); renderVars(); renderMix(); updateSliceInfo();
  scheduleRender();
}

boot();
