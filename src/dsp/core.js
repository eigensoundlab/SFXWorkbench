// SPDX-License-Identifier: Apache-2.0
/**
 * Core helpers shared by all DSP modules.
 * Audio is always a list of channels: Float32Array[] (see types.js). Functions never mutate their input.
 */

export const TAU = Math.PI * 2;
export const dbToLin = db => Math.pow(10, db / 20);
export const linToDb = x => 20 * Math.log10(Math.max(x, 1e-12));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const len = chs => (chs && chs[0] ? chs[0].length : 0);
export function peak(chs) {
  let m = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > m) m = v; }
  return m;
}
export function scale(chs, g) {
  return chs.map(c => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] * g; return o; });
}
export const copy = chs => chs.map(c => c.slice());
export function matchPeak(chs, target) { const p = peak(chs); return p > 0 ? scale(chs, target / p) : chs; }
export function mapChannels(chs, n) {
  if (chs.length === n) return chs;
  if (n === 1) {
    const L = len(chs), o = new Float32Array(L);
    for (const c of chs) for (let i = 0; i < L; i++) o[i] += c[i] / chs.length;
    return [o];
  }
  const out = [];
  for (let k = 0; k < n; k++) out.push(chs[k % chs.length].slice());
  return out;
}
export function padTo(c, n) {
  if (c.length === n) return c;
  const o = new Float32Array(n); o.set(c.subarray(0, Math.min(n, c.length))); return o;
}
export function stretchLinear(c, n) {
  const o = new Float32Array(n), m = c.length;
  if (!m || !n) return o;
  if (n === 1) { o[0] = c[0]; return o; }
  const r = (m - 1) / (n - 1);
  for (let i = 0; i < n; i++) { const p = i * r, i0 = Math.floor(p), i1 = Math.min(m - 1, i0 + 1); o[i] = c[i0] + (c[i1] - c[i0]) * (p - i0); }
  return o;
}
export function trimTail(chs, minLen = 0, thr = 1e-4) {
  const n = len(chs); let last = -1;
  for (const c of chs) for (let i = n - 1; i > last; i--) if (Math.abs(c[i]) > thr) { last = i; break; }
  const end = Math.max(minLen, Math.min(n, last + 1 + 256));
  if (end >= n) return chs;
  const out = chs.map(c => c.slice(0, end));
  const f = Math.min(256, end);
  for (const c of out) for (let i = 0; i < f; i++) c[end - 1 - i] *= i / f;
  return out;
}
export function monoAbs(chs) {
  const n = len(chs), o = new Float32Array(n);
  for (const c of chs) for (let i = 0; i < n; i++) { const v = Math.abs(c[i]); if (v > o[i]) o[i] = v; }
  return o;
}
export function follower(x, attMs, relMs, sr) {
  const a = Math.exp(-1 / Math.max(1e-3, attMs * sr / 1000)), r = Math.exp(-1 / Math.max(1e-3, relMs * sr / 1000));
  const o = new Float32Array(x.length); let e = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i]; e = v > e ? a * e + (1 - a) * v : r * e + (1 - r) * v; o[i] = e; }
  return o;
}
export function dcBlock(c, sr) {
  const o = new Float32Array(c.length), R = Math.exp(-TAU * 10 / sr); let x1 = 0, y1 = 0;
  for (let i = 0; i < c.length; i++) { const y = c[i] - x1 + R * y1; x1 = c[i]; y1 = y; o[i] = y; }
  return o;
}

/** Mono mix (average) of all channels. May return the input array itself for mono input: treat it as read-only. */
export const monoMix = chs => mapChannels(chs, 1)[0];
