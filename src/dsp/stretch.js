// SPDX-License-Identifier: Apache-2.0
/** Time-stretch (WSOLA, phase vocoder, random-phase smear), a stretch that keeps every attack, and pitch shift that
 *  keeps length. */
import { TAU, clamp, rng, len, peak, copy, matchPeak, padTo, monoMix, follower, monoAbs } from './core.js';
import { fft, hann } from './fft.js';
import { varispeed } from './resample.js';

/* WSOLA: overlap-add of input segments, each nudged to the position that best continues the previous one. Clean on transients and noise. */
export function wsolaPlan(x, factor, sr, winMs) {
  const n = x.length, N = Math.max(64, 2 * Math.round(winMs * sr / 2000)), Hs = N / 2, Ha = Hs / factor;
  const outLen = Math.max(1, Math.round(n * factor)), tol = Math.max(4, Math.min(Math.round(Hs * 0.5), Math.round(0.012 * sr)));
  const pos = []; let prev = 0;
  const score = (cp, tmpl, step) => { let s = 0, e = 1e-9; for (let i = 0; i < Hs; i += step) { const v = x[cp + i]; s += x[tmpl + i] * v; e += v * v; } return s / Math.sqrt(e); };
  for (let k = 0; k * Hs < outLen; k++) {
    if (k === 0) { pos.push(0); continue; }
    const nominal = Math.round(k * Ha), tmpl = prev + Hs;
    let best = clamp(nominal, 0, Math.max(0, n - 1));
    if (tmpl + Hs <= n) {
      const lo = Math.max(0, nominal - tol), hi = Math.min(n - Hs, nominal + tol);
      let bc = -Infinity;
      for (let cp = lo; cp <= hi; cp += 4) { const s = score(cp, tmpl, 4); if (s > bc) { bc = s; best = cp; } }
      const lo2 = Math.max(lo, best - 3), hi2 = Math.min(hi, best + 3); bc = -Infinity;
      for (let cp = lo2; cp <= hi2; cp++) { const s = score(cp, tmpl, 1); if (s > bc) { bc = s; best = cp; } }
    }
    pos.push(best); prev = best;
  }
  return { pos, N, Hs, outLen };
}
export function wsolaRender(c, W) {
  const { pos, N, Hs, outLen } = W, out = new Float64Array(outLen), ws = new Float64Array(outLen), w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(TAU * i / N) + 1e-3;
  pos.forEach((p, k) => {
    const o = k * Hs;
    for (let i = 0; i < N; i++) { const j = o + i; if (j >= outLen) break; const s = p + i; out[j] += (s < c.length ? c[s] : 0) * w[i]; ws[j] += w[i]; }
  });
  const r = new Float32Array(outLen); for (let i = 0; i < outLen; i++) r[i] = ws[i] > 0 ? out[i] / ws[i] : 0;
  return r;
}
/* Phase vocoder. rand=true throws away phase for the extreme "smear" stretch. */
export function pvStretchCh(c, factor, N, rand, seed) {
  const n = c.length, Hs = N / 4, Ha = Hs / factor, w = hann(N), B = N / 2 + 1, outLen = Math.max(1, Math.round(n * factor));
  const out = new Float64Array(outLen), ws = new Float64Array(outLen);
  const re = new Float64Array(N), im = new Float64Array(N), prev = new Float64Array(B), acc = new Float64Array(B), R = rng(seed || 1);
  const nF = Math.ceil(outLen / Hs) + 4;
  for (let f = 0; f < nF; f++) {
    const a = Math.round(f * Ha) - N / 2, s = f * Hs - N / 2;
    if (s >= outLen) break;
    for (let i = 0; i < N; i++) { const j = a + i; re[i] = j >= 0 && j < n ? c[j] * w[i] : 0; im[i] = 0; }
    fft(re, im, false);
    for (let k = 0; k < B; k++) {
      const mag = Math.hypot(re[k], im[k]), ph = Math.atan2(im[k], re[k]);
      let op;
      if (rand && k > 0 && k < B - 1) op = R() * TAU;
      else {
        if (f === 0) acc[k] = ph;
        else { const om = TAU * k * Ha / N; let d = ph - prev[k] - om; d -= TAU * Math.round(d / TAU); acc[k] += (om + d) * factor; }
        prev[k] = ph; op = acc[k];
      }
      re[k] = mag * Math.cos(op); im[k] = mag * Math.sin(op);
    }
    im[0] = 0; im[B - 1] = 0;
    for (let k = B; k < N; k++) { re[k] = re[N - k]; im[k] = -im[N - k]; }
    fft(re, im, true);
    for (let i = 0; i < N; i++) { const j = s + i; if (j >= 0 && j < outLen) { out[j] += re[i] * w[i]; ws[j] += w[i] * w[i]; } }
  }
  const o = new Float32Array(outLen); for (let i = 0; i < outLen; i++) o[i] = out[i] / Math.max(ws[i], 0.1);
  return o;
}
export function timeStretch(chs, sr, factor, method = 'wsola', winMs = 40) {
  if (!len(chs) || Math.abs(factor - 1) < 1e-4) return copy(chs);
  factor = clamp(factor, 0.05, 64);
  if (method === 'smear') {
    const N = 1 << Math.round(Math.log2(0.3 * sr));
    return matchPeak(chs.map((c, k) => pvStretchCh(c, factor, N, true, 17 + k)), peak(chs));
  }
  if (method === 'pv') { const N = 1 << Math.round(Math.log2(0.046 * sr)); return chs.map(c => pvStretchCh(c, factor, N, false, 0)); }
  const W = wsolaPlan(monoMix(chs), factor, sr, winMs);
  return chs.map(c => wsolaRender(c, W));
}
/** Onsets of a sound, in samples: where its level jumps by 9 dB or more within 15 ms, at most one per 30 ms, within
 *  40 dB of its peak. */
