// SPDX-License-Identifier: Apache-2.0
/** Biquad filters (RBJ Audio EQ Cookbook). Coefficient arrays are [b0, b1, b2, a1, a2], normalised by a0. */
import { TAU, clamp } from './core.js';

/* ---------- filters ---------- */
export function biquad(type, f, q, sr) {
  const w = TAU * clamp(f, 5, sr * 0.49) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2;
  if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
  else if (type === 'bandpass') { b0 = al; b1 = 0; b2 = -al; }
  else { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
  const a0 = 1 + al;
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * cs) / a0, (1 - al) / a0];
}

/* ---------- EQ ---------- */
export function biquadG(type, f, q, gainDb, sr) {
  const A = Math.pow(10, gainDb / 40), w = TAU * clamp(f, 5, sr * 0.49) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peaking') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else if (type === 'lowshelf') { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s); a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s; }
  else { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s); a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
export function runBiquad(c, co) {
  const o = new Float32Array(c.length); let z1 = 0, z2 = 0;
  for (let i = 0; i < c.length; i++) { const x = c[i], y = co[0] * x + z1; z1 = co[1] * x - co[3] * y + z2; z2 = co[2] * x - co[4] * y; o[i] = y; }
  return o;
}
