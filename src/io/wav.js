// SPDX-License-Identifier: Apache-2.0
/** WAV decode/encode. Decoding keeps sample rate, channels and bit depth; encoding writes PCM 8/16/24/32-bit or 32-bit float, with TPDF dither only when reducing to 16 bits or less. */
import { rng, len } from '../dsp/core.js';

/* ---------- WAV I/O ---------- */
export function decodeWav(buf) {
  const dv = new DataView(buf);
  const tag = o => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (dv.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let p = 12, fmt = null, data = null;
  while (p + 8 <= dv.byteLength) {
    const id = tag(p); let size = dv.getUint32(p + 4, true); const body = p + 8;
    if (id === 'fmt ') {
      let format = dv.getUint16(body, true);
      const channels = dv.getUint16(body + 2, true), sr = dv.getUint32(body + 4, true), block = dv.getUint16(body + 12, true), bits = dv.getUint16(body + 14, true);
      if (format === 0xFFFE && size >= 26) format = dv.getUint16(body + 24, true);
      fmt = { format, channels, sr, block, bits };
    } else if (id === 'data') {
      if (size === 0 || size === 0xFFFFFFFF || body + size > dv.byteLength) size = dv.byteLength - body;
      data = { off: body, size };
    }
    p = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('This WAV file has no readable audio data.');
  const { format, channels: nc, sr } = fmt;
  if (format !== 1 && format !== 3) throw new Error('Unsupported WAV encoding (format ' + format + '). Save it as PCM or float WAV.');
  const bps = Math.max(1, Math.floor(fmt.block / nc)) || fmt.bits / 8, bits = bps * 8;
  if (!(format === 3 ? (bps === 4 || bps === 8) : [1, 2, 3, 4].includes(bps))) throw new Error('Unsupported bit depth: ' + fmt.bits + '-bit.');
  const frames = Math.floor(data.size / (bps * nc));
  const ch = Array.from({ length: nc }, () => new Float32Array(frames));
  let o = data.off;
  for (let i = 0; i < frames; i++) for (let c = 0; c < nc; c++) {
    let v;
    if (format === 3) v = bps === 8 ? dv.getFloat64(o, true) : dv.getFloat32(o, true);
    else if (bps === 1) v = (dv.getUint8(o) - 128) / 128;
    else if (bps === 2) v = dv.getInt16(o, true) / 32768;
    else if (bps === 3) { let x = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16); if (x & 0x800000) x |= ~0xFFFFFF; v = x / 8388608; }
    else v = dv.getInt32(o, true) / 2147483648;
    ch[c][i] = v; o += bps;
  }
  return { sr, ch, bits: format === 3 ? 32 : bits, isFloat: format === 3 };
}
export function onGrid(ch, q) {
  for (const c of ch) for (let i = 0; i < c.length; i++) { const v = c[i] * q; if (v !== Math.round(v)) return false; }
  return true;
}
export function encodeWav(ch, sr, bits, isFloat) {
  const nc = ch.length, n = len(ch), bps = isFloat ? 4 : bits / 8, block = nc * bps, dataSize = n * block;
  const header = 12 + 24 + (isFloat ? 12 : 0) + 8;
  const buf = new ArrayBuffer(header + dataSize + (dataSize & 1)), dv = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, buf.byteLength - 8, true); ws(8, 'WAVE');
  ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, isFloat ? 3 : 1, true); dv.setUint16(22, nc, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * block, true); dv.setUint16(32, block, true); dv.setUint16(34, bps * 8, true);
  let p = 36;
  if (isFloat) { ws(p, 'fact'); dv.setUint32(p + 4, 4, true); dv.setUint32(p + 8, n, true); p += 12; }
  ws(p, 'data'); dv.setUint32(p + 4, dataSize, true); p += 8;
  const q = Math.pow(2, bps * 8 - 1), R = rng(90210);
  const dither = !isFloat && bps <= 2 && !onGrid(ch, q);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const x = ch[c][i];
    if (isFloat) dv.setFloat32(p, x, true);
    else {
      let v = Math.round(x * q + (dither ? R() - R() : 0));
      v = v < -q ? -q : v > q - 1 ? q - 1 : v;
      if (bps === 1) dv.setUint8(p, v + 128);
      else if (bps === 2) dv.setInt16(p, v, true);
      else if (bps === 3) { dv.setUint8(p, v & 255); dv.setUint8(p + 1, (v >> 8) & 255); dv.setUint8(p + 2, (v >> 16) & 255); }
      else dv.setInt32(p, v, true);
    }
    p += bps;
  }
  return new Uint8Array(buf);
}

