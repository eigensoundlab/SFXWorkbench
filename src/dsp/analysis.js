// SPDX-License-Identifier: Apache-2.0
/** Analysis for display: log-frequency spectrogram in dBFS. */
import { monoMix } from './core.js';
import { fft, hann } from './fft.js';

/* ---------- spectrogram (log frequency) ---------- */
export function spectrogram(chs, sr, cols, rows) {
  const x = monoMix(chs), n = x.length, N = 2048, w = hann(N), re = new Float64Array(N), im = new Float64Array(N), B = N / 2;
  const out = new Float32Array(cols * rows), nyq = sr / 2, fmin = 30, binOf = new Int32Array(rows);
  for (let r = 0; r < rows; r++) binOf[r] = Math.min(B, Math.max(1, Math.round(fmin * Math.pow(nyq / fmin, 1 - (r + 0.5) / rows) / nyq * B)));
  for (let c = 0; c < cols; c++) {
    const s = Math.round((c + 0.5) / cols * n) - N / 2;
    for (let i = 0; i < N; i++) { const j = s + i; re[i] = j >= 0 && j < n ? x[j] * w[i] : 0; im[i] = 0; }
    fft(re, im, false);
    for (let r = 0; r < rows; r++) { const k = binOf[r]; out[c * rows + r] = 20 * Math.log10(Math.hypot(re[k], im[k]) / (N / 4) + 1e-9); }
  }
  return out;
}
