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

/** Minimal AIFF/AIFC writer for tests: big-endian PCM, 'sowt' little-endian PCM or 'fl32'. */
function aiff(ch, sr, bits, comp = null) {
  const nc = ch.length, n = ch[0].length, bps = comp === 'fl32' ? 4 : bits / 8, data = n * nc * bps;
  const commSize = comp ? 24 : 18, size = 4 + 8 + commSize + 8 + 8 + data;
  const buf = new ArrayBuffer(8 + size), dv = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'FORM'); dv.setUint32(4, size); w(8, comp ? 'AIFC' : 'AIFF');
  w(12, 'COMM'); dv.setUint32(16, commSize); dv.setUint16(20, nc); dv.setUint32(22, n); dv.setUint16(26, comp === 'fl32' ? 32 : bits);
  const e = Math.floor(Math.log2(sr)); dv.setUint16(28, e + 16383); dv.setUint32(30, Math.round(sr / 2 ** (e - 31)) >>> 0); dv.setUint32(34, 0);
  if (comp) { w(38, comp); dv.setUint16(42, 0); }
  let p = 20 + commSize; w(p, 'SSND'); dv.setUint32(p + 4, 8 + data); dv.setUint32(p + 8, 0); dv.setUint32(p + 12, 0); p += 16;
  const little = comp === 'sowt', q = 2 ** (bits - 1);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const v = ch[c][i];
    if (comp === 'fl32') dv.setFloat32(p, v);
    else if (bps === 2) dv.setInt16(p, Math.round(v * q), little);
    else { const x = Math.round(v * q) & 0xFFFFFF; if (little) { dv.setUint8(p, x & 255); dv.setUint8(p + 1, (x >> 8) & 255); dv.setUint8(p + 2, x >> 16); } else { dv.setUint8(p, x >> 16); dv.setUint8(p + 1, (x >> 8) & 255); dv.setUint8(p + 2, x & 255); } }
    p += bps;
  }
  return buf;
}

test('AIFF and AIFF-C decode to the same samples, rate and bit depth', () => {
  for (const [bits, comp, sr] of [[16, null, 44100], [24, null, 48000], [16, 'sowt', 96000], [24, 'sowt', 48000], [32, 'fl32', 44100]]) {
    const q = 2 ** ((comp === 'fl32' ? 24 : bits) - 1);
    const grid = gunshot.map(c => c.map(v => Math.round(v * q) / q));
    const dec = D.decodeAudioFile(aiff(grid, sr, bits, comp));
    assert.equal(dec.sr, sr, `${bits} ${comp} rate`);
    assert.equal(dec.bits, bits);
    assert.equal(dec.ch.length, 2);
    const err = Math.max(...dec.ch.map((c, k) => c.reduce((m, v, i) => Math.max(m, Math.abs(v - grid[k][i])), 0)));
    assert.ok(err < 1e-6, `${bits}-bit ${comp || 'AIFF'} error ${err}`);
  }
  assert.equal(D.decodeAiff(new Uint8Array(16).buffer), null);
});
