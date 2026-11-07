// SPDX-License-Identifier: Apache-2.0
/**
 * Layer stack as a timeline, the default view of "Layer stack" in Combine & morph: one lane per layer with a clip to
 * drag (snapping to the other layers' onsets) and to stretch by its right edge (keeping every attack: beds and
 * ambiences can be lengthened or tightened under the hits), and the mix on a folder lane above, as in a DAW. "Align hits" lines the
 * layers' shared hits up (shift and polarity, DSP only); "Line up the low end" makes the bounce sum the low end in phase.
 * With Playhead analysis on, the folder can also show the layers' combined Playhead, each layer's share, the loudest
 * layer in each band and the bands two layers share, with measures of the whole, and "Find arrangements" searches
 * offsets and gains for a goal (Playhead.arrange). The sliders view in combine.js edits the same S.layers.
 */
import * as D from '../../dsp/index.js';
import { h, toast } from '../dom.js';
import { S, byId } from '../state.js';
import { LAYER_SPEC } from '../../config/tools.js';
import { paramRow } from '../controls.js';
import { fmtVal } from '../format.js';
import { tokens, hexRgb, drawPeaks, phTheme } from '../draw.js';
import { PH, PH_PARTS, phPartDoc, phCombine, phAlignParts, phMeasureParts, phArrange, drawPhDoc } from '../playhead.js';
import { play, stop, playing, onPlayhead } from '../audio.js';

const OFF_MAX = LAYER_SPEC.find(s => s.k === 'offset').max;
export const FOLDER_VIEWS = [
  ['mix', 'Mix', 'The layers summed as they will be rendered.'],
  ['combined', 'Combined Playhead', 'The layers\' Playhead documents combined, without analysing the mix: it follows every move.'],
  ['share', 'Each layer\'s share', 'Height is the loudness of the whole; inside, each layer\'s share of the energy in its colour, the first layer in the middle.'],
  ['owner', 'Loudest layer per band', 'A spectrogram of the whole, each cell in the colour of the layer that is loudest there; brighter is louder.'],
  ['shared', 'Bands two layers share', 'Highlighted where two layers are within 6 dB of each other in the same band and not panned apart: where one may mask the other.'],
];
export const GOALS = [['punch', 'Punchy'], ['big', 'Big (cinematic)'], ['clean', 'Clean (less masking)']];
export const LOW_OPTS = [[0, 'Plain sum'], [120, 'Line up below 120 Hz'], [200, 'Line up below 200 Hz'], [300, 'Line up below 300 Hz']];

const TL = { root: null, rows: null, span: 0, drag: null, pos: 0, clips: new Map(), onsets: new Map(), mixKey: '', mix: null, mixTimer: 0, raf: 0 };

/* ---------- the layers as they sound ---------- */
const anySolo = () => S.layers.some(L => L.solo && L.src && byId(L.src));
const isAudible = L => !!(L.src && byId(L.src)) && !L.mute && (!anySolo() || L.solo);
/** The mix's sample rate: the first layer's sound's (as when rendering). */
export function mixRate() { const L = S.layers.find(l => l.src && byId(l.src)); return L ? byId(L.src).sr : 48000; }
/** A layer as heard: its sound resampled to the mix rate, reversed, re-pitched and stretched (cached). While its edge
 *  is being dragged, the unstretched clip drawn at the new length, so a drag never waits for a stretch. */
function clipOf(L, sr) {
  const s = byId(L.src); if (!s) return null;
  const d = TL.drag, sizing = d && d.mode === 'len' && S.layers[d.k] === L;
  const stretch = sizing ? 1 : L.stretch || 1, key = [L.src, s.ver, L.pitch, L.reverse, stretch, sr].join(':');
  let c = TL.clips.get(key);
  if (!c) {
    const ch = D.prepareLayers([{ ch: s.ch, sr: s.sr, offset: 0, gain: 0, pitch: L.pitch, reverse: L.reverse, stretch, pan: 0 }], sr)[0].c;
    c = { key, ch, sr, dur: D.len(ch) / sr, name: s.name };
    TL.clips.set(key, c);
    if (TL.clips.size > 24) TL.clips.delete(TL.clips.keys().next().value);
  }
  return sizing ? { ...c, dur: c.dur * (L.stretch || 1), sizing: true } : c;
}
const onsetsOf = c => { if (!TL.onsets.has(c.key)) TL.onsets.set(c.key, D.layerOnsets(c.ch, c.sr).map(i => i / c.sr)); return TL.onsets.get(c.key); };
/** The DSP layers for the mixer (only the audible ones), with polarity. */
export function mixLayers(list = S.layers) {
  return list.filter(isAudible).map(L => { const s = byId(L.src); return { ch: s.ch, sr: s.sr, offset: L.offset, gain: L.gain, pitch: L.pitch, reverse: L.reverse, stretch: L.stretch || 1, pan: L.pan / 100, polarity: L.polarity === -1 ? -1 : 1 }; });
}
/** The layers as Playhead parts (audible layers whose documents are ready); null while any is still being analysed. */
function partsOf(list = S.layers) {
  if (!PH.on || !PH_PARTS) return null;
  const sr = mixRate(), out = [];
  for (const L of list) {
    if (!isAudible(L)) continue;
    const c = clipOf(L, sr), doc = c && phPartDoc(c.key, { sr: c.sr, ch: c.ch }, drawLayers);
    if (!doc) return null;
    out.push({ doc, offset: L.offset / 1000, gain: L.gain, k: S.layers.indexOf(L), pan: L.pan / 100 });
  }
  return out.length ? out : null;
}

