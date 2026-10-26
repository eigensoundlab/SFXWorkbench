// SPDX-License-Identifier: Apache-2.0
/** Finishing stage: channel format, DC removal, silence trim, loudness target, de-click fades and peak ceiling. Applied to everything the user hears as output and everything saved. */
import * as D from '../dsp/index.js';
import { S } from './state.js';

export function finish(chs, sr, opts = {}) {
  const F = S.fin, info = {};
  let ch = chs;
  if (F.ch === 'mono' && ch.length > 1) ch = D.mapChannels(ch, 1);
  else if (F.ch === 'stereo' && ch.length === 1) ch = D.mapChannels(ch, 2);
  if (F.dc) ch = ch.map(c => D.dcBlock(c, sr));
  if (F.trim && !opts.loop) {
    const n = D.len(ch), thr = D.dbToLin(-60); let first = -1, last = -1;
    for (const c of ch) for (let i = 0; i < n; i++) if (Math.abs(c[i]) > thr) { if (first < 0 || i < first) first = i; break; }
    for (const c of ch) for (let i = n - 1; i >= 0; i--) if (Math.abs(c[i]) > thr) { if (i > last) last = i; break; }
    if (first >= 0) { const a = Math.max(0, first - Math.round(0.001 * sr)), b = Math.min(n, last + 1 + Math.round(0.005 * sr)); if (a > 0 || b < n) ch = ch.map(c => c.slice(a, b)); }
  }
  if (F.lufs !== 'off' && !opts.noLoud) {
    const target = +F.lufs, l = D.lufs(ch, sr);
    if (isFinite(l)) {
      ch = D.scale(ch, D.dbToLin(target - l));
      if (F.ceil) { const pk = D.peak(ch), c = D.dbToLin(-0.3); if (pk > c) { ch = D.scale(ch, c / pk); info.limited = true; } }
    }
  }
  if (F.declick && !opts.loop) {
    const n = D.len(ch), fi = Math.min(Math.round(0.001 * sr), n >> 2), fo = Math.min(Math.round(0.005 * sr), n >> 2);
    ch = ch.map(c => { const o = c === chs[0] || chs.includes(c) ? c.slice() : c; for (let i = 0; i < fi; i++) o[i] *= i / fi; for (let i = 0; i < fo; i++) o[n - 1 - i] *= i / fo; return o; });
  }
  if (F.ceil) { const pk = D.peak(ch), c = D.dbToLin(-0.3); if (pk > c) ch = D.scale(ch, c / pk); }
  if (ch === chs) ch = D.copy(chs);
  return { ch, info };
}
