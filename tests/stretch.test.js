// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, sine, estimateFreq, finite, examples } from './helpers.js';

const { gunshot } = examples();

for (const method of ['wsola', 'pv', 'smear']) {
  test(`time-stretch (${method}) hits the target length and keeps pitch`, () => {
    for (const f of [0.5, 1.7, 4]) {
      const r = D.timeStretch(gunshot, SR, f, method, 40);
      assert.ok(finite(r));
      assert.ok(Math.abs(r[0].length - Math.round(gunshot[0].length * f)) < 2, `length x${f}`);
      const s = D.timeStretch(sine(440, 1), SR, f, method, 40);
      assert.ok(Math.abs(estimateFreq(s[0]) - 440) < 3, `pitch x${f}: ${estimateFreq(s[0])}`);
    }
  });
}

test('pitch shift keeps length and moves frequency', () => {
  for (const st of [-12, -5, 7]) {
    const r = D.pitchShift(sine(440, 1), SR, st, 'wsola', 40);
    assert.equal(r[0].length, SR);
    const want = 440 * 2 ** (st / 12);
    assert.ok(Math.abs(estimateFreq(r[0]) - want) < want * 0.01, `${st} st`);
  }
});

test('stretch effect: fit to exact length and keep attack', () => {
  const fit = D.FX.stretch(gunshot, SR, { factor: 2, fit: true, length: 500, method: 'wsola', win: 40, keep: 30 });
  assert.ok(Math.abs(fit[0].length - SR / 2) < 3);
  const keep = D.FX.stretch(gunshot, SR, { factor: 2, fit: false, method: 'wsola', win: 40, keep: 30 });
  const k = Math.round(0.03 * SR);
  assert.deepEqual(Array.from(keep[0].subarray(0, k)), Array.from(gunshot[0].subarray(0, k)));
});

// three hits (noise and a low partial, each decaying) at 0.1, 0.4 and 0.7 s
function hits(sr = SR) {
  const x = new Float32Array(sr); let s = 5;
  for (const t0 of [0.1, 0.4, 0.7]) {
    const o = Math.round(t0 * sr);
    for (let i = 0; i < 0.25 * sr && o + i < sr; i++) { s = (s * 16807) % 2147483647; x[o + i] += 0.8 * (s / 2147483647 * 2 - 1) * Math.exp(-i / (0.03 * sr)) + 0.3 * Math.sin(2 * Math.PI * 90 * i / sr) * Math.exp(-i / (0.08 * sr)); }
  }
  return [x];
}
test('stretch keeping every attack: hits land at onset x factor, as they were', () => {
  const x = hits();
  for (const f of [2, 0.5, 4, 0.2]) {
    const y = D.stretchAttacks(x, SR, f);
    assert.ok(finite(y));
    assert.equal(y[0].length, Math.round(SR * f));
    const on = D.layerOnsets(y, SR).map(i => i / SR);
    assert.equal(on.length, 3, `x${f}: ${on}`);
    [0.1, 0.4, 0.7].forEach((t, i) => assert.ok(Math.abs(on[i] - t * f) < 0.005, `x${f}: onset ${i} at ${on[i]}, want ${t * f}`));
    // the second attack is copied sample for sample (its first 25 ms)
    const o = Math.round(0.4 * SR), w = Math.round(0.4 * f * SR);
    for (let i = 0; i < Math.round(0.025 * SR); i++) assert.equal(y[0][w + i], x[0][o + i]);
  }
  // a plain stretch moves the hits (x4: tens of ms early) and loses some of them when shrinking hard
  const plain = D.layerOnsets(D.timeStretch(x, SR, 0.2, 'wsola', 40), SR);
  assert.ok(plain.length < 3);
});
test('stretch keeping every attack: no clicks at the joins, given onsets are used', () => {
  const x = new Float32Array(SR);
  for (const t0 of [0.1, 0.4, 0.7]) { const o = Math.round(t0 * SR); for (let i = 0; i < 0.29 * SR && o + i < SR; i++) x[o + i] += Math.min(1, i / (0.002 * SR)) * Math.exp(-i / (0.1 * SR)) * (0.5 * Math.sin(2 * Math.PI * 90 * i / SR) + 0.3 * Math.sin(2 * Math.PI * 410 * i / SR)); }
  const step = c => { let m = 0; for (let i = 1; i < c.length; i++) m = Math.max(m, Math.abs(c[i] - c[i - 1])); return m; };
  for (const f of [0.3, 1.3, 3]) assert.ok(step(D.stretchAttacks([x], SR, f)[0]) <= step(x) * 1.05, `x${f}`);
  // onsets given (as from Playhead): only those attacks are kept, the rest is stretched
  const y = D.stretchAttacks(hits(), SR, 2, { onsets: [Math.round(0.4 * SR)] }), on = D.layerOnsets(y, SR).map(i => i / SR);
  assert.ok(on.some(t => Math.abs(t - 0.8) < 0.003));
});
test('stretch effect: keep every attack, fit, and onsets from the chain while the timing is the source\'s', () => {
  const x = hits(), p = { factor: 2, fit: false, length: 1500, method: 'wsola', win: 40, attacks: true, attack: 30, keep: 0 };
  assert.equal(D.FX.stretch(x, SR, { ...p, fit: true })[0].length, Math.round(1.5 * SR));
  const ctx = { onsets: [Math.round(0.4 * SR)] }, chain = (pre) => pre.concat([{ type: 'stretch', on: true, p }]);
  const first = D.processChain({ sr: SR, ch: x }, chain([]), ctx).ch, plain = D.processChain({ sr: SR, ch: x }, chain([]), null).ch;
  assert.notDeepEqual(Array.from(first[0]), Array.from(plain[0]), 'given onsets change the result');
  // after a speed change the source's onsets no longer hold: the stretch finds its own
  const sped = [{ type: 'pitch', on: true, p: { st: 2, sweep: false, end: 0, curve: 'lin' } }];
  const a = D.processChain({ sr: SR, ch: x }, chain(sped), ctx).ch, b = D.processChain({ sr: SR, ch: x }, chain(sped), null).ch;
  assert.deepEqual(Array.from(a[0]), Array.from(b[0]));
});