export function layerOnsets(chs, sr) {
  const env = follower(monoAbs(chs), 0.2, 30, sr), n = env.length, hop = Math.max(1, Math.round(sr / 1000));
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, env[i]);
  if (!(pk > 0)) return [];
  const floor = pk * 0.01, back = Math.round(0.015 * sr), gap = Math.round(0.03 * sr), out = [];
  for (let i = back; i < n; i += hop) {
    if (env[i] < floor) continue;
    let mn = Infinity; for (let j = i - back; j < i; j += hop) mn = Math.min(mn, env[j]);
    if (env[i] >= Math.max(mn, pk * 1e-4) * 2.8 && (!out.length || i - out[out.length - 1] >= gap)) out.push(i);
  }
  // a sound that starts loud starts with an onset
  if (env[Math.min(n - 1, hop)] >= floor && !(out.length && out[0] < gap)) out.unshift(0);
  return out;
}
/**
 * Time-stretch that keeps every attack: the first `attackMs` after each onset is copied as it is and only the sound
 * between attacks is stretched, so hits stay sharp (a plain stretch smears or doubles them) and land where the stretched
 * rhythm puts them: onset i at onset_i x factor. Shrinking cuts an attack short (with a 2 ms fade) only when the next one
 * comes sooner than the attack lasts. Each attack is entered through the original's own 2 ms before it, so the joins
 * are the source's. opts: method and winMs as timeStretch (the window shrinks for short stretches between attacks),
 * attackMs (default 30), onsets (sample positions, e.g. from Playhead; default: layerOnsets), lead (ms the kept attack
 * starts before each onset, default 3, for onsets that come a little late). The result is round(n x factor) long.
 */
