// SPDX-License-Identifier: Apache-2.0
/** Two-sound combination: spectral morph, cross-synthesis, convolution, envelope transfer, ring multiply, granular weave, and the layer mixer. A and B must share sample rate and channel count (the UI converts B first). */
import { TAU, clamp, rng, len, peak, matchPeak, padTo, stretchLinear, monoAbs, follower, dbToLin } from './core.js';
import { stft, istft, smoothMag, fftConv } from './fft.js';
import { resample, varispeed } from './resample.js';

/* ---------- morphing: (A, B, sr, p) -> chs; A and B share sample rate and channel count ---------- */
export const MORPH = {
  spectral(A, B, sr, p) {
    const N = +p.fft || 2048, nA = len(A), nB = len(B), fit = !!p.fit;
    const outLen = fit ? nA : Math.max(nA, nB);
    const hybrid = p.style === 'hybrid';
    const out = A.map((a, c) => {
      const SA = stft(padTo(a, outLen), N), SB = stft(fit ? B[c] : padTo(B[c], outLen), N);
      const nF = SA.length, nFB = SB.length, Bn = N / 2 + 1;
      const frames = SA.map((X, f) => {
        const u = nF > 1 ? f / (nF - 1) : 0, t = clamp((p.t0 + (p.t1 - p.t0) * u) / 100, 0, 1);
        const Y = SB[fit ? Math.min(nFB - 1, Math.round(u * (nFB - 1))) : Math.min(nFB - 1, f)];
        const re = new Float64Array(Bn), im = new Float64Array(Bn);
        for (let k = 0; k < Bn; k++) {
          const ma = Math.hypot(X.re[k], X.im[k]), mb = Math.hypot(Y.re[k], Y.im[k]);
          const m = hybrid ? Math.exp((1 - t) * Math.log(ma + 1e-9) + t * Math.log(mb + 1e-9)) : (1 - t) * ma + t * mb;
          const ph = (1 - t) * ma >= t * mb ? Math.atan2(X.im[k], X.re[k]) : Math.atan2(Y.im[k], Y.re[k]);
          re[k] = m * Math.cos(ph); im[k] = m * Math.sin(ph);
        }
        return { re, im };
      });
      return istft(frames, N, outLen);
    });
    return matchPeak(out, Math.max(peak(A), peak(B)));
  },
  cross(A, B, sr, p) {
    const N = +p.fft || 2048, nA = len(A), amt = p.amt / 100, bw = p.smooth / 100;
    const out = A.map((a, c) => {
      const SA = stft(a, N), SB = stft(p.fit ? B[c] : padTo(B[c], nA), N);
      const nF = SA.length, nFB = SB.length, Bn = N / 2 + 1;
      const frames = SA.map((X, f) => {
        const u = nF > 1 ? f / (nF - 1) : 0;
        const Y = SB[p.fit ? Math.min(nFB - 1, Math.round(u * (nFB - 1))) : Math.min(nFB - 1, f)];
        const ma = new Float64Array(Bn), mb = new Float64Array(Bn);
        for (let k = 0; k < Bn; k++) { ma[k] = Math.hypot(X.re[k], X.im[k]); mb[k] = Math.hypot(Y.re[k], Y.im[k]); }
        const ea = smoothMag(ma, bw), eb = smoothMag(mb, bw);
        const re = new Float64Array(Bn), im = new Float64Array(Bn);
        for (let k = 0; k < Bn; k++) {
          const g = Math.min(1000, Math.pow((eb[k] + 1e-7) / (ea[k] + 1e-7), amt));
          re[k] = X.re[k] * g; im[k] = X.im[k] * g;
        }
        return { re, im };
      });
      return istft(frames, N, nA);
    });
    return matchPeak(out, peak(A));
  },
  conv(A, B, sr, p) {
    const irN = Math.max(1, Math.min(len(B), Math.round(p.irMs * sr / 1000))), fadeN = Math.min(irN, Math.round(0.005 * sr));
    const mix = p.mix / 100;
    const wet = A.map((a, c) => {
      const ir = B[c].slice(0, irN);
      for (let i = 0; i < fadeN; i++) ir[irN - 1 - i] *= i / fadeN;
      if (p.reverse) ir.reverse();
      return fftConv(a, ir);
    });
    const w = matchPeak(wet, peak(A)), L = len(w);
    return w.map((x, c) => { const o = new Float32Array(L), a = A[c]; for (let i = 0; i < L; i++) o[i] = x[i] * mix + (i < a.length ? a[i] : 0) * (1 - mix); return o; });
  },
  env(A, B, sr, p) {
    const nA = len(A), amt = p.amt / 100;
    let detB = monoAbs(B); detB = p.fit ? stretchLinear(detB, nA) : padTo(detB, nA);
    const eb = follower(detB, p.att, p.rel, sr); let mb = 0; for (let i = 0; i < nA; i++) if (eb[i] > mb) mb = eb[i];
    let flat = null;
    if (p.flatten) {
      const ea = follower(monoAbs(A), p.att, p.rel, sr); let ma = 0; for (let i = 0; i < nA; i++) if (ea[i] > ma) ma = ea[i];
      flat = new Float32Array(nA); for (let i = 0; i < nA; i++) flat[i] = ma > 0 ? 1 / (ea[i] / ma + 0.02) : 1;
    }
    const out = A.map(a => {
      const o = new Float32Array(nA);
      for (let i = 0; i < nA; i++) { const e = mb > 0 ? eb[i] / mb : 0; o[i] = a[i] * (flat ? flat[i] : 1) * (1 - amt + amt * e); }
      return o;
    });
    return matchPeak(out, peak(A));
  },
  ring(A, B, sr, p) {
    const nA = len(A), mix = p.mix / 100;
    const wet = matchPeak(A.map((a, c) => {
      const b = p.fit ? stretchLinear(B[c], nA) : padTo(B[c], nA), o = new Float32Array(nA);
      for (let i = 0; i < nA; i++) o[i] = a[i] * b[i];
      return o;
    }), peak(A));
    return A.map((a, c) => { const o = new Float32Array(nA), w = wet[c]; for (let i = 0; i < nA; i++) o[i] = a[i] * (1 - mix) + w[i] * mix; return o; });
  },
  grain(A, B, sr, p) {
    const nA = len(A), nB = len(B), nch = A.length;
    const out = Array.from({ length: nch }, () => new Float32Array(nA));
    const G = Math.max(16, Math.round(p.grain * sr / 1000)), hop = G / Math.max(1, p.overlap), R = rng(p.seed | 0);
    for (let t = 0; t < nA; t += hop * (0.6 + 0.8 * R())) {
      const u = t / nA, pB = (p.bStart + (p.bEnd - p.bStart) * u) / 100, useB = R() < pB;
      const S = useB ? B : A, sl = useB ? nB : nA;
      const sp = u * sl + (R() * 2 - 1) * p.jitter * sr / 1000;
      const rate = Math.pow(2, (R() * 2 - 1) * p.pjit / 12), rev = R() * 100 < p.rev, t0 = Math.round(t);
      if (sl < 2) continue;
      for (let i = 0; i < G && t0 + i < nA; i++) {
        const q = sp + (rev ? G - 1 - i : i) * rate;
        if (q < 0 || q >= sl - 1) continue;
        const ww = 0.5 - 0.5 * Math.cos(TAU * i / G), i0 = q | 0, f = q - i0;
        for (let k = 0; k < nch; k++) { const s = S[k]; out[k][t0 + i] += (s[i0] + (s[i0 + 1] - s[i0]) * f) * ww; }
      }
    }
    return matchPeak(out, Math.max(peak(A), peak(B)));
  },
};
/* layers: [{ch, sr, offset(ms), gain(dB), pitch(st), reverse, pan(-1..1)}] */
export function layerMix(layers, sr) {
  let nch = 1;
  for (const L of layers) if (L.ch.length > 1 || Math.abs(L.pan) > 0.001) nch = 2;
  const P = layers.map(L => {
    let c = L.ch;
    if (L.sr !== sr) c = resample(c, L.sr, sr);
    if (L.reverse) c = c.map(x => x.slice().reverse());
    if (L.pitch) c = varispeed(c, () => Math.pow(2, L.pitch / 12));
    return { c, off: Math.max(0, Math.round(L.offset * sr / 1000)), g: dbToLin(L.gain), pan: L.pan };
  });
  const total = Math.max(1, ...P.map(L => L.off + len(L.c)));
  const out = Array.from({ length: nch }, () => new Float32Array(total));
  for (const L of P) {
    const n = len(L.c);
    if (nch === 1) {
      for (const c of L.c) for (let i = 0; i < n; i++) out[0][L.off + i] += c[i] * L.g / L.c.length;
    } else if (L.c.length === 1) {
      const th = (L.pan + 1) * Math.PI / 4, gl = Math.cos(th) * Math.SQRT2 * L.g, gr = Math.sin(th) * Math.SQRT2 * L.g;
      for (let i = 0; i < n; i++) { out[0][L.off + i] += L.c[0][i] * gl; out[1][L.off + i] += L.c[0][i] * gr; }
    } else {
      const gl = (L.pan > 0 ? 1 - L.pan : 1) * L.g, gr = (L.pan < 0 ? 1 + L.pan : 1) * L.g;
      for (let i = 0; i < n; i++) { out[0][L.off + i] += L.c[0][i] * gl; out[1][L.off + i] += L.c[1][i] * gr; }
    }
  }
  return out;
}
