// SPDX-License-Identifier: Apache-2.0
/** Playback through Web Audio, with a moving playhead drawn on the matching canvas. */
import * as D from '../dsp/index.js';
import { toast } from './dom.js';
import { drawSrc, drawOut, drawGen } from './draw.js';

let actx = null, P = null, raf = 0;
export function ctx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
export function play(snd, a = 0, b = null, where = 'src', loop = false) {
  stop(false);
  const n = D.len(snd.ch); if (!n) return;
  b = b == null ? n : b; if (a >= b - 1) a = 0;
  let c;
  try { c = ctx(); } catch (e) { toast('Audio playback is not available in this browser.', 'err'); return; }
  let buf;
  try { buf = c.createBuffer(snd.ch.length, n, snd.sr); snd.ch.forEach((d, i) => buf.copyToChannel(d, i)); }
  catch (e) { const rch = D.resample(snd.ch, snd.sr, 48000); buf = c.createBuffer(rch.length, D.len(rch), 48000); rch.forEach((d, i) => buf.copyToChannel(d, i)); }
  const src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination);
  if (loop) { src.loop = true; src.start(0); }
  else src.start(0, a / snd.sr, (b - a) / snd.sr);
  P = { src, t0: c.currentTime, a, sr: snd.sr, where, end: b, loop };
  src.onended = () => { if (P && P.src === src) { P = null; cancelAnimationFrame(raf); drawSrc(); drawOut(); drawGen(); } };
  tick();
}
export function stop(redraw = true) {
  if (P) { try { P.src.stop(); } catch (e) { /* already stopped */ } P = null; }
  cancelAnimationFrame(raf);
  if (redraw) { drawSrc(); drawOut(); drawGen(); }
}
export function tick() {
  if (!P) return;
  const pos = Math.min(P.end, P.a + (actx.currentTime - P.t0) * P.sr);
  if (!P.loop) { if (P.where === 'src') drawSrc(pos); else if (P.where === 'out') drawOut(pos); else if (P.where === 'gen') drawGen(pos); }
  raf = requestAnimationFrame(tick);
}

/** The current playback, or null. Fields: where ('src'|'out'|'gen'|'var'|'lib'|'loop'), a (start sample), sr, loop. */
export const playing = () => P;
/** Seconds into the played sound, measured from its start. */
export const playPos = () => (P ? (actx.currentTime - P.t0) + P.a / P.sr : 0);