export function stretchAttacks(chs, sr, factor, opts = {}) {
  const n = len(chs);
  if (!n || Math.abs(factor - 1) < 1e-4) return copy(chs);
  factor = clamp(factor, 0.05, 64);
  const { method = 'wsola', winMs = 40, attackMs = 30 } = opts, lead = Math.round((opts.lead ?? 3) * sr / 1000);
  const A = Math.max(1, Math.round(attackMs * sr / 1000)), X = Math.max(1, Math.round(0.002 * sr)), gap = Math.round(0.01 * sr);
  const on = [];
  for (const o of (opts.onsets || layerOnsets(chs, sr)).map(Math.round).filter(v => v >= 0 && v < n).sort((a, b) => a - b)) if (!on.length || o - on[on.length - 1] >= gap) on.push(o);
  const N = Math.max(1, Math.round(n * factor)), out = chs.map(() => new Float32Array(N));
  if (!on.length) return timeStretch(chs, sr, factor, method, winMs).map(c => padTo(c, N).subarray(0, N));
  // each kept attack starts `lead` before its onset, in the input and in the output alike, so the onset itself lands
  // exactly at onset x factor
  const sIn = on.map(o => Math.max(0, o - lead)), sOut = on.map((o, i) => Math.max(0, Math.min(N, Math.round(o * factor)) - (o - sIn[i])));
  // input [a, b) as exactly m samples: stretched (a window of at most a third of the stretch), or copied when it is
  // too short to stretch (cut short with a fade, or followed by silence)
  const render = (a, b, m) => {
    const L = b - a;
    if (m <= 0) return chs.map(() => new Float32Array(0));
    if (L < Math.round(0.024 * sr) || Math.abs(m / L - 1) < 1e-3) return chs.map(c => { const o = new Float32Array(m); o.set(c.subarray(a, a + Math.min(L, m))); if (m < L) fadeEnd(o, X); return o; });
    const win = Math.max(8, Math.min(winMs, L / sr * 1000 / 3));
    return timeStretch(chs.map(c => c.subarray(a, b)), sr, m / L, method, win).map(c => { const o = new Float32Array(m); o.set(c.subarray(0, Math.min(m, c.length))); return o; });
  };
  // write y at w, crossfading its first xf samples with what is there
  const write = (y, w, xf) => y.forEach((c, k) => { const o = out[k]; for (let j = 0; j < c.length && w + j < N; j++) { const u = j < xf ? (j + 1) / (xf + 1) : 1; o[w + j] = o[w + j] * (1 - u) + c[j] * u; } });
  if (sIn[0] > 0) write(render(0, sIn[0], sOut[0]), 0, 0);
  for (let i = 0; i < on.length; i++) {
    const a0 = sIn[i], w = sOut[i], last = i + 1 >= on.length, next = last ? n : sIn[i + 1], room = (last ? N : sOut[i + 1]) - w;
    if (room <= 0 || next <= a0) continue;
    const want = Math.min(A + (on[i] - a0), next - a0), a = Math.max(1, Math.min(want, room));
    // the attack as it is, entered through the original's samples just before it
    const x = Math.min(X, a0 - (i ? sIn[i - 1] : 0), w);
    const att = chs.map(c => c.slice(a0 - x, a0 + a));
    if (a < want) att.forEach(c => fadeEnd(c, Math.min(X, a)));
    write(att, w - x, x);
    // then the rest up to the next attack, stretched into the room left, overlapping the attack's end by up to 2 ms
    if (room > a && next > a0 + a) { const xr = Math.min(X, a); write(render(a0 + a - xr, next, room - a + xr), w + a - xr, xr); }
  }
  return out;
}
const fadeEnd = (c, m) => { for (let j = 0; j < m && j < c.length; j++) c[c.length - 1 - j] *= j / m; };
export function pitchShift(chs, sr, st, method, winMs) {
  if (!st) return copy(chs);
  const r = Math.pow(2, st / 12), n = len(chs);
  return varispeed(timeStretch(chs, sr, r, method, winMs), () => r).map(c => padTo(c, n));
}