/* ---------- view ---------- */
function timeSpan() {
  const sr = mixRate(); let end = 0, longest = 0;
  for (const L of S.layers) { const c = L.src && clipOf(L, sr); if (!c) continue; end = Math.max(end, L.offset / 1000 + c.dur); longest = Math.max(longest, c.dur); }
  return Math.max(0.5, end * 1.25, longest * 1.5);
}
function prep(cv, hgt) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = hgt;
  if (!W) return null;
  cv.style.height = H + 'px';
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, W, H };
}
const LANE_H = 84, FOLD_H = 80;
const colorOf = (T, k) => T.layers[k % 4] || T.accent;
function grid(g, W, H, T) {
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5].find(s => s / TL.span * W >= 60) || 10;
  g.fillStyle = T.line;
  for (let t = step; t < TL.span; t += step) g.fillRect(Math.round(t / TL.span * W), 0, 1, H);
  return step;
}
function note(g, W, H, T, text) { g.fillStyle = T.muted; g.font = '11px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.fillText(text, W / 2, H / 2 + 4); g.textAlign = 'left'; }

/** Redraw the timeline (ruler, folder, lanes); cheap enough for every drag move. */
export function drawLayers() {
  if (!TL.rows || !TL.root.isConnected || TL.root.closest('[hidden]')) return;
  cancelAnimationFrame(TL.raf);
  TL.raf = requestAnimationFrame(paint);
}
function paint() {
  const T = tokens(), sr = mixRate(), rows = TL.rows;
  if (!TL.drag) TL.span = timeSpan();
  // ruler
  { const p = prep(rows.ruler, 22); if (p) { const { g, W, H } = p; g.fillStyle = T.well; g.fillRect(0, 0, W, H); const step = grid(g, W, H, T);
    g.fillStyle = T.muted; g.font = '10px "IBM Plex Mono", monospace';
    for (let t = 0; t <= TL.span + 1e-9; t += step) { const x = Math.round(t / TL.span * W); if (x < W - 40) g.fillText(step < 0.1 ? Math.round(t * 1000) + ' ms' : t.toFixed(step < 1 ? 1 : 0) + ' s', x + 3, 14); } } }
  // lanes
  S.layers.forEach((L, k) => {
    const row = rows.lanes[k], p = prep(row.cv, LANE_H); if (!p) return;
    const { g, W, H } = p; g.fillStyle = T.well; g.fillRect(0, 0, W, H); grid(g, W, H, T);
    const c = L.src && clipOf(L, sr);
    row.cv.setAttribute('aria-valuenow', String(L.offset)); row.cv.setAttribute('aria-valuetext', c ? `${c.name} at ${L.offset} ms` : 'empty');
    if (!c) { note(g, W, H, T, 'Empty: choose a sound on the left'); return; }
    const x0 = L.offset / 1000 / TL.span * W, cw = Math.max(3, c.dur / TL.span * W), col = colorOf(T, k);
    g.save(); g.beginPath(); g.rect(x0, 0, cw, H); g.clip();
    const rgb = hexRgb(col); g.fillStyle = `rgba(${rgb.join(',')},0.10)`; g.fillRect(x0, 0, cw, H);
    g.translate(x0, 0);
    const doc = S.view === 'ph' && PH.on ? phPartDoc(c.key, { sr: c.sr, ch: c.ch }, drawLayers) : null;
    if (doc) drawPhDoc(g, doc, cw, H, phTheme(T, false));
    else drawPeaks(g, L.polarity === -1 ? c.ch.map(x => x.map(v => -v)) : c.ch, cw, H, col, T.line, T.danger);
    g.restore();
    g.fillStyle = col; g.fillRect(x0, 0, cw, 2);
    g.strokeStyle = col; g.globalAlpha = TL.drag && TL.drag.k === k ? 1 : 0.5; g.strokeRect(x0 + 0.5, 0.5, cw - 1, H - 1); g.globalAlpha = 1;
    if (cw > 50) { g.font = '10px "IBM Plex Mono", monospace'; g.fillStyle = T.ink; g.fillText((L.polarity === -1 ? 'Ø ' : '') + c.name + ((L.stretch || 1) !== 1 ? ' ×' + (L.stretch || 1).toFixed(2) : ''), x0 + 4, 13); }
    // the stretch handle: a grip on the clip's right edge
    g.fillStyle = col; g.globalAlpha = TL.drag && TL.drag.k === k && TL.drag.mode === 'len' ? 1 : 0.55; g.fillRect(x0 + cw - 4, H / 2 - 12, 3, 24); g.globalAlpha = 1;
    if (!isAudible(L)) { g.fillStyle = T.well; g.globalAlpha = 0.6; g.fillRect(x0, 0, cw, H); g.globalAlpha = 1; }
  });
  paintFolder(T, sr);
  playLine(playing() && playing().where === 'lay' ? null : TL.pos * sr, sr);
}
// the folder lane: the mix, or a Playhead view of the whole
function paintFolder(T, sr) {
  const rows = TL.rows, p = prep(rows.folder, FOLD_H); if (!p) return;
  const { g, W, H } = p; g.fillStyle = T.well; g.fillRect(0, 0, W, H); grid(g, W, H, T);
  const view = PH.on && PH_PARTS ? S.layerFolder : 'mix', ls = S.layers.filter(isAudible);
  rows.fdesc.textContent = (FOLDER_VIEWS.find(v => v[0] === view) || FOLDER_VIEWS[0])[2];
  rows.measures.replaceChildren();
  if (!ls.length) { note(g, W, H, T, 'Every layer is empty or muted'); return; }
  if (view === 'mix') {
    const m = mixPreview(sr);
    drawPeaks(g, m.ch, m.n / sr / TL.span * W, H, T.out, T.line, T.danger);
  } else {
    const parts = partsOf();
    if (!parts) { note(g, W, H, T, 'Playhead is analysing the layers…'); }
    else {
      const end = Math.max(...parts.map(q => q.offset + q.doc.source.duration)), ew = end / TL.span * W;
      if (view === 'combined') drawPhDoc(g, phCombine(parts, { rate: parts[0].doc.curves.rate, duration: end }), ew, H, phTheme(T, true));
      else drawWhole(g, ew, H, T, parts, view, end);
    }
  }
  const parts = PH.on && PH_PARTS ? partsOf() : null;
  if (parts) rows.measures.append(...measureChips(phMeasureParts(parts, { goal: S.layerGoal })));
}
// the mix as rendered (low end lined up when chosen), computed once the layers stop moving; a plain sum while dragging
function mixPreview(sr) {
  const ls = mixLayers(), key = JSON.stringify([ls.map(l => [l.offset, l.gain, l.pitch, l.reverse, l.stretch, l.pan, l.polarity, D.len(l.ch)]), S.layerLow, sr, S.layers.map(L => L.src && byId(L.src) ? byId(L.src).ver : 0)]);
  if (TL.mix && TL.mixKey === key) return TL.mix;
  // plain preview from the cached clips (mono): fast enough for every move
  let n = 0; const clips = S.layers.filter(isAudible).map(L => { const c = clipOf(L, sr); n = Math.max(n, Math.round(L.offset / 1000 * sr) + D.len(c.ch)); return { L, c }; });
  const y = new Float32Array(Math.max(1, n));
  for (const { L, c } of clips) { const o = Math.round(L.offset / 1000 * sr), gg = D.dbToLin(L.gain) * (L.polarity === -1 ? -1 : 1) / c.ch.length; for (const x of c.ch) for (let i = 0; i < x.length; i++) y[o + i] += x[i] * gg; }
  const prev = { ch: [y], n: y.length };
  clearTimeout(TL.mixTimer);
  if (!TL.drag && S.layerLow > 0) TL.mixTimer = setTimeout(() => { const ch = D.layerMix(mixLayers(), sr, { lowAlign: S.layerLow }); TL.mix = { ch: [D.mapChannels(ch, 1)[0]], n: D.len(ch) }; TL.mixKey = key; drawLayers(); }, 250);
  else if (!TL.drag) { TL.mix = prev; TL.mixKey = key; }
  return prev;
}
// share, owner and shared views from Playhead.align (power per column, and per column and band)
function drawWhole(g, ew, H, T, parts, view, end) {
  const A = phAlignParts(parts, { rate: parts[0].doc.curves.rate, duration: end }), C = A.columns, n = A.parts.length, cols = parts.map(q => colorOf(T, q.k));
  if (view === 'share') {
    const mid = H / 2, Wd = Math.max(1, Math.floor(ew)), pw = new Float64Array(n);
    for (let px = 0; px < Wd; px++) {
      const c0 = Math.floor(px / Wd * C), c1 = Math.max(c0 + 1, Math.floor((px + 1) / Wd * C));
      pw.fill(0); let tot = 0;
      for (let c = c0; c < c1 && c < C; c++) for (let i = 0; i < n; i++) pw[i] += A.parts[i].power[c];
      for (let i = 0; i < n; i++) tot += pw[i];
      if (!(tot > 0)) continue;
      const half = Math.max(0, Math.min(1, (10 * Math.log10(tot / (c1 - c0)) + 60) / 60)) * (mid - 0.5);
      let r = 0;
      for (let i = 0; i < n; i++) { const th = pw[i] / tot * half; if (th <= 0) continue; g.fillStyle = cols[i]; g.fillRect(px, mid - r - th, 1, th); g.fillRect(px, mid + r, 1, th); r += th; }
    }
    return;
  }
  const B = A.bands;
  if (!B) { note(g, ew, H, T, 'No spectrogram in this analysis'); return; }
  const tot = new Float64Array(C * B); let top = 0;
  for (const q of A.parts) for (let i = 0; i < tot.length; i++) tot[i] += q.spectrum[i];
  for (let i = 0; i < tot.length; i++) if (tot[i] > top) top = tot[i];
  if (!(top > 0)) return;
  const topDb = 10 * Math.log10(top), bg = hexRgb(T.well), ink = hexRgb(T.muted), hi = hexRgb(T.accent), tc = cols.map(hexRgb);
  const img = document.createElement('canvas'); img.width = C; img.height = B;
  const ig = img.getContext('2d'), id = ig.createImageData(C, B);
  const put = (o, a, b, u) => { for (let j = 0; j < 3; j++) id.data[o + j] = a[j] + (b[j] - a[j]) * u; id.data[o + 3] = 255; };
  for (let c = 0; c < C; c++) for (let b = 0; b < B; b++) {
    const i = c * B + b, o = ((B - 1 - b) * C + c) * 4, t = tot[i];
    if (!(t > 0)) { put(o, bg, bg, 0); continue; }
    const u = Math.max(0, Math.min(1, (10 * Math.log10(t) - topDb + 60) / 60));
    let p1 = 0, p2 = 0, k1 = 0, k2 = -1;
    for (let k = 0; k < n; k++) { const v = A.parts[k].spectrum[i]; if (v > p1) { p2 = p1; k2 = k1; p1 = v; k1 = k; } else if (v > p2) { p2 = v; k2 = k; } }
    if (view === 'owner') { put(o, bg, tc[k1], Math.pow(u, 0.8)); continue; }
    // two layers panned apart mask each other less: the highlight fades with their distance in the panorama
    const apart = k2 >= 0 ? Math.min(1, Math.abs(parts[k1].pan - parts[k2].pan)) : 1;
    if (p2 > 0 && p1 / p2 <= 3.981 && 10 * Math.log10(p2) >= topDb - 45 && apart < 0.9) put(o, bg, hi, Math.max(0.35, u) * (1 - apart));
    else put(o, bg, ink, 0.45 * u);
  }
  ig.putImageData(id, 0, 0);
  const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, C, B, 0, 0, ew, H); g.imageSmoothingEnabled = sm;
}
const pct = v => Math.round(v * 100) + '%';
/** Readable chips for Playhead's measures of the whole: [label, value, title]. */
export function measureText(m) {
  const out = [['Rise', Math.round(m.rise * 1000) + ' ms', 'How long the loudness takes to climb the last 20 dB into the main peak: short is a hard attack'],
    ['Together', pct(m.together), 'Of the layers sounding at the main peak, how many start within 8 ms of each other'],
    ['Focus', m.focus.toFixed(1) + ' dB', 'How far the main peak stands above the 150 to 400 ms after it: high is short and punchy, low long and full'],
    ['Tail', m.tail.toFixed(2) + ' s', 'Until the whole falls 30 dB below its main peak']];
  if (m.shared != null) out.push(['Shared', pct(m.shared), 'Energy in bands where the two strongest layers are within 6 dB: where one may mask the other']);
  if (m.coverage != null) out.push(['Coverage', pct(m.coverage), 'Frequency bands within 30 dB of the strongest one, in the 300 ms from the peak']);
  return out;
}
function measureChips(m) {
  const goal = GOALS.find(gl => gl[0] === S.layerGoal) || GOALS[0];
  return [h('span', { class: 'chip strong', title: `Score for "${goal[1]}" from Playhead's measures (0 to 1)` }, `${goal[1]} ${m.score.toFixed(2)}`)]
    .concat(measureText(m).map(([l, v, t]) => h('span', { class: 'chip', title: t }, `${l} ${v}`)));
}

