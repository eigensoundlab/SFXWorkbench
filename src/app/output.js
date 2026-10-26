// SPDX-License-Identifier: Apache-2.0
/** The output lane: source -> effect chain -> finishing, rendered on demand and cached by key. */
import * as D from '../dsp/index.js';
import { $, toast } from './dom.js';
import { S, cur } from './state.js';
import { fmtDb, fmtDur, fmtLufs } from './format.js';
import { finish } from './finish.js';
import { play, playing, playPos } from './audio.js';
import { drawOut } from './draw.js';

let renderTimer = 0;
export function outKey(s) { return s.id + ':' + s.ver + ':' + (S.chainOn ? JSON.stringify(S.chain) : 'bypass') + ':' + JSON.stringify(S.fin); }
export function ensureOut() {
  const s = cur(); if (!s) { S.out = null; return null; }
  const key = outKey(s);
  if (S.out && S.out.key === key) return S.out;
  try {
    const r = S.chainOn ? D.processChain(s, S.chain) : { sr: s.sr, ch: s.ch };
    const f = finish(r.ch, r.sr);
    S.out = { key, sr: r.sr, ch: f.ch, info: f.info, err: null };
  } catch (e) {
    console.error(e);
    S.out = { key, sr: s.sr, ch: [], err: e.message || String(e) };
  }
  return S.out;
}
export function scheduleRender() {
  clearTimeout(renderTimer);
  const s = cur();
  if (s && (!S.out || S.out.key !== outKey(s))) $('#out-info').textContent = 'Rendering…';
  renderTimer = setTimeout(() => { ensureOut(); drawOut(); updateOutInfo(); }, 120);
}
export function updateOutInfo() {
  const o = S.out, el = $('#out-info');
  if (!o || o.err || !D.len(o.ch)) { el.textContent = o && o.err ? 'Check the effect settings' : ''; el.classList.remove('warn'); return; }
  const pk = D.peak(o.ch), over = pk > 1;
  let t = `${fmtDur(D.len(o.ch) / o.sr)} s · peak ${fmtDb(pk)} dBFS · ${fmtLufs(D.lufs(o.ch, o.sr))}`;
  if (o.info && o.info.limited) t += ' · loudness held back by ceiling';
  if (over) t += ' · over 0 dBFS, will clip';
  if (!S.chainOn) t += ' · effects off';
  el.textContent = t;
  el.classList.toggle('warn', over);
}
export function playOutput(fromSec) {
  const o = ensureOut(); drawOut(); updateOutInfo();
  if (!o || o.err || !D.len(o.ch)) return toast(o && o.err ? 'Effect error: ' + o.err : 'Nothing to play.', o && o.err ? 'err' : undefined);
  play(o, Math.min(D.len(o.ch) - 2, Math.round((fromSec || 0) * o.sr)), null, 'out');
}
export function toggleCompare() {
  const p = playing(), wasOut = p && p.where === 'out' && !p.loop;
  const at = wasOut ? playPos() : 0;
  S.chainOn = !S.chainOn; $('#chain-on').checked = S.chainOn;
  ensureOut(); drawOut(); updateOutInfo();
  if (wasOut) playOutput(at);
  toast(S.chainOn ? 'Effects on' : 'Effects off (dry source with finishing)');
}
