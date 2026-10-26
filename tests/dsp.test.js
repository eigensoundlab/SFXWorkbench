// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, sine, estimateFreq, finite, examples } from './helpers.js';

const ex = examples();

test('example sounds are finite and normalised to -1 dBFS', () => {
  for (const [k, v] of Object.entries(ex)) {
    assert.ok(finite(v), k);
    assert.ok(Math.abs(D.peak(v) - D.dbToLin(-1)) < 1e-3, k);
  }
});

test('varispeed +12 st halves length and doubles frequency', () => {
  const r = D.FX.pitch(sine(440, 1), SR, { st: 12 });
  assert.ok(Math.abs(r[0].length - SR / 2) < 3);
  assert.ok(Math.abs(estimateFreq(r[0]) - 880) < 4);
});

test('resample changes length by the rate ratio', () => {
  const r = D.resample(ex.laser, 48000, 44100);
  assert.ok(Math.abs(r[0].length - Math.round(ex.laser[0].length * 44100 / 48000)) < 3);
});

test('STFT then ISTFT reconstructs the signal', () => {
  const x = ex.metal[0], y = D.istft(D.stft(x, 2048), 2048, x.length);
  let e = 0; for (let i = 0; i < x.length; i++) e = Math.max(e, Math.abs(x[i] - y[i]));
  assert.ok(e < 1e-4, `error ${e}`);
});

test('effects never mutate their input', () => {
  const src = ex.gunshot.map(c => c.slice());
  D.processChain({ sr: SR, ch: src }, [{ type: 'reverse', on: true, p: {} }, { type: 'gain', on: true, p: { db: -6 } }]);
  assert.deepEqual(Array.from(src[0].subarray(0, 100)), Array.from(ex.gunshot[0].subarray(0, 100)));
});

test('morph modes return finite, non-silent audio for mono and stereo', () => {
  const p = {
    spectral: { t0: 0, t1: 100, style: 'hybrid', fit: true, fft: 2048 }, cross: { amt: 100, smooth: 8, fit: true, fft: 2048 },
    conv: { irMs: 600, reverse: false, mix: 100 }, env: { amt: 100, att: 1, rel: 60, flatten: true, fit: true },
    ring: { mix: 100, fit: true }, grain: { grain: 60, overlap: 3, bStart: 30, bEnd: 70, jitter: 20, pjit: 2, rev: 10, seed: 1 },
  };
  for (const [k, prm] of Object.entries(p)) {
    const mono = D.MORPH[k](ex.servo, D.mapChannels(ex.gunshot, 1), SR, prm);
    assert.ok(finite(mono) && D.peak(mono) > 0.1, k);
    const st = D.MORPH[k](ex.gunshot, D.mapChannels(ex.whoosh, 2), SR, prm);
    assert.equal(st.length, 2, k);
  }
});

test('layer mix offsets, resamples and pans', () => {
  const r = D.layerMix([
    { ch: ex.whoosh, sr: SR, offset: 0, gain: -10, pitch: 0, reverse: true, pan: 0 },
    { ch: ex.metal, sr: 44100, offset: 900, gain: -8, pitch: -5, reverse: false, pan: -0.3 },
  ], SR);
  assert.equal(r.length, 2);
  assert.ok(r[0].length > 0.9 * SR + ex.metal[0].length);
});
