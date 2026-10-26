// SPDX-License-Identifier: Apache-2.0
/** The deck: source info, destructive edits with undo, transport, finishing and save controls. */
import * as D from '../dsp/index.js';
import { $, h, toast } from './dom.js';
import { S, cur, newSound } from './state.js';
import { khz, fmtDb, fmtDur, fmtLufs, bitsLabel, chLabel } from './format.js';
import { play, stop } from './audio.js';
import { drawSrc, drawOut } from './draw.js';
import { ensureOut, scheduleRender, playOutput, toggleCompare } from './output.js';
import { renderLibrary, addSound } from './library.js';
import { renderMix } from './panels/combine.js';
import { updateSliceInfo } from './panels/slice.js';
import { saveSound } from './files.js';

export function renderDeck() {
  const s = cur();
  $('#snd-name').value = s ? s.name : '';
  $('#snd-name').disabled = !s;
  const chips = $('#snd-chips');
  if (!s) chips.replaceChildren();
  else {
    const pk = D.peak(s.ch);
    chips.replaceChildren(
      h('span', { class: 'chip', text: khz(s.sr) + ' kHz' }), h('span', { class: 'chip', text: bitsLabel(s) }),
      h('span', { class: 'chip', text: chLabel(s.ch.length) }), h('span', { class: 'chip', text: fmtDur(D.len(s.ch) / s.sr) + ' s' }),
      h('span', { class: 'chip' + (pk > 1 ? ' warn' : ''), text: 'peak ' + fmtDb(pk) + ' dBFS' }),
      h('span', { class: 'chip', text: fmtLufs(D.lufs(s.ch, s.sr)) }));
  }
  updateSelInfo(); updateExportOpts(); drawSrc();
}
export function updateSelInfo() {
  const s = cur(), el = $('#sel-info');
  if (!s) { el.textContent = ''; return; }
  if (S.sel) { const a = S.sel.a / s.sr, b = S.sel.b / s.sr; el.textContent = `selection ${fmtDur(a)}–${fmtDur(b)} s (${fmtDur(b - a)} s)`; }
  else el.textContent = S.cursor > 0 ? `play from ${fmtDur(S.cursor / s.sr)} s` : 'drag to select';
}
export function updateExportOpts() {
  const s = cur();
  const fmt = $('#exp-fmt'), sr = $('#exp-sr');
  fmt.replaceChildren(...[['source', 'Match source' + (s ? ` (${bitsLabel(s)})` : '')], ['16', '16-bit PCM'], ['24', '24-bit PCM'], ['32f', '32-bit float']].map(([v, t]) => h('option', { value: v, text: t })));
  sr.replaceChildren(...[['source', 'Match source' + (s ? ` (${khz(s.sr)} kHz)` : '')], ['22050', '22.05 kHz'], ['44100', '44.1 kHz'], ['48000', '48 kHz'], ['96000', '96 kHz']].map(([v, t]) => h('option', { value: v, text: t })));
  fmt.value = S.exp.fmt; sr.value = S.exp.sr;
}

/* ---------- editing ---------- */
export function edit(op) {
  if (op === 'undo') return undo();
  const s = cur(); if (!s) return;
  const n = D.len(s.ch), sel = S.sel, a = sel ? sel.a : 0, b = sel ? sel.b : n;
  const mapRange = fn => s.ch.map(c => { const o = c.slice(), L = b - a; for (let i = a; i < b; i++) o[i] = fn(o[i], L > 1 ? (i - a) / (L - 1) : 0); return o; });
  let ch = null, keepSel = true;
  switch (op) {
    case 'trim': if (!sel) return toast('Select a region first: drag across the waveform.'); ch = s.ch.map(c => c.slice(a, b)); keepSel = false; break;
    case 'delete': if (!sel) return toast('Select a region first: drag across the waveform.'); ch = s.ch.map(c => { const o = new Float32Array(n - (b - a)); o.set(c.subarray(0, a)); o.set(c.subarray(b), a); return o; }); keepSel = false; break;
    case 'silence': ch = mapRange(() => 0); break;
    case 'reverse': ch = s.ch.map(c => { const o = c.slice(); o.subarray(a, b).reverse(); return o; }); break;
    case 'fadein': ch = mapRange((v, u) => v * (0.5 - 0.5 * Math.cos(Math.PI * u))); break;
    case 'fadeout': ch = mapRange((v, u) => v * (0.5 + 0.5 * Math.cos(Math.PI * u))); break;
    case 'normalize': {
      let pk = 0; for (const c of s.ch) for (let i = a; i < b; i++) pk = Math.max(pk, Math.abs(c[i]));
      if (!pk) return toast('That region is silent.');
      const g = D.dbToLin(-1) / pk; ch = mapRange(v => v * g); break;
    }
    case 'gaindown': { const g = D.dbToLin(-3); ch = mapRange(v => v * g); break; }
    case 'gainup': { const g = D.dbToLin(3); ch = mapRange(v => v * g); break; }
    case 'trimsil': {
      const thr = D.dbToLin(-60); let first = -1, last = -1;
      for (const c of s.ch) for (let i = 0; i < n; i++) if (Math.abs(c[i]) > thr) { if (first < 0 || i < first) first = i; break; }
      for (const c of s.ch) for (let i = n - 1; i >= 0; i--) if (Math.abs(c[i]) > thr) { if (i > last) last = i; break; }
      if (first < 0) return toast('The sound is silent below −60 dBFS.');
      const st = Math.max(0, first - Math.round(0.002 * s.sr)), en = Math.min(n, last + 1 + Math.round(0.01 * s.sr));
      if (st === 0 && en === n) return toast('No silence to trim.');
      ch = s.ch.map(c => c.slice(st, en)); keepSel = false; break;
    }
    case 'mono': if (s.ch.length === 1) return toast('Already mono.'); ch = D.mapChannels(s.ch, 1); break;
    default: return;
  }
  if (!ch || !D.len(ch)) return toast('That would leave an empty sound.');
  s.undo.push(s.ch); if (s.undo.length > 30) s.undo.shift();
  s.ch = ch; s.ver++;
  if (!keepSel) { S.sel = null; S.cursor = 0; }
  afterEdit();
}
export function undo() {
  const s = cur(); if (!s || !s.undo.length) return toast('Nothing to undo.');
  s.ch = s.undo.pop(); s.ver++; S.sel = null; S.cursor = 0; afterEdit(); toast('Undone');
}
export function afterEdit() { stop(false); renderDeck(); renderLibrary(); updateSliceInfo(); scheduleRender(); }
export function playSource() { const s = cur(); if (!s) return; if (S.sel) play(s, S.sel.a, S.sel.b, 'src'); else play(s, S.cursor || 0, null, 'src'); }

