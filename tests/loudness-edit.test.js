// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, sine, finite, examples } from './helpers.js';

const ex = examples();

test('BS.1770 reference: 997 Hz at -20 dBFS reads -23.0 LUFS mono, -20.0 stereo', () => {
  const [s] = sine(997, 3, 0.1);
  assert.ok(Math.abs(D.lufs([s], SR) + 23.0) < 0.1);
  assert.ok(Math.abs(D.lufs([s, s], SR) + 20.0) < 0.1);
});

test('loudness normalize respects the peak ceiling', () => {
  const r = D.loudnessNormalize(ex.gunshot, SR, -10, -1);
  assert.ok(D.peak(r) <= D.dbToLin(-1) + 1e-6);
});

test('detectSlices finds every take', () => {
  const f = ex.footstep[0], gap = Math.round(0.3 * SR), o = new Float32Array(5 * (f.length + gap));
  for (let k = 0; k < 5; k++) o.set(f, k * (f.length + gap));
  const s = D.detectSlices([o], SR, { thr: -40, gap: 120, minLen: 40, pre: 3, tail: 40 });
  assert.equal(s.length, 5);
});

test('loops are seamless for all three crossfade methods', () => {
  const s = ex.servo, n = s[0].length;
  for (const [a, b, method] of [[20000, 40000, 'pre'], [100, 30000, 'post'], [100, n - 10, 'internal']]) {
    const L = D.makeLoop(s, a, b, 0.08 * SR, 'power');
    assert.equal(L.method, method);
    const c = L.ch[0];
    assert.ok(Math.abs(c[c.length - 1] - c[0]) < 0.02, `${method} seam`);
  }
});

test('generator renders every waveform finite at -1 dBFS', () => {
  const p = { wave: 'square', duty: 30, fmRatio: 2, fmIndex: 3, noise: 10, seed: 3, f0: 400, f1: 1200, curve: 'late', stepAt: 40, stepSt: 7,
    vibDepth: 0.5, vibRate: 6, repeat: 120, att: 5, hold: 300, rel: 300, shape: 2, punch: 40, lp0: 12000, lp1: 3000, res: 1.5, hp: 60 };
  for (const wave of ['sine', 'triangle', 'square', 'saw', 'fm', 'sh', 'pink', 'white']) {
    const r = D.synthGen({ ...p, wave }, SR);
    assert.ok(finite(r) && Math.abs(D.peak(r) - D.dbToLin(-1)) < 1e-3, wave);
  }
});

test('spectrogram has the requested size and finite values', () => {
  const sp = D.spectrogram(ex.gunshot, SR, 200, 64);
  assert.equal(sp.length, 200 * 64);
  assert.ok(sp.every(Number.isFinite));
});
