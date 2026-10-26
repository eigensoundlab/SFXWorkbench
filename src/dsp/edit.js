// SPDX-License-Identifier: Apache-2.0
/** Take detection (slicing), extraction with fades, zero-crossing snap and seamless loop building. */
import { len, dbToLin, monoAbs, follower } from './core.js';

/* ---------- slicing and loops ---------- */
export function detectSlices(chs, sr, p) {
  const env = follower(monoAbs(chs), 1, 15, sr), thr = dbToLin(p.thr), n = env.length;
  const gap = Math.round(p.gap * sr / 1000), minL = Math.round(p.minLen * sr / 1000), pre = Math.round(p.pre * sr / 1000), tail = Math.round(p.tail * sr / 1000);
  const raw = []; let s = -1;
  for (let i = 0; i < n; i++) { const on = env[i] > thr; if (on && s < 0) s = i; else if (!on && s >= 0) { raw.push([s, i]); s = -1; } }
  if (s >= 0) raw.push([s, n]);
  const merged = [];
  for (const r of raw) { const last = merged[merged.length - 1]; if (last && r[0] - last[1] < gap) last[1] = r[1]; else merged.push(r.slice()); }
  const out = [];
  for (const [a, b] of merged) if (b - a >= minL) out.push({ a: Math.max(0, a - pre), b: Math.min(n, b + tail) });
  for (let i = 1; i < out.length; i++) if (out[i].a < out[i - 1].b) out[i - 1].b = out[i].a;
  return out.filter(r => r.b - r.a > 8);
}
export function extract(chs, a, b, fadeMs, sr) {
  const L = b - a, out = chs.map(c => c.slice(a, b));
  const fi = Math.min(Math.round(0.001 * sr), L >> 2), fo = Math.min(Math.round(fadeMs * sr / 1000), L >> 1);
  for (const c of out) { for (let i = 0; i < fi; i++) c[i] *= i / fi; for (let i = 0; i < fo; i++) c[L - 1 - i] *= Math.sin(Math.PI / 2 * i / fo); }
  return out;
}
export function zeroSnap(mono, i, radius) {
  let best = i, bd = Infinity;
  for (let j = Math.max(1, i - radius); j <= Math.min(mono.length - 1, i + radius); j++) if (mono[j - 1] <= 0 && mono[j] > 0) { const d = Math.abs(j - i); if (d < bd) { bd = d; best = j; } }
  return best;
}
/* Seamless loop of [a,b). Uses audio before a (or after b) for the crossfade so the loop keeps its length when it can. */
export function makeLoop(chs, a, b, xf, shape) {
  const n = len(chs), L = b - a; xf = Math.min(Math.round(xf), Math.floor(L / 2));
  const gi = shape === 'linear' ? u => u : u => Math.sin(u * Math.PI / 2), go = shape === 'linear' ? u => 1 - u : u => Math.cos(u * Math.PI / 2);
  if (xf < 1) return { method: 'none', ch: chs.map(c => c.slice(a, b)) };
  if (a >= xf) return { method: 'pre', ch: chs.map(c => { const o = c.slice(a, b); for (let i = 0; i < xf; i++) { const u = (i + 0.5) / xf; o[L - xf + i] = c[b - xf + i] * go(u) + c[a - xf + i] * gi(u); } return o; }) };
  if (n - b >= xf) return { method: 'post', ch: chs.map(c => { const o = c.slice(a, b); for (let i = 0; i < xf; i++) { const u = (i + 0.5) / xf; o[i] = c[a + i] * gi(u) + c[b + i] * go(u); } return o; }) };
  return { method: 'internal', ch: chs.map(c => { const M = L - xf, o = new Float32Array(M); for (let i = 0; i < M; i++) o[i] = c[a + i]; for (let i = 0; i < xf; i++) { const u = (i + 0.5) / xf; o[i] = c[a + i] * gi(u) + c[a + M + i] * go(u); } return o; }) };
}
