// SPDX-License-Identifier: Apache-2.0
/**
 * Waveform, spectrogram and Playhead strip drawing. Each canvas caches its rendered image keyed by sound version, size,
 * view and theme colors.
 */
import * as D from '../dsp/index.js';
import { $ } from './dom.js';
import { S, cur } from './state.js';
import { PH, phDoc, phStatus, drawPhStrip } from './playhead.js';
import { renderLookBar } from './lookbar.js';

export function tokens() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  return { well: g('--well'), wave: g('--wave'), out: g('--wave-out'), line: g('--line'), muted: g('--muted'), accent: g('--accent'), danger: g('--danger'), ink: g('--ink'),
    layers: [1, 2, 3, 4].map(k => g('--layer-' + k)) };
}
/** Colours for Playhead strips from the theme tokens (out: the output lane's colours). */
export function phTheme(T, out) {
  const wc = out ? T.out : T.wave, full = hexRgb(wc), faint = hexRgb(T.well).map((v, i) => Math.round(v + (full[i] - v) * 0.3));
  return { wave: wc, waveLow: faint, waveHigh: full, line: T.accent, tick: T.ink, text: T.ink, rule: T.muted,
    lane: out ? T.wave : T.out, laneDown: T.accent, laneFlat: T.muted, series: [T.ink, T.muted], outline: T.muted, halo: T.well,
    specRamp: [hexRgb(T.well), hexRgb(T.out), hexRgb(T.accent)] };
}
export function hexRgb(hx) { const m = /^#?([0-9a-f]{6})$/i.exec(hx || ''); if (!m) return [128, 128, 128]; const v = parseInt(m[1], 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
export function drawPeaks(g, chs, W, H, color, line, danger) {
  const nc = chs.length, n = D.len(chs), lane = H / nc;
  for (let k = 0; k < nc; k++) {
    const mid = lane * k + lane / 2, amp = lane / 2 * 0.9, c = chs[k];
    g.fillStyle = line; g.fillRect(0, Math.round(mid), W, 1);
    if (k > 0) g.fillRect(0, Math.round(lane * k), W, 1);
    if (n < W * 1.5) {
      g.strokeStyle = color; g.lineWidth = 1.25; g.beginPath();
      for (let i = 0; i < n; i++) { const x = n > 1 ? i / (n - 1) * W : 0, y = mid - Math.max(-1.2, Math.min(1.2, c[i])) * amp; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke(); continue;
    }
    for (let x = 0; x < W; x++) {
      const i0 = Math.floor(x / W * n), i1 = Math.max(i0 + 1, Math.floor((x + 1) / W * n));
      let mn = Infinity, mx = -Infinity;
      for (let i = i0; i < i1 && i < n; i++) { const v = c[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mn > mx) continue;
      const clip = mx > 1 || mn < -1;
      mx = Math.min(1.1, mx); mn = Math.max(-1.1, mn);
      g.fillStyle = clip ? danger : color;
      const y0 = mid - mx * amp, y1 = mid - mn * amp;
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
  }
}
export function drawSpec(off, snd, T) {
  const cols = Math.min(off.width, 1400), rows = Math.min(off.height, 360);
  const sp = D.spectrogram(snd.ch, snd.sr, cols, rows);
  const c0 = hexRgb(T.well), c1 = hexRgb(T.out), c2 = hexRgb(T.accent);
  const img = new ImageData(cols, rows);
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
    const t = Math.pow(Math.max(0, Math.min(1, (sp[x * rows + y] + 80) / 72)), 1.4);
    let r, gg, b;
    if (t < 0.6) { const u = t / 0.6; r = c0[0] + (c1[0] - c0[0]) * u; gg = c0[1] + (c1[1] - c0[1]) * u; b = c0[2] + (c1[2] - c0[2]) * u; }
    else { const u = (t - 0.6) / 0.4; r = c1[0] + (c2[0] - c1[0]) * u; gg = c1[1] + (c2[1] - c1[1]) * u; b = c1[2] + (c2[2] - c1[2]) * u; }
    const i = (y * cols + x) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  const tmp = document.createElement('canvas'); tmp.width = cols; tmp.height = rows; tmp.getContext('2d').putImageData(img, 0, 0);
  const g = off.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, off.width, off.height);
}
export function drawWave(cv, snd, o) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const g = cv.getContext('2d'), T = tokens();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = T.well; g.fillRect(0, 0, W, H);
  const n = snd ? D.len(snd.ch) : 0;
  if (!n) { g.fillStyle = T.muted; g.font = '12px "IBM Plex Mono", monospace'; g.fillText(o.empty || 'No audio', 12, H / 2 + 4); return; }
  const view = o.waveOnly || (S.view === 'ph' && !PH.on) ? 'wave' : S.view;
  const doc = view === 'ph' ? phDoc(o.key, snd, o.slot, o.redraw) : null;
  const key = [o.key, pw, ph, T.wave, T.out, T.line, T.accent, T.danger, view, doc ? 'doc' : '', view === 'ph' ? PH.look : ''].join('|');
  if (!cv._c || cv._c.key !== key) {
    const off = document.createElement('canvas'); off.width = pw; off.height = ph;
    if (view === 'spec') drawSpec(off, snd, T);
    else {
      const og = off.getContext('2d'); og.setTransform(dpr, 0, 0, dpr, 0, 0);
      // calm passages faint, harsh ones in the full waveform colour (red stays reserved for clipping); the spectrogram
      // uses the same colours as the Spectrum view
      if (doc) drawPhStrip(og, doc, W, H, phTheme(T, o.out));
      else drawPeaks(og, snd.ch, W, H, o.out ? T.out : T.wave, T.line, T.danger);
    }
    cv._c = { key, off };
  }
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(cv._c.off, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (o.regions) {
    g.font = '11px "IBM Plex Mono", monospace';
    o.regions.forEach((r, i) => {
      const x0 = r.a / n * W, x1 = r.b / n * W;
      g.fillStyle = T.accent; g.globalAlpha = i % 2 ? 0.14 : 0.24; g.fillRect(x0, 0, x1 - x0, H); g.globalAlpha = 1;
      g.fillRect(Math.round(x0), 0, 1, H);
      g.fillStyle = T.ink; g.fillText(String(i + 1), x0 + 3, 12);
    });
  }
  if (o.sel) {
    g.fillStyle = T.accent; g.globalAlpha = 0.24; g.fillRect(o.sel.a / n * W, 0, (o.sel.b - o.sel.a) / n * W, H); g.globalAlpha = 1;
    g.fillRect(Math.round(o.sel.a / n * W), 0, 1.5, H); g.fillRect(Math.round(o.sel.b / n * W) - 1, 0, 1.5, H);
  }
  if (o.cursor > 0 && !o.sel) { g.fillStyle = T.muted; for (let y = 0; y < H; y += 6) g.fillRect(Math.round(o.cursor / n * W), y, 1, 3); }
  if (view === 'ph' && !doc) {     // the legend of a drawn look is in the look bar above the source lane
    const note = phStatus(o.key) === 'error' ? 'Playhead could not analyse this sound' : 'Playhead is analysing…';
    g.font = '10px "IBM Plex Mono", monospace'; g.fillStyle = T.muted; g.textAlign = 'right'; g.fillText(note, W - 6, 12); g.textAlign = 'left';
  }
  if (o.overlay) o.overlay(g, W, H, n, T);
  if (o.playhead != null) { g.fillStyle = T.accent; g.fillRect(Math.round(o.playhead / n * W) - 1, 0, 2, H); }
}
export function drawSrc(playhead) {
  const s = cur();
  const regions = S.tab === 'sl' && S.slices && s && S.slices.key === s.id + ':' + s.ver ? S.slices.list : null;
  drawWave($('#wave-src'), s, { key: s ? 's' + s.id + ':' + s.ver : '', slot: 'src', redraw: redrawSrc, sel: S.sel, cursor: S.cursor, playhead, regions, empty: 'Import a sound or pick one from the library' });
  if (playhead == null) renderLookBar();
}
const redrawSrc = () => drawSrc(), redrawOut = () => drawOut();
export function drawOut(playhead) {
  const o = S.out;
  drawWave($('#wave-out'), o && !o.err ? o : null, { key: o ? 'o' + o.key : '', slot: 'out', redraw: redrawOut, out: true, playhead, empty: o && o.err ? 'Effect error: ' + o.err : 'No output' });
}
export function drawGen(playhead) {
  if (S.tab !== 'gen') return;
  const o = S.gOut, dv = o && o.drive;
  drawWave($('#wave-gen'), o, { key: 'g' + S.gVer, out: true, playhead, waveOnly: true, empty: 'Pick a sound type above', overlay: dv ? (g, W, H, n, T) => {
    // Reaction engine: the action's drive (thin) and the medium's response after delay, threshold and settling (thick).
    const dur = n / o.sr, line = (vals, rate, color, width) => {
      g.strokeStyle = color; g.lineWidth = width; g.beginPath();
      for (let i = 0; i < vals.length; i++) { const x = i / rate / dur * W, y = H - 3 - vals[i] * (H - 22); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    };
    line(dv.values, dv.rate, T.muted, 1); line(dv.ctl, dv.ctlRate, T.accent, 2);
    g.font = '10px "IBM Plex Mono", monospace'; g.fillStyle = T.muted;
    g.fillText(`thin: action, ${dv.label} · thick: response`, 6, 12);
  } : null });
}
