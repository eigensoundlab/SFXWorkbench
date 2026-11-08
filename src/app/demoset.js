// SPDX-License-Identifier: Apache-2.0
/**
 * The Playhead demo set: the example sounds finished with Playhead (src/vendor/playhead-core.mjs), as a starting
 * point for sound design and a show of what its analysis does. Each sound's name says what was done:
 *
 * - an impact layered from three examples (the gunshot as body, the metal hit as transient, a sub drop), placed
 *   roughly, then arranged by Playhead.arrange for punch, for size and for clarity: three sounds, and the punchy
 *   arrangement as the layer stack, to take further
 * - the metal hit de-harshed, the footsteps with their events levelled, the gunshot with its hits driven, the metal
 *   hit with reverb on its tails only, the servo with its tails widened: Playhead's tools at their defaults, which
 *   match the loudness of the original
 *
 * Pure: it takes the example sounds and returns new ones; the library adds them (library.js). Nothing runs until the
 * user asks for the set, and only with Playhead analysis on.
 */
import Playhead from '../vendor/playhead-core.mjs';
import * as D from '../dsp/index.js';

/** The rough placement of the impact's layers (offset in ms, gain in dB): what a quick first try would be. */
export const DEMO_LAYERS = [
  { name: 'gunshot', role: 'body', offset: 0, gain: 0 },
  { name: 'metal', role: 'transient', offset: 18, gain: -8 },
  { name: 'subdrop', role: 'sub', offset: 35, gain: -6 }
];
/** The tools of the set: [example, Playhead tool, what the name says]. */
export const DEMO_TOOLS = [
  ['metal', 'deharsh', 'de-harshed'],
  ['footstep', 'level', 'levelled'],
  ['gunshot', 'drive', 'hits driven'],
  ['metal', 'tailverb', 'tail reverb'],
  ['servo', 'widen', 'tails widened']
];
const GOALS = [['punch', 'punchy'], ['big', 'big'], ['clean', 'clean']];
/** The names the sounds go by in the library. */
export const DEMO_LABEL = { gunshot: 'gunshot', metal: 'metal hit', subdrop: 'sub drop', footstep: 'footsteps', servo: 'servo' };

/**
 * Builds the set from the example sounds (ex: { gunshot, metal, footstep, servo, ... } as Channels, at sr).
 * onStep(text) reports progress. Returns { sounds: [{ name, ch }], layers: [{ name, offset, gain }] (the punchy
 * arrangement, for the layer stack), sources (the layers' sounds by name), scores: { punch, big, clean }
 * ({ rough, arranged }) }.
 */
export async function buildDemoSet(ex, sr, onStep = () => {}) {
  const src = Object.assign({ subdrop: D.synth.subdrop(sr) }, ex);
  const sounds = [], scores = {};
  // the impact: each layer analysed alike (as the layer stack does), then searched for each goal
  onStep('Analysing the layers of the impact');
  const docs = [];
  for (const L of DEMO_LAYERS) docs.push(await Playhead.analyze({ sampleRate: sr, channels: src[L.name] }, { profile: 'sfx', assetClass: 'sfx', curveRate: 100 }));
  const parts = DEMO_LAYERS.map((L, k) => ({ doc: docs[k], offset: L.offset / 1000, gain: L.gain }));
  const mix = arr => D.layerMix(DEMO_LAYERS.map((L, k) => ({ ch: src[L.name], sr, offset: arr[k].offset * 1000, gain: arr[k].gain, pitch: 0, pan: 0, reverse: false })), sr);
  sounds.push({ name: 'impact, rough', ch: D.matchPeak(mix(parts), D.dbToLin(-1)) });
  let layers = null;
  for (const [goal, word] of GOALS) {
    onStep('Arranging the impact: ' + word);
    const r = Playhead.arrange(parts, { goal, range: 0.06, gainRange: [-6, 3], minOffset: 0, count: 1 });
    const best = r.candidates[0];
    scores[goal] = { rough: r.baseline.score, arranged: best ? best.score : r.baseline.score };
    if (!best) continue;
    sounds.push({ name: 'impact, ' + word, ch: D.matchPeak(mix(best.parts), D.dbToLin(-1)) });
    if (goal === 'punch') layers = DEMO_LAYERS.map((L, k) => ({ name: L.name, offset: Math.round(best.parts[k].offset * 10000) / 10, gain: best.parts[k].gain }));
  }
  // the tools, at their defaults
  for (const [name, tool, what] of DEMO_TOOLS) {
    onStep('Playhead tool: ' + name + ', ' + what);
    const r = await Playhead.process({ sampleRate: sr, channels: src[name] }, tool, {}, { name });
    const out = r.outputs[0];
    if (out) sounds.push({ name: DEMO_LABEL[name] + ', ' + what, ch: out.channels });
  }
  return { sounds, layers: layers || DEMO_LAYERS.map(L => ({ name: L.name, offset: L.offset, gain: L.gain })), sources: src, scores };
}