/** IEEE 754 80-bit extended float (AIFF sample rate), big-endian. */
function readExtended(dv, o) {
  const se = dv.getUint16(o), hi = dv.getUint32(o + 2), lo = dv.getUint32(o + 6);
  const sign = se & 0x8000 ? -1 : 1, exp = se & 0x7fff;
  if (!exp && !hi && !lo) return 0;
  return sign * (hi * 2 ** (exp - 16383 - 31) + lo * 2 ** (exp - 16383 - 63));
}

/**
 * Decode AIFF / AIFF-C (uncompressed PCM, 'sowt' little-endian PCM, 32/64-bit float).
 * Returns null if the data is not AIFF, like decodeWav.
 */
export function decodeAiff(buf) {
  const dv = new DataView(buf);
  const tag = o => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (dv.byteLength < 12 || tag(0) !== 'FORM' || !['AIFF', 'AIFC'].includes(tag(8))) return null;
  let p = 12, comm = null, ssnd = null;
  while (p + 8 <= dv.byteLength) {
    const id = tag(p), size = dv.getUint32(p + 4), body = p + 8;
    if (id === 'COMM') {
      comm = { nc: dv.getUint16(body), frames: dv.getUint32(body + 2), bits: dv.getUint16(body + 6), sr: Math.round(readExtended(dv, body + 8)), comp: size >= 22 ? tag(body + 18) : 'NONE' };
    } else if (id === 'SSND') {
      ssnd = { off: body + 8 + dv.getUint32(body), end: Math.min(dv.byteLength, body + size) };
    }
    p = body + size + (size & 1);
  }
  if (!comm || !ssnd) throw new Error('This AIFF file has no readable audio data.');
  const comp = comm.comp.toLowerCase(), isFloat = comp === 'fl32' || comp === 'fl64', little = comp === 'sowt';
  if (!['none', 'sowt', 'fl32', 'fl64', 'twos'].includes(comp)) throw new Error(`Unsupported AIFF-C compression "${comm.comp}". Save it as uncompressed AIFF or WAV.`);
  const bps = isFloat ? (comp === 'fl64' ? 8 : 4) : Math.ceil(comm.bits / 8), nc = comm.nc;
  const frames = Math.min(comm.frames, Math.floor((ssnd.end - ssnd.off) / (bps * nc)));
  const ch = Array.from({ length: nc }, () => new Float32Array(frames));
  let o = ssnd.off;
  for (let i = 0; i < frames; i++) for (let c = 0; c < nc; c++) {
    let v;
    if (isFloat) v = bps === 8 ? dv.getFloat64(o, little) : dv.getFloat32(o, little);
    else if (bps === 1) v = dv.getInt8(o) / 128;
    else if (bps === 2) v = dv.getInt16(o, little) / 32768;
    else if (bps === 3) {
      let x = little ? dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16) : (dv.getUint8(o) << 16) | (dv.getUint8(o + 1) << 8) | dv.getUint8(o + 2);
      if (x & 0x800000) x |= ~0xFFFFFF;
      v = x / 8388608;
    } else v = dv.getInt32(o, little) / 2147483648;
    ch[c][i] = v; o += bps;
  }
  return { sr: comm.sr, ch, bits: isFloat ? 32 : bps * 8, isFloat };
}

/** Decode WAV or AIFF; null if neither (callers then fall back to the browser's decoder). */
export const decodeAudioFile = buf => decodeWav(buf) || decodeAiff(buf);
