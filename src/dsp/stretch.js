// SPDX-License-Identifier: Apache-2.0
/** Time-stretch (WSOLA, phase vocoder, random-phase smear) and pitch shift that keeps length. */
import { TAU, clamp, rng, len, peak, copy, matchPeak, padTo, monoMix } from './core.js';
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
export function pitchShift(chs, sr, st, method, winMs) {
  if (!st) return copy(chs);
  const r = Math.pow(2, st / 12), n = len(chs);
  return varispeed(timeStretch(chs, sr, r, method, winMs), () => r).map(c => padTo(c, n));
}
