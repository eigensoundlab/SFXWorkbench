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
