// SPDX-License-Identifier: Apache-2.0
/** Band-limited resampling with a windowed-sinc kernel. Used for varispeed (tape-style pitch) and sample-rate conversion. */
import { len, copy } from './core.js';

/* ---------- band-limited resampling (windowed sinc) ---------- */
const HW = 12, RES = 512, K = new Float32Array(HW * RES + 2);
for (let i = 0; i < K.length; i++) {
  const x = i / RES;
  if (x >= HW) { K[i] = 0; continue; }
  const s = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
  const u = x / HW;
  K[i] = s * (0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u));
}
export function sincAt(src, pos, c) {
  const n = src.length, span = HW / c;
  const lo = Math.max(0, Math.ceil(pos - span)), hi = Math.min(n - 1, Math.floor(pos + span));
  let sum = 0;
  for (let j = lo; j <= hi; j++) {
    const fi = Math.abs(pos - j) * c * RES, i0 = fi | 0;
    if (i0 >= HW * RES) continue;
    sum += src[j] * (K[i0] + (K[i0 + 1] - K[i0]) * (fi - i0));
  }
  return sum * c;
}
/* rateAt(u) gives playback rate at input progress u (0..1). Pitch and length change together. */
export function varispeed(chs, rateAt) {
  const n = len(chs);
  if (!n) return copy(chs);
  const pos = [], cut = [];
  let p = 0, guard = 0;
  while (p <= n - 1) {
    const r = Math.max(0.03, rateAt(p / n));
    pos.push(p); cut.push(Math.min(1, 1 / r));
    p += r;
    if (++guard > n * 40) break;
  }
  return chs.map(c => {
    const o = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i++) {
      const ps = pos[i];
      o[i] = (cut[i] === 1 && ps === Math.floor(ps)) ? c[ps] : sincAt(c, ps, cut[i]);
    }
    return o;
  });
}
export function resample(chs, srIn, srOut) {
  if (srIn === srOut) return copy(chs);
  const r = srIn / srOut;
  return varispeed(chs, () => r);
}