/** Wire the deck: waveform selection, transport, edit buttons, display mode, finishing and save controls. */
export function initDeck() {
  const cv = $('#wave-src'); let drag = null;
  cv.addEventListener('pointerdown', e => {
    const s = cur(); if (!s) return;
    cv.setPointerCapture(e.pointerId);
    const n = D.len(s.ch), r = cv.getBoundingClientRect();
    const toS = x => Math.round(D.clamp((x - r.left) / r.width, 0, 1) * n);
    drag = { x0: e.clientX, s0: toS(e.clientX), toS, moved: false };
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x0) > 3) drag.moved = true;
    if (!drag.moved) return;
    const s1 = drag.toS(e.clientX);
    S.sel = Math.abs(s1 - drag.s0) > 1 ? { a: Math.min(drag.s0, s1), b: Math.max(drag.s0, s1) } : null;
    drawSrc(); updateSelInfo();
  });
  const end = () => { if (!drag) return; if (!drag.moved) { S.sel = null; S.cursor = drag.s0; drawSrc(); updateSelInfo(); } drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  $('#btn-play-out').onclick = () => playOutput(0);
  $('#btn-play-src').onclick = playSource;
  $('#btn-stop').onclick = () => stop();
  $('#chain-on').onchange = e => { if (e.target.checked !== S.chainOn) toggleCompare(); };
  const setView = v => {
    S.view = v;
    $('#view-wave').setAttribute('aria-pressed', v === 'wave' ? 'true' : 'false');
    $('#view-spec').setAttribute('aria-pressed', v === 'spec' ? 'true' : 'false');
    drawSrc(); drawOut();
  };
  $('#view-wave').onclick = () => setView('wave');
  $('#view-spec').onclick = () => setView('spec');
  document.querySelector('.ops').addEventListener('click', e => { const b = e.target.closest('[data-op]'); if (b) edit(b.dataset.op); });
  $('#snd-name').addEventListener('change', e => { const s = cur(); if (!s) return; s.name = e.target.value.trim() || s.name; e.target.value = s.name; renderLibrary(); renderMix(); });

  $('#fin-lufs').onchange = e => { S.fin.lufs = e.target.value; scheduleRender(); };
  $('#fin-ch').onchange = e => { S.fin.ch = e.target.value; scheduleRender(); };
  $('#fin-trim').onchange = e => { S.fin.trim = e.target.checked; scheduleRender(); };
  $('#fin-dc').onchange = e => { S.fin.dc = e.target.checked; scheduleRender(); };
  $('#fin-click').onchange = e => { S.fin.declick = e.target.checked; scheduleRender(); };
  $('#exp-safe').onchange = e => { S.fin.ceil = e.target.checked; scheduleRender(); };
  $('#exp-fmt').onchange = e => { S.exp.fmt = e.target.value; };
  $('#exp-sr').onchange = e => { S.exp.sr = e.target.value; };
  $('#btn-save').onclick = () => {
    const s = cur(), o = ensureOut();
    if (!s || !o || o.err || !D.len(o.ch)) return toast('Nothing to save yet.');
    saveSound(o, s, S.chainOn && S.chain.some(f => f.on) ? s.name + '_fx' : s.name);
  };
  $('#btn-bake').onclick = () => {
    const s = cur(), o = ensureOut();
    if (!s || !o || o.err || !D.len(o.ch)) return toast('Nothing to add yet.');
    addSound(newSound(s.name + '_fx', o.sr, D.copy(o.ch), s.bits, s.isFloat, 'render'));
    toast(`Added ${s.name}_fx to the library`);
  };
}