/* ---------- playback ---------- */
function playLine(pos, sr) {
  const line = TL.rows && TL.rows.line; if (!line) return;
  const t = pos == null ? TL.pos : pos / sr, r = TL.rows.ruler.getBoundingClientRect(), b = TL.root.querySelector('.tl-grid').getBoundingClientRect();
  line.hidden = !(t > 0) || !TL.span;
  line.style.left = (r.left - b.left + t / TL.span * r.width) + 'px';
}
/** Play the layers as they will be rendered (from the play position, or `arr` instead of the current arrangement). */
export function playLayers(arr) {
  const ls = mixLayers(arr || S.layers);
  if (!ls.length) { toast('Choose a sound for at least one layer, and unmute it.', 'err'); return; }
  const sr = mixRate(), ch = D.layerMix(ls, sr, { lowAlign: S.layerLow });
  if (playing() && playing().where === 'lay' && !arr) { stop(); return; }
  play({ sr, ch }, arr ? 0 : Math.min(D.len(ch) - 1, Math.round(TL.pos * sr)), null, 'lay');
}

/* ---------- editing ---------- */
const fracX = (e, el) => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
function setOffset(k, ms) {
  S.layers[k].offset = Math.round(Math.max(0, Math.min(OFF_MAX, ms)));
  S.layerCands = null; syncHeader(k);
}
function syncHeader(k) {
  const row = TL.rows && TL.rows.heads[k]; if (!row) return;
  const L = S.layers[k];
  row.querySelectorAll('.prm').forEach(p => {
    const inp = p.querySelector('input[type="range"]'), out = p.querySelector('output'), sp = LAYER_SPEC.find(s => inp && inp.id.endsWith('-' + s.k));
    if (inp && sp) { inp.value = String(L[sp.k]); if (out) out.textContent = fmtVal(sp, L[sp.k]); }
  });
  const ms = row.querySelector('.tl-ms'); if (ms) ms.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(!!(b.dataset.k === 'polarity' ? L.polarity === -1 : L[b.dataset.k]))));
}
// snap targets: the other layers' clip starts and onsets (seconds on the timeline), and 0
function snapTargets(k, sr) {
  const out = [0];
  S.layers.forEach((L, j) => { if (j === k || !L.src) return; const c = clipOf(L, sr); if (!c) return; out.push(L.offset / 1000); for (const t of onsetsOf(c).slice(0, 200)) out.push(L.offset / 1000 + t); });
  return out;
}
const STRETCH = LAYER_SPEC.find(s => s.k === 'stretch');
function bindLane(cv, k) {
  const over = e => { const L = S.layers[k], c = L.src && clipOf(L, mixRate()); if (!c) return false; const t = fracX(e, cv) * TL.span; return t >= L.offset / 1000 && t <= L.offset / 1000 + c.dur; };
  // within 7 px of the clip's right edge: stretch instead of move
  const onEdge = e => { const L = S.layers[k], c = L.src && clipOf(L, mixRate()); if (!c) return false; const x = fracX(e, cv) * cv.clientWidth, xe = (L.offset / 1000 + c.dur) / TL.span * cv.clientWidth; return Math.abs(x - xe) <= 7; };
  cv.addEventListener('pointerdown', e => {
    const edge = onEdge(e);
    if (!edge && !over(e)) { TL.pos = fracX(e, cv) * TL.span; playLine(null, mixRate()); return; }
    const L = S.layers[k], sr = mixRate(), c = clipOf(L, sr);
    if (edge) {
      TL.drag = { k, mode: 'len' };
      const c1 = clipOf(L, sr);       // the unstretched clip (drag mode), its length at stretch 1
      Object.assign(TL.drag, { base: c1.dur / (L.stretch || 1), targets: snapTargets(k, sr) });
    } else TL.drag = { k, grab: fracX(e, cv) * TL.span - L.offset / 1000, targets: snapTargets(k, sr), anchors: [0].concat(onsetsOf(c).slice(0, 32)) };
    cv.setPointerCapture(e.pointerId); cv.classList.add('is-drag');
  });
  cv.addEventListener('pointermove', e => {
    const d = TL.drag;
    if (!d || d.k !== k) { if (e.pointerType !== 'touch') cv.style.cursor = onEdge(e) ? 'ew-resize' : over(e) ? 'grab' : ''; return; }
    if (d.mode === 'len') {      // the clip's end follows the pointer, snapping to the other layers' starts and onsets
      const L = S.layers[k], start = L.offset / 1000;
      let end = fracX(e, cv) * TL.span;
      if (!e.altKey) { let best = 6 / Math.max(1, cv.clientWidth) * TL.span; for (const tg of d.targets) { const dd = Math.abs(tg - end); if (tg > start && dd < best) { best = dd; end = tg; } } }
      L.stretch = Math.round(Math.max(STRETCH.min, Math.min(STRETCH.max, (end - start) / Math.max(1e-3, d.base))) * 100) / 100;
      S.layerCands = null; syncHeader(k); drawLayers();
      return;
    }
    let t = fracX(e, cv) * TL.span - d.grab;
    if (!e.altKey) {     // snap: a clip start or onset of this layer onto another layer's, within 6 px
      let best = 6 / Math.max(1, cv.clientWidth) * TL.span;
      for (const a of d.anchors) for (const tg of d.targets) { const cand = tg - a, dd = Math.abs(cand - t); if (dd < best) { best = dd; t = cand; } }
    }
    setOffset(k, t * 1000); drawLayers();
  });
  const end = () => { if (!TL.drag || TL.drag.k !== k) return; TL.drag = null; cv.classList.remove('is-drag'); drawLayers(); renderCands(); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('keydown', e => {
    const step = e.shiftKey ? 10 : 1, L = S.layers[k];
    const v = e.key === 'ArrowLeft' ? L.offset - step : e.key === 'ArrowRight' ? L.offset + step : e.key === 'Home' ? 0 : null;
    if (v == null || !L.src) return;
    e.preventDefault(); setOffset(k, v); drawLayers();
  });
}
/** Line the layers' shared hits up (DSP): each layer moves by a few ms and may flip polarity; the loudest stays. */
function alignNow() {
  const idx = S.layers.map((L, k) => (isAudible(L) ? k : -1)).filter(k => k >= 0);
  if (idx.length < 2) { toast('Align hits needs at least two layers that play.', 'err'); return; }
  const res = D.alignHits(mixLayers(), mixRate()), msgs = [];
  let lo = 0;
  res.forEach((r, i) => { const L = S.layers[idx[i]]; lo = Math.min(lo, L.offset + r.shift); });
  res.forEach((r, i) => {
    const L = S.layers[idx[i]], name = byId(L.src).name;
    L.offset = Math.round((L.offset + r.shift - lo) * 10) / 10;       // when one would start before 0, all move later
    if (r.shift || r.polarity !== L.polarity) {
      msgs.push(`${name}: ${r.shift ? Math.abs(r.shift).toFixed(1) + ' ms ' + (r.shift < 0 ? 'earlier' : 'later') : 'in place'}${r.polarity !== L.polarity ? ', polarity flipped' : ''} (hit +${r.gainDb.toFixed(1)} dB, ${r.band === 'low' ? 'low end' : 'full band'})`);
      L.polarity = r.polarity;
    }
  });
  S.layers.forEach((L, k) => { L.offset = Math.round(Math.min(OFF_MAX, L.offset)); syncHeader(k); });
  S.layerCands = null;
  toast(msgs.length ? 'Lined up: ' + msgs.join('; ') : 'Nothing to line up: no shared hits, or less than 1 dB to gain.');
  drawLayers(); renderCands();
}

/* ---------- search ---------- */
function findNow(status) {
  const parts = partsOf();
  if (!parts) { toast('Playhead is still analysing the layers. Try again in a moment.', 'err'); return; }
  if (parts.length < 2) { toast('Finding arrangements needs at least two layers that play.', 'err'); return; }
  status.textContent = 'Searching…';
  setTimeout(() => {
    const r = phArrange(parts.map(q => ({ doc: q.doc, offset: q.offset, gain: q.gain })), { goal: S.layerGoal, range: 0.25, gainRange: [-6, 3], minOffset: 0, maxOffset: OFF_MAX / 1000, count: 6 });
    S.layerCands = { goal: S.layerGoal, idx: parts.map(q => q.k), base: r.baseline, list: r.candidates, from: S.layers.map(L => ({ offset: L.offset, gain: L.gain })) };
    status.textContent = `${r.evaluated} arrangements tried in ${r.ms} ms${r.candidates.length ? '' : ': none scored better than the current one'}.`;
    renderCands();
  }, 20);
}
const candLayers = c => S.layers.map((L, k) => { const i = S.layerCands.idx.indexOf(k); return i < 0 ? L : { ...L, offset: Math.round(c.parts[i].offset * 1000), gain: c.parts[i].gain }; });
function describe(c) {
  return c.changes.map(ch => {
    const L = S.layers[S.layerCands.idx[ch.part]], ms = Math.round(ch.offset * 1000), parts = [];
    if (ms) parts.push(`${Math.abs(ms)} ms ${ms < 0 ? 'earlier' : 'later'}`);
    if (ch.gain) parts.push(`${ch.gain > 0 ? '+' : '−'}${Math.abs(ch.gain).toFixed(1)} dB`);
    return `${byId(L.src).name}: ${parts.join(', ')}`;
  }).join(' · ');
}
function renderCands() {
  const box = TL.rows && TL.rows.cands; if (!box) return;
  const C = S.layerCands;
  if (!C || !PH.on) { box.replaceChildren(); return; }
  const goal = GOALS.find(g => g[0] === C.goal) || GOALS[0], T = tokens();
  const back = C.applied != null ? h('li', { class: 'tl-cand tl-cand-back' }, h('p', { class: 'hint', text: `Using arrangement ${C.applied + 1}.` }),
    h('button', { class: 'btn small', type: 'button', onclick: () => { S.layers.forEach((L, k) => Object.assign(L, C.from[k])); S.layers.forEach((_, k) => syncHeader(k)); C.applied = null; renderCands(); drawLayers(); } }, 'Back to the arrangement before')) : null;
  box.replaceChildren(...[back].filter(Boolean), ...C.list.map((c, i) => {
    const cv = h('canvas', { class: 'tl-cand-cv', role: 'img', 'aria-label': `Arrangement ${i + 1}, each layer's share` });
    const row = h('li', { class: 'tl-cand' },
      h('div', { class: 'tl-cand-head' }, h('b', { text: `${goal[1]} ${c.score.toFixed(2)}` }), h('span', { class: 'hint', text: ` (now ${C.base.score.toFixed(2)})` })),
      cv,
      h('p', { class: 'hint', text: describe(c) || 'Same arrangement' }),
      h('div', { class: 'chips' }, measureText(c.measures).map(([l, v, t]) => h('span', { class: 'chip', title: t }, `${l} ${v}`))),
      h('div', { class: 'tl-cand-acts' },
        h('button', { class: 'btn small', type: 'button', onclick: () => playLayers(candLayers(c)) }, 'Play'),
        h('button', { class: 'btn small primary', type: 'button', 'aria-pressed': String(C.applied === i), onclick: () => { const next = candLayers(c); S.layers.forEach((L, k) => Object.assign(L, { offset: next[k].offset, gain: next[k].gain })); S.layers.forEach((_, k) => syncHeader(k)); C.applied = i; renderCands(); drawLayers(); } }, C.applied === i ? 'In use' : 'Use')));
    requestAnimationFrame(() => {
      const p = prep(cv, 40); if (!p) return;
      const parts = C.idx.map((k, j) => { const L = S.layers[k], cl = clipOf(L, mixRate()); return { doc: phPartDoc(cl.key, { sr: cl.sr, ch: cl.ch }), offset: c.parts[j].offset, gain: c.parts[j].gain, k, pan: L.pan / 100 }; });
      if (parts.some(q => !q.doc)) return;
      p.g.fillStyle = T.well; p.g.fillRect(0, 0, p.W, p.H);
      const end = Math.max(...parts.map(q => q.offset + q.doc.source.duration));
      drawWhole(p.g, end / TL.span * p.W, p.H, T, parts, 'share', end);
    });
    return row;
  }));
}

/* ---------- building ---------- */
/** Build the timeline into `body` (Combine & morph, layer stack, timeline view). */
export function renderTimeline(body, soundOptions) {
  const lowSel = h('select', { id: 'tl-low', onchange: e => { S.layerLow = +e.target.value; TL.mixKey = ''; drawLayers(); } }, LOW_OPTS.map(([v, t]) => h('option', { value: String(v), text: t })));
  lowSel.value = String(S.layerLow);
  const ph = PH.on && PH_PARTS;
  const fold = h('select', { id: 'tl-folder', onchange: e => { S.layerFolder = e.target.value; drawLayers(); } }, FOLDER_VIEWS.map(([v, t]) => h('option', { value: v, text: t })));
  fold.value = S.layerFolder;
  const bar = h('div', { class: 'tl-bar' },
    h('button', { class: 'btn small', type: 'button', id: 'tl-play', onclick: () => playLayers() }, 'Play layers'),
    h('button', { class: 'btn small', type: 'button', id: 'tl-align', title: 'Line up the layers\' shared hits: each layer moves by a few ms and may flip polarity where that makes the hit stronger; the loudest layer stays', onclick: alignNow }, 'Align hits'),
    h('label', { title: 'Sum the low end in phase when rendering: repairs cancellation between layers below the frequency, boosts nothing' }, 'Low end ', lowSel),
    ph ? h('label', {}, 'Folder shows ', fold) : null);
  // the grid: ruler, folder, lanes
  const g = h('div', { class: 'tl-grid' });
  const ruler = h('canvas', { class: 'tl-cv', role: 'img', 'aria-label': 'Time ruler; click to set where playback starts' });
  const folder = h('canvas', { class: 'tl-cv', role: 'img', 'aria-label': 'Folder: the layers as a whole; click to set where playback starts' });
  const fdesc = h('p', { class: 'hint tl-fdesc' }), measures = h('div', { class: 'chips tl-measures' });
  g.append(h('div', { class: 'tl-head tl-head-ruler' }, h('span', { class: 'hint', text: 'Drag a clip to move it, its right edge to stretch it (attacks stay); Alt: no snapping' })), ruler,
    h('div', { class: 'tl-head tl-head-folder' }, h('span', { class: 'ab-key', text: 'Mix' }), fdesc, measures), folder);
  const heads = [], lanes = [];
  S.layers.forEach((L, i) => {
    const sel = h('select', { id: `tl${i}-src`, 'aria-label': `Layer ${i + 1} sound`, onchange: e => { L.src = e.target.value ? +e.target.value : null; S.layerCands = null; drawLayers(); renderCands(); } }, soundOptions(true));
    sel.value = L.src && byId(L.src) ? String(L.src) : '';
    const tog = (k, label, title) => h('button', { class: 'btn small tl-tog', type: 'button', 'data-k': k, title, 'aria-label': `${title}, layer ${i + 1}`, 'aria-pressed': String(k === 'polarity' ? L.polarity === -1 : !!L[k]),
      onclick: () => { if (k === 'polarity') L.polarity = L.polarity === -1 ? 1 : -1; else L[k] = !L[k]; S.layerCands = null; syncHeader(i); drawLayers(); renderCands(); } }, label);
    const head = h('div', { class: 'tl-head tl-head-layer', style: `--lc: var(--layer-${i + 1})` },
      h('div', { class: 'tl-line' }, h('span', { class: 'ab-key layer-idx', text: String(i + 1) }), sel,
        h('span', { class: 'tl-ms' }, tog('mute', 'M', 'Mute'), tog('solo', 'S', 'Solo'), tog('polarity', 'Ø', 'Invert polarity'), tog('reverse', 'R', 'Reverse'))),
      h('div', { class: 'tl-prms' }, LAYER_SPEC.map(sp => paramRow(sp, L, () => { if (S.layerCands) { S.layerCands = null; renderCands(); } drawLayers(); }, `tl${i}`))));
    const cv = h('canvas', { class: 'tl-cv tl-lane', role: 'slider', tabindex: '0', 'aria-label': `Layer ${i + 1} clip: drag or use the arrow keys to move it (Shift: 10 ms); drag its right edge to stretch it, or use the Length slider`, 'aria-valuemin': '0', 'aria-valuemax': String(OFF_MAX) });
    bindLane(cv, i);
    heads.push(head); lanes.push({ cv });
    g.append(head, cv);
  });
  const line = h('div', { class: 'tl-line-play', hidden: true });
  g.append(line);
  for (const cv of [ruler, folder]) cv.addEventListener('pointerdown', e => { TL.pos = fracX(e, cv) * TL.span; playLine(null, mixRate()); });
  // the search
  const status = h('span', { class: 'hint', id: 'tl-find-status' });
  const goal = h('select', { id: 'tl-goal', onchange: e => { S.layerGoal = e.target.value; drawLayers(); } }, GOALS.map(([v, t]) => h('option', { value: v, text: t })));
  goal.value = S.layerGoal;
  const search = ph ? h('div', { class: 'tl-search' },
    h('div', { class: 'tl-bar' }, h('label', {}, 'Goal ', goal),
      h('button', { class: 'btn small primary', type: 'button', id: 'tl-find', onclick: () => findNow(status) }, 'Find arrangements'), status),
    h('p', { class: 'hint', text: 'Playhead tries some 500 offsets and gains from the layers\' analyses alone and keeps the best that differ: the loudest layer stays, the others move up to 250 ms and −6 to +3 dB. Play them, use one, then Align hits to line it up to the sample.' }),
    h('ol', { class: 'tl-cands' })) : null;
  const cands = search ? search.querySelector('.tl-cands') : null;
  TL.root = h('div', { class: 'tl' }, bar, g, search);
  TL.rows = { ruler, folder, fdesc, measures, lanes, heads, line, cands };
  body.append(TL.root);
  onPlayhead('lay', pos => playLine(pos, mixRate()));
  if (!TL.ro) { TL.ro = new ResizeObserver(() => drawLayers()); }
  TL.ro.disconnect(); TL.ro.observe(g);
  drawLayers(); renderCands();
}
