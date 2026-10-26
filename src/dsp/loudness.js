// SPDX-License-Identifier: Apache-2.0
/** Integrated loudness per ITU-R BS.1770 (K-weighting, 400 ms blocks, absolute and relative gating). */
import { len, scale, peak, dbToLin } from './core.js';
import { runBiquad } from './filters.js';

/* ---------- loudness (ITU-R BS.1770 integrated, gated) ---------- */
export function kWeight(c, sr) {
  let K = Math.tan(Math.PI * 1681.974450955533 / sr);
  const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416), Q = 0.7071752369554196;
  let a0 = 1 + K / Q + K * K;
  const s1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  K = Math.tan(Math.PI * 38.13547087602444 / sr); const Q2 = 0.5003270373238773; a0 = 1 + K / Q2 + K * K;
  const s2 = [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q2 + K * K) / a0];
  return runBiquad(runBiquad(c, s1), s2);
}
export function lufs(chs, sr) {
  const n = len(chs); if (!n) return -Infinity;
  const pre = chs.map(c => { const k = kWeight(c, sr), p = new Float64Array(n + 1); for (let i = 0; i < n; i++) p[i + 1] = p[i] + k[i] * k[i]; return p; });
  const ms = (s, e) => pre.reduce((z, p) => z + (p[e] - p[s]) / (e - s), 0);
  const blk = Math.round(0.4 * sr), step = Math.round(0.1 * sr), blocks = [];
  if (n < blk) blocks.push(ms(0, n)); else for (let s = 0; s + blk <= n; s += step) blocks.push(ms(s, s + blk));
  const L = z => -0.691 + 10 * Math.log10(z), mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const abs = blocks.filter(z => z > 0 && L(z) > -70);
  if (!abs.length) return -Infinity;
  const rel = L(mean(abs)) - 10, gated = abs.filter(z => L(z) > rel);
  return L(mean(gated.length ? gated : abs));
}
export function loudnessNormalize(chs, sr, target, ceilDb) {
  const l = lufs(chs, sr); if (!isFinite(l)) return chs;
  let out = scale(chs, dbToLin(target - l));
  if (ceilDb != null) { const pk = peak(out), c = dbToLin(ceilDb); if (pk > c) out = scale(out, c / pk); }
  return out;
}
