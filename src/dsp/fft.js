// SPDX-License-Identifier: Apache-2.0
/** Radix-2 FFT, Hann-windowed STFT/ISTFT (75% overlap) and FFT convolution. */
import { TAU } from './core.js';

/* ---------- FFT / STFT ---------- */
export function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, ang = (inv ? 1 : -1) * TAU / size;
    const wr0 = Math.cos(ang), wi0 = Math.sin(ang);
    for (let i = 0; i < n; i += size) {
      let wr = 1, wi = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j, b = a + half;
        const vr = re[b] * wr - im[b] * wi, vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        const t = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const hannCache = {};
export function hann(N) {
  if (!hannCache[N]) { const w = new Float64Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(TAU * i / N); hannCache[N] = w; }
  return hannCache[N];
}
export function stft(x, N) {
  const H = N / 4, w = hann(N), B = N / 2 + 1;
  const nF = Math.max(1, Math.ceil((x.length + N - H) / H));
  const frames = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < nF; f++) {
    const s = f * H - (N - H);
    for (let i = 0; i < N; i++) { const j = s + i; re[i] = j >= 0 && j < x.length ? x[j] * w[i] : 0; im[i] = 0; }
    fft(re, im, false);
    frames.push({ re: re.slice(0, B), im: im.slice(0, B) });
  }
  return frames;
}
export function istft(frames, N, outLen) {
  const H = N / 4, w = hann(N), B = N / 2 + 1;
  const out = new Float64Array(outLen), ws = new Float64Array(outLen);
  const re = new Float64Array(N), im = new Float64Array(N);
  frames.forEach((fr, f) => {
    for (let k = 0; k < B; k++) { re[k] = fr.re[k]; im[k] = fr.im[k]; }
    for (let k = B; k < N; k++) { re[k] = fr.re[N - k]; im[k] = -fr.im[N - k]; }
    fft(re, im, true);
    const s = f * H - (N - H);
    for (let i = 0; i < N; i++) { const j = s + i; if (j >= 0 && j < outLen) { out[j] += re[i] * w[i]; ws[j] += w[i] * w[i]; } }
  });
  const o = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) o[i] = out[i] / Math.max(ws[i], 0.1);
  return o;
}
export function smoothMag(m, bw) {
  const n = m.length, ps = new Float64Array(n + 1), e = new Float64Array(n);
  for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + m[i];
  for (let k = 0; k < n; k++) {
    const w = Math.max(1, Math.round(k * bw)), lo = Math.max(0, k - w), hi = Math.min(n - 1, k + w);
    e[k] = (ps[hi + 1] - ps[lo]) / (hi - lo + 1);
  }
  return e;
}
export function fftConv(a, b) {
  const L = a.length + b.length - 1;
  let n = 1; while (n < L) n <<= 1;
  if (n > (1 << 23)) throw new Error('These sounds are too long to convolve. Shorten A or lower "B length used".');
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(a); br.set(b);
  fft(ar, ai, false); fft(br, bi, false);
  for (let i = 0; i < n; i++) { const r = ar[i] * br[i] - ai[i] * bi[i]; ai[i] = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; }
  fft(ar, ai, true);
  const o = new Float32Array(L); for (let i = 0; i < L; i++) o[i] = ar[i];
  return o;
}
