// SPDX-License-Identifier: Apache-2.0
// Shared test helpers. Tests run in Node with `npm test` (node:test, no browser needed).
import * as D from '../src/dsp/index.js';
export { D };
export const SR = 48000;

/** Mono sine as Channels. */
export function sine(freq, seconds, amp = 0.5, sr = SR) {
  const n = Math.round(seconds * sr), o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = amp * Math.sin(2 * Math.PI * freq * i / sr);
  return [o];
}
/** Frequency estimate from upward zero crossings, ignoring the edges. */
export function estimateFreq(c, sr = SR) {
  let z = 0; const m = Math.min(2000, Math.floor(c.length / 4));
  for (let i = m + 1; i < c.length - m; i++) if (c[i - 1] < 0 && c[i] >= 0) z++;
  return z / ((c.length - 2 * m) / sr);
}
export const finite = chs => chs.every(c => c.every(Number.isFinite));
export const examples = () => Object.fromEntries(['gunshot', 'laser', 'metal', 'servo', 'whoosh', 'footstep'].map(k => [k, D.synth[k](SR)]));
