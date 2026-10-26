// SPDX-License-Identifier: Apache-2.0
/** Import (WAV parser, or the browser's decoder for compressed formats) and saving (direct download, or the Claude artifact downloads capability when embedded there). */
import * as D from '../dsp/index.js';
import { h, toast } from './dom.js';
import { S, newSound } from './state.js';
import { khz, bitsLabel, safeName } from './format.js';
import { ctx } from './audio.js';
import { select, renderLibrary } from './library.js';

let dlPromise = null;
export const inViewer = () => !!(window.claude && typeof window.claude.use === 'function');
export function downloadsCap() {
  if (!dlPromise) dlPromise = inViewer() ? Promise.resolve(window.claude.use('downloads')).catch(() => null) : Promise.resolve(null);
  return dlPromise;
}
export function encodeFor(snd, meta) {
  let ch = snd.ch, sr = snd.sr;
  const tsr = S.exp.sr === 'source' ? meta.sr : +S.exp.sr;
  let bits = meta.bits, isFloat = meta.isFloat;
  if (S.exp.fmt === '16') { bits = 16; isFloat = false; } else if (S.exp.fmt === '24') { bits = 24; isFloat = false; } else if (S.exp.fmt === '32f') { bits = 32; isFloat = true; }
  if (tsr !== sr) { ch = D.resample(ch, sr, tsr); sr = tsr; }
  if (S.fin.ceil) { const pk = D.peak(ch), lim = D.dbToLin(-0.3); if (pk > lim) ch = D.scale(ch, lim / pk); }
  return D.encodeWav(ch, sr, bits, isFloat);
}
export async function saveBytes(filename, bytes, mime) {
  if (inViewer()) {
    const dl = await downloadsCap();
    if (!dl) { toast('Saving files is not available in this view. Use the offline copy of SFX Workbench to save WAVs.', 'err'); return false; }
    let name = filename, data = bytes;
    if (!/\.zip$/i.test(name)) { data = D.zip([{ name, data: bytes }]); name = name.replace(/\.wav$/i, '') + '.zip'; }
    try { await dl.save({ filename: name, data: new Blob([data]) }); toast('Saved ' + name); return true; }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') toast('Save cancelled');
      else if (code === 'rate_limited') toast('A save prompt is already open.');
      else if (code === 'too_large') toast('That file is too large to save from this view.', 'err');
      else toast('Could not save: ' + ((e && e.message) || code || 'unknown error'), 'err');
      return false;
    }
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = h('a', { href: url, download: filename }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Saved ' + filename);
  return true;
}
export function saveSound(snd, meta, base) {
  try { return saveBytes(safeName(base) + '.wav', encodeFor(snd, meta), 'audio/wav'); }
  catch (e) { console.error(e); toast('Could not encode the WAV: ' + e.message, 'err'); }
}
export async function saveZip(name, items) {
  try { await saveBytes(safeName(name) + '.zip', D.zip(items.map(it => ({ name: safeName(it.name) + '.wav', data: encodeFor(it, it.meta || it) }))), 'application/zip'); }
  catch (e) { console.error(e); toast('Could not build the zip: ' + e.message, 'err'); }
}
/**
 * Decode a File or Blob: our own WAV/AIFF parser first (keeps bit depth, no resampling), then the browser's decoder
 * for compressed formats (MP3, OGG, FLAC, M4A...). Compressed sources are marked `decoded` and save as 24-bit by default.
 */
export async function decodeFile(f) {
  const buf = await f.arrayBuffer();
  const dec = D.decodeAudioFile(buf);
  if (dec) return dec;
  const ab = await ctx().decodeAudioData(buf.slice(0));
  return { sr: ab.sampleRate, ch: Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i).slice()), bits: 24, isFloat: false, decoded: true };
}

export async function importFiles(files) {
  let last = null;
  for (const f of files) {
    try {
      const dec = await decodeFile(f);
      if (!D.len(dec.ch)) throw new Error('No audio in this file.');
      last = newSound(f.name.replace(/\.[^.]+$/, ''), dec.sr, dec.ch, dec.bits, dec.isFloat, 'file');
      S.sounds.push(last);
      toast(dec.decoded ? `Loaded ${f.name}. Compressed files are decoded at ${khz(dec.sr)} kHz; saves default to 24-bit.` : `Loaded ${f.name} · ${khz(dec.sr)} kHz · ${bitsLabel(dec)}`);
    } catch (e) {
      console.error(e); toast(`${f.name}: ${e.message || 'could not be read as audio'}`, 'err');
    }
  }
  if (last) select(last.id); else renderLibrary();
}
