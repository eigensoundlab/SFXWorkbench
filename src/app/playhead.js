// SPDX-License-Identifier: Apache-2.0
/**
 * Optional Playhead analysis (src/vendor/playhead-core.mjs, https://github.com/eigensoundlab/playhead): overview curves,
 * events and descriptors for the sounds on screen. Off by default and remembered in this browser. While it is off,
 * nothing here runs and every tool behaves as before, so results can be compared with and without it.
 *
 * Analyses run one at a time on the main thread (Playhead yields between its stages) and are cached by a key that
 * changes with the audio. Each caller names a slot ('src', 'out', 'acc', ...): a newer request in the same slot
 * replaces an older one that has not started, so dragging a slider does not queue up stale analyses.
 */
import Playhead from '../vendor/playhead-core.mjs';
import * as D from '../dsp/index.js';

const PREF = 'sfx-workbench.playhead', MAX = 40, LONG_S = 30;
export const PH = { on: false, version: Playhead.version };
try { PH.on = localStorage.getItem(PREF) === 'on'; } catch (e) { /* storage blocked: stays off */ }

/** Turn Playhead analysis on or off and remember the choice. */
export function setPlayhead(on) {
  PH.on = !!on;
  try { localStorage.setItem(PREF, PH.on ? 'on' : 'off'); } catch (e) { /* not remembered */ }
}

/** Curves offered as drives and morph paths, with their names in the UI. */
export const PH_CURVES = { loudness: 'loudness', activity: 'activity', arousal: 'arousal', harshness: 'harshness', surprise: 'surprise' };

const cache = new Map(), latest = {};
let queue = Promise.resolve();

function entry(key, snd, slot) {
  let e = cache.get(key);
  if (e) { cache.delete(key); cache.set(key, e); return e; }
  e = { state: 'pending', doc: null, waiters: new Set() };
  e.promise = queue.then(async () => {
    if (slot && latest[slot] !== key) { cache.delete(key); return null; }
    const long = D.len(snd.ch) / snd.sr > LONG_S;
    return Playhead.analyze({ sampleRate: snd.sr, channels: snd.ch }, { profile: long ? 'fast' : 'sfx' });
  }).then(doc => {
    if (!doc) { e.state = 'dropped'; return null; }
    e.state = 'ready'; e.doc = doc;
    for (const fn of e.waiters) fn();
    e.waiters.clear();
    return doc;
  }, err => {
    console.error(err); e.state = 'error'; e.waiters.clear();
    return null;
  });
  queue = e.promise;
  cache.set(key, e);
  while (cache.size > MAX) cache.delete(cache.keys().next().value);
  return e;
}

/**
 * The Playhead document for `snd` ({ sr, ch }) under `key`, or null while it is being made. Starts the analysis if
 * needed and calls `onReady` once when it arrives (pass a function defined once, so repeated calls do not stack up).
 */
export function phDoc(key, snd, slot, onReady) {
  if (!PH.on || !snd || !D.len(snd.ch)) return null;
  if (slot) latest[slot] = key;
  const e = entry(key, snd, slot);
  if (e.state === 'ready') return e.doc;
  if (onReady && e.state === 'pending') e.waiters.add(onReady);
  return null;
}
/** The same as a promise (null when Playhead is off or the analysis failed). */
export function phDocAsync(key, snd, slot) {
  if (!PH.on || !snd || !D.len(snd.ch)) return Promise.resolve(null);
  if (slot) latest[slot] = key;
  return entry(key, snd, slot).promise;
}
/** 'ready', 'pending', 'error' or 'none' for a key. */
export const phStatus = key => (cache.get(key) || { state: 'none' }).state;

/** Playhead events as accent anchors: sample position and level in dB re the sound's peak. null without events. */
export function phEvents(doc, sr) {
  if (!doc || !doc.events) return null;
  const top = doc.summary.peakDb ?? 0;
  return doc.events.map(e => ({ at: Math.round(e.start * sr), strength: Math.min(0, (e.peakDb ?? top) - top) }));
}
/** A Playhead curve mapped to 0..1 (5th..95th percentile) for drives and morph paths: { values, rate }. */
export function phCurve(doc, name) {
  const c = doc && doc.curves && doc.curves[name];
  return c ? { values: D.normalizeCurve(c), rate: doc.curves.rate } : null;
}

/** Draw a Playhead strip (waveform coloured by harshness, activity as a line, events as ticks) with the app's colours. */
export function drawPhStrip(g, doc, W, H, colors) {
  Playhead.drawStrip(g, doc, { width: W, height: H, theme: { background: null, ...colors } });
}

/** Short readable summary of a Playhead document for chips: [label, value, title][]. */
export function phSummary(doc) {
  if (!doc) return [];
  const out = [], d = doc.descriptors, f = (v, k = 2) => (Number.isFinite(v) ? v.toFixed(k) : null);
  if (doc.events) {
    const words = [...new Set(doc.events.map(e => e.word).filter(Boolean))].slice(0, 3).join(', ');
    out.push(['Events', `${doc.events.length}${words ? ': ' + words : ''}`, 'Sound events found by Playhead, with their Schaeffer-style type']);
  }
  if (d && d.decay && f(d.decay.logTauD)) out.push(['Decay', `log τd ${f(d.decay.logTauD)}${d.decay.material ? ' (' + d.decay.material + ')' : ''}`, 'Damping of the resonant partials (Klatzky): higher rings longer for its pitch, as metal or glass do']);
  else if (d && d.decay && f(d.decay.t60)) out.push(['Decay', `T60 ${f(d.decay.t60)} s`, 'Time to fall by 60 dB']);
  if (d && d.arrow && f(d.arrow.T20, 1)) out.push(['Time arrow', f(d.arrow.T20, 1), 'How much the sound changes if played backwards: high for hits that decay, near 0 for steady or symmetric sounds']);
  if (d && d.events && f(d.events.burstiness)) out.push(['Burstiness', f(d.events.burstiness), 'Event timing: below 0 regular, 0 random, above 0 in bursts']);
  if (d && d.kurtosis && f(d.kurtosis.K, 1)) out.push(['Impulsiveness', f(d.kurtosis.K, 1), 'Spectral kurtosis: 0 for steady noise, -1 for a steady tone, high for clicks, cracks and crackle']);
  return out;
}
