// SPDX-License-Identifier: Apache-2.0
/** Synthesized example sounds and basic one-shot generators (used for the demo library and the 'Basics' menu). */
import { TAU, rng, matchPeak, dbToLin } from './core.js';
import { biquad } from './filters.js';

/* ---------- example sounds and generators ---------- */
export const synth = {
  gunshot(sr) {
    const n = Math.round(0.9 * sr), R = rng(7), L = new Float32Array(n), Rt = new Float32Array(n);
    let ph = 0, lp1 = 0, l2 = 0, r2 = 0;
    const a1 = 1 - Math.exp(-TAU * 2500 / sr), a2 = 1 - Math.exp(-TAU * 700 / sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += TAU * (38 + 50 * Math.exp(-t * 25)) / sr;
      const thump = Math.sin(ph) * Math.exp(-t * 14) * Math.min(1, t / 0.0015);
      const w = R() * 2 - 1; lp1 += a1 * (w - lp1);
      const common = 0.9 * thump + 0.8 * w * Math.exp(-t * 90) + 1.3 * lp1 * Math.exp(-t * 11);
      l2 += a2 * (R() * 2 - 1 - l2); r2 += a2 * (R() * 2 - 1 - r2);
      const te = Math.min(1, t / 0.02) * Math.exp(-t * 4.2) * 2.4;
      L[i] = common + l2 * te; Rt[i] = common + r2 * te;
    }
    return matchPeak([L, Rt], dbToLin(-1));
  },
  laser(sr) {
    const n = Math.round(0.42 * sr), o = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, u = i / n, f = 2400 * Math.pow(180 / 2400, Math.pow(u, 0.6));
      ph += TAU * f / sr;
      const s = Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.18 * Math.sin(3 * ph);
      o[i] = s * Math.min(1, t / 0.004) * Math.pow(1 - u, 1.6) * (1 + 0.15 * Math.sin(TAU * 30 * t));
    }
    return matchPeak([o], dbToLin(-1));
  },
  metal(sr) {
    const n = Math.round(1.6 * sr), o = new Float32Array(n), R = rng(3);
    const P = [[412, 1, 3], [1013, 0.7, 4.5], [1689, 0.55, 6], [2532, 0.4, 8], [3721, 0.28, 11], [5110, 0.18, 15], [6890, 0.1, 19]];
    for (let i = 0; i < n; i++) {
      const t = i / sr; let s = 0;
      for (const [f, a, d] of P) s += a * Math.sin(TAU * f * t + f) * Math.exp(-t * d);
      o[i] = s * Math.min(1, t / 0.0008) + (R() * 2 - 1) * Math.exp(-t * 400) * 0.8;
    }
    return matchPeak([o], dbToLin(-1));
  },
  servo(sr) {
    const n = Math.round(0.9 * sr), o = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, u = i / n; ph += TAU * (95 + 40 * u + 12 * Math.sin(TAU * 2.2 * t)) / sr;
      let s = 0; for (let k = 1; k <= 14; k++) s += Math.sin(k * ph) / k;
      o[i] = s * Math.min(1, t / 0.03) * Math.min(1, (0.9 - t) / 0.12) * (1 + 0.25 * Math.sin(TAU * 47 * t));
    }
    return matchPeak([o], dbToLin(-1));
  },
  whoosh(sr) {
    const n = Math.round(1.0 * sr), R = rng(11);
    const out = [0, 1].map(() => {
      const o = new Float32Array(n); let z1 = 0, z2 = 0, co = null;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        if ((i & 31) === 0) co = biquad('bandpass', 300 * Math.pow(10, Math.sin(Math.PI * u) * 0.95), 1.4, sr);
        const x = R() * 2 - 1, y = co[0] * x + z1; z1 = co[1] * x - co[3] * y + z2; z2 = co[2] * x - co[4] * y;
        o[i] = y * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 2);
      }
      return o;
    });
    return matchPeak(out, dbToLin(-1));
  },
  footstep(sr) {
    const n = Math.round(0.38 * sr), o = new Float32Array(n), R = rng(5);
    let ph = 0, prev = 0, gate = 0, left = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += TAU * (85 + 40 * Math.exp(-t * 40)) / sr;
      const thud = Math.sin(ph) * Math.exp(-t * 30) * Math.min(1, t / 0.002);
      if (left <= 0) { gate = R() < 0.55 ? 0.3 + R() * 0.7 : 0; left = Math.round((0.002 + R() * 0.006) * sr); }
      left--;
      const w = R() * 2 - 1, hp = w - prev; prev = w;
      o[i] = thud * 0.9 + hp * gate * Math.exp(-t * 16) * Math.min(1, t / 0.004) * 0.6;
    }
    return matchPeak([o], dbToLin(-1));
  },
  subdrop(sr) {
    const n = Math.round(1.2 * sr), o = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / sr; ph += TAU * (75 * Math.pow(28 / 75, i / n)) / sr; o[i] = Math.sin(ph) * Math.exp(-t * 2.2) * Math.min(1, t / 0.003); }
    return matchPeak([o], dbToLin(-1));
  },
  noise(sr) {
    const n = Math.round(0.5 * sr), o = new Float32Array(n), R = rng(21);
    for (let i = 0; i < n; i++) { const t = i / sr; o[i] = (R() * 2 - 1) * Math.exp(-t * 9) * Math.min(1, t / 0.001); }
    return matchPeak([o], dbToLin(-1));
  },
  sweep(sr) {
    const n = Math.round(1.0 * sr), o = new Float32Array(n), f = Math.round(0.01 * sr); let ph = 0;
    for (let i = 0; i < n; i++) { ph += TAU * 150 * Math.pow(40, i / n) / sr; o[i] = Math.sin(ph) * Math.min(1, i / f, (n - 1 - i) / f); }
    return matchPeak([o], dbToLin(-1));
  },
  click(sr) {
    const n = Math.round(0.03 * sr), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; o[i] = Math.sin(TAU * 3000 * t) * Math.exp(-t * 400) + (i < 3 ? 0.8 : 0); }
    return matchPeak([o], dbToLin(-1));
  },
};
