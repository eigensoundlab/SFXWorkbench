// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, examples } from './helpers.js';

const { gunshot } = examples();

test('PCM round trip is bit-exact for 8, 16, 24 and 32-bit', () => {
  for (const bits of [8, 16, 24, 32]) {
    const q = 2 ** (bits - 1);
    const grid = gunshot.map(c => c.map(v => Math.round(v * q) / q));
    const dec = D.decodeWav(D.encodeWav(grid, SR, bits, false).buffer);
    assert.equal(dec.sr, SR); assert.equal(dec.bits, bits); assert.equal(dec.isFloat, false); assert.equal(dec.ch.length, 2);
    const err = Math.max(...dec.ch.map((c, k) => c.reduce((m, v, i) => Math.max(m, Math.abs(v - grid[k][i])), 0)));
    assert.ok(err < 1e-6, `${bits}-bit error ${err}`);
  }
});

test('32-bit float round trip keeps samples exactly', () => {
  const dec = D.decodeWav(D.encodeWav(gunshot, 44100, 32, true).buffer);
  assert.equal(dec.isFloat, true); assert.equal(dec.sr, 44100);
  assert.deepEqual(Array.from(dec.ch[1].subarray(0, 500)), Array.from(gunshot[1].subarray(0, 500)));
});

test('non-WAV data returns null; malformed WAV throws a readable error', () => {
  assert.equal(D.decodeWav(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).buffer), null);
  const bad = D.encodeWav(gunshot, SR, 16, false).slice(0, 36); // header without data chunk
  assert.throws(() => D.decodeWav(bad.buffer), /no readable audio/);
});

test('zip writes a valid archive with central directory and CRCs', () => {
  const files = [{ name: 'a.wav', data: new Uint8Array([1, 2, 3]) }, { name: 'b.wav', data: new Uint8Array(1000).fill(7) }];
  const z = D.zip(files), dv = new DataView(z.buffer);
  const end = z.length - 22;
  assert.equal(dv.getUint32(end, true), 0x06054b50);
  assert.equal(dv.getUint16(end + 10, true), 2);
  assert.equal(dv.getUint32(14, true), D.crc32(files[0].data));
  assert.equal(D.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});
