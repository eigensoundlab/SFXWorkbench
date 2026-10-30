// SPDX-License-Identifier: Apache-2.0
/**
 * Generator engines for the Generate tab. Each engine has:
 *   name, desc       shown in the engine switch and under it
 *   render           name of the DSP function in src/dsp/index.js: (params, sampleRate) => Channels
 *   groups           [title, specs][] parameter panels (spec format: see src/config/effects.js;
 *                    `show: { k, in: [...] }` hides a row unless param k has one of the listed values)
 *   types            dice: name -> () => partial params, randomised within sensible ranges
 * Missing keys use the spec defaults. Engines: synth (src/dsp/generator.js), impact (src/dsp/physical.js),
 * texture (src/dsp/textures.js).
 */
import { MATERIALS, SHAPES } from '../dsp/physical.js';
import { TEXTURE_KINDS } from '../dsp/textures.js';

export const GEN_GROUPS = [
  ['Oscillator', [
    { k: 'wave', l: 'Wave', type: 'select', opts: [['sine', 'Sine'], ['triangle', 'Triangle'], ['square', 'Square / pulse'], ['saw', 'Saw'], ['fm', 'FM: bells, metal, growl'], ['sh', 'Pitched noise: explosions'], ['white', 'White noise'], ['pink', 'Pink noise']], d: 'square' },
    { k: 'duty', l: 'Pulse width', min: 5, max: 50, step: 1, u: '%', d: 50 },
    { k: 'fmRatio', l: 'FM ratio', min: 0.1, max: 16, log: true, u: 'ratio', d: 2 },
    { k: 'fmIndex', l: 'FM depth', min: 0, max: 20, step: 0.1, u: '', d: 3 },
    { k: 'noise', l: 'Noise mix', min: 0, max: 100, step: 1, u: '%', d: 0 },
    { k: 'seed', l: 'Seed', min: 1, max: 999, step: 1, u: '#', d: 1 }]],
  ['Pitch', [
    { k: 'f0', l: 'Start', min: 20, max: 8000, log: true, u: 'Hz', d: 880 },
    { k: 'f1', l: 'End', min: 20, max: 8000, log: true, u: 'Hz', d: 220 },
    { k: 'curve', l: 'Slide shape', type: 'select', opts: [['lin', 'Even'], ['fast', 'Fast at start'], ['late', 'Fast at end']], d: 'fast' },
    { k: 'stepAt', l: 'Jump at', min: 0, max: 95, step: 1, u: 'off%', d: 0 },
    { k: 'stepSt', l: 'Jump by', min: -24, max: 24, step: 1, u: 'st', d: 7 },
    { k: 'vibDepth', l: 'Vibrato', min: 0, max: 12, step: 0.1, u: 'st', d: 0 },
    { k: 'vibRate', l: 'Vibrato rate', min: 0.1, max: 40, log: true, u: 'Hz', d: 6 },
    { k: 'repeat', l: 'Repeat every', min: 0, max: 1000, step: 1, u: 'offms', d: 0 }]],
  ['Envelope', [
    { k: 'att', l: 'Attack', min: 0, max: 2000, step: 1, u: 'ms', d: 2 },
    { k: 'hold', l: 'Hold', min: 0, max: 4000, step: 1, u: 'ms', d: 80 },
    { k: 'rel', l: 'Release', min: 0, max: 4000, step: 1, u: 'ms', d: 250 },
    { k: 'shape', l: 'Release curve', min: 0.5, max: 4, step: 0.1, u: '', d: 2 },
    { k: 'punch', l: 'Punch', min: 0, max: 100, step: 1, u: '%', d: 20 }]],
  ['Tone', [
    { k: 'lp0', l: 'Low-pass start', min: 50, max: 20000, log: true, u: 'Hz', d: 20000 },
    { k: 'lp1', l: 'Low-pass end', min: 50, max: 20000, log: true, u: 'Hz', d: 20000 },
    { k: 'res', l: 'Resonance', min: 0.5, max: 10, log: true, u: '', d: 0.71 },
    { k: 'hp', l: 'High-pass', min: 20, max: 2000, log: true, u: 'Hz', d: 20 }]],
];
export const GEN_SPECS = GEN_GROUPS.flatMap(g => g[1]);
const rr = (a, b) => a + Math.random() * (b - a), lr = (a, b) => a * Math.pow(b / a, Math.random()), pick = a => a[Math.floor(Math.random() * a.length)], ri = (a, b) => Math.round(rr(a, b));
export const GEN_TYPES = {
  'Pickup / coin': () => { const f = lr(600, 1600); return { wave: pick(['square', 'sine', 'triangle']), duty: rr(25, 50), f0: f, f1: f, curve: 'lin', stepAt: rr(20, 50), stepSt: pick([5, 7, 12]), att: 0, hold: rr(30, 80), rel: rr(150, 350), shape: 2, punch: rr(30, 60) }; },
  'Laser': () => { const f = lr(800, 3000); return { wave: pick(['saw', 'square', 'sine']), duty: rr(10, 50), f0: f, f1: f * rr(0.08, 0.35), curve: 'fast', att: 0, hold: rr(0, 40), rel: rr(120, 300), shape: rr(1, 2), vibDepth: pick([0, 0, rr(0.5, 3)]), vibRate: lr(10, 30), punch: rr(0, 30) }; },
  'Explosion': () => { const f = lr(40, 200); return { wave: 'sh', f0: f, f1: f * rr(0.3, 0.8), curve: 'fast', att: rr(0, 5), hold: rr(30, 150), rel: rr(600, 1800), shape: rr(2, 3.5), punch: rr(40, 80), lp0: lr(8000, 16000), lp1: lr(300, 900), res: 0.8, repeat: pick([0, 0, ri(80, 200)]) }; },
  'Power up': () => { const f = lr(150, 400); return { wave: pick(['square', 'saw', 'triangle']), duty: rr(20, 50), f0: f, f1: f * rr(2, 4), curve: pick(['lin', 'late']), repeat: pick([0, ri(60, 150)]), vibDepth: rr(0, 1.5), vibRate: lr(5, 10), att: rr(5, 30), hold: rr(200, 600), rel: rr(100, 300), shape: 1.5, punch: rr(0, 30) }; },
  'Power down': () => { const f = lr(400, 900); return { wave: pick(['square', 'saw', 'triangle']), duty: rr(20, 50), f0: f, f1: f * rr(0.12, 0.3), curve: 'late', att: rr(0, 20), hold: rr(300, 800), rel: rr(200, 500), lp0: lr(8000, 16000), lp1: lr(500, 1500), res: 1, shape: 1.2 }; },
  'Hit / hurt': () => { const f = lr(200, 600); return { wave: pick(['square', 'saw', 'sh']), f0: f, f1: f * rr(0.3, 0.6), curve: 'fast', att: 0, hold: rr(10, 40), rel: rr(80, 200), noise: rr(20, 60), punch: rr(30, 70), shape: 2 }; },
  'Jump': () => { const f = lr(250, 500); return { wave: 'square', duty: rr(25, 50), f0: f, f1: f * rr(1.6, 2.5), curve: 'fast', att: 0, hold: rr(50, 120), rel: rr(80, 180), shape: 1.5 }; },
  'Blip / UI': () => { const f = lr(700, 2200); return { wave: pick(['sine', 'square', 'triangle']), duty: 50, f0: f, f1: f * pick([1, 1, rr(0.9, 1.1)]), att: rr(0, 3), hold: rr(20, 60), rel: rr(40, 120), shape: 2 }; },
  'Alarm': () => { const f = lr(500, 900); return { wave: pick(['square', 'saw']), f0: f, f1: f * rr(1.3, 1.6), curve: 'lin', repeat: ri(150, 400), att: 5, hold: rr(800, 1500), rel: rr(100, 200), shape: 1, lp0: 6000, lp1: 6000 }; },
  'Hum / engine': () => { const f = lr(50, 120), lp = lr(800, 2500); return { wave: pick(['fm', 'saw']), fmRatio: pick([0.5, 1, 1.5, 2]), fmIndex: rr(1, 4), f0: f, f1: f * rr(0.97, 1.06), curve: 'lin', vibDepth: rr(0.1, 0.4), vibRate: lr(3, 8), att: rr(100, 300), hold: rr(1500, 2500), rel: rr(300, 600), lp0: lp, lp1: lp * rr(0.8, 1.2), res: rr(0.7, 2), shape: 1 }; },
  'Whoosh': () => ({ wave: pick(['white', 'pink']), att: rr(150, 400), hold: rr(50, 200), rel: rr(300, 700), shape: 1.5, lp0: lr(300, 800), lp1: lr(2500, 7000), res: rr(1.5, 4), hp: lr(80, 300), punch: 0 }),
  'Zap / electric': () => { const f = lr(80, 300); return { wave: 'fm', fmRatio: rr(1.3, 3.3), fmIndex: rr(8, 20), f0: f, f1: f * rr(0.5, 2), curve: 'lin', repeat: ri(20, 60), noise: rr(10, 40), att: 0, hold: rr(100, 300), rel: rr(50, 150), shape: 1.5 }; },
};

/* ---------- Impact: cause -> object -> aftermath ---------- */
const MAT_OPTS = Object.entries(MATERIALS).map(([k, m]) => [k, m.name]);
const SHAPE_OPTS = Object.entries(SHAPES).map(([k, m]) => [k, m.name]);
const CAUSE = k => ({ k: 'cause', in: k });

export const IMPACT_GROUPS = [
  ['Cause', [
    { k: 'cause', l: 'Action', type: 'select', opts: [['hit', 'Hit / drop'], ['scrape', 'Scrape / slide'], ['roll', 'Roll'], ['crack', 'Crack / break']], d: 'hit' },
    { k: 'hard', l: 'Hardness', min: 0, max: 100, step: 1, u: '%', d: 70 },
    { k: 'contact', l: 'Contact noise', min: 0, max: 100, step: 1, u: '%', d: 30 },
    { k: 'dur', l: 'Duration', min: 50, max: 6000, log: true, u: 'ms', d: 800, show: CAUSE(['scrape', 'roll', 'crack']) },
    { k: 'rough', l: 'Roughness', min: 0, max: 100, step: 1, u: '%', d: 40, show: CAUSE(['scrape']) },
    { k: 'speed', l: 'Roll speed', min: 1, max: 60, log: true, u: 'Hz', d: 12, show: CAUSE(['roll']) },
    { k: 'clicks', l: 'Crack clicks', min: 2, max: 40, step: 1, u: '', d: 10, show: CAUSE(['crack']) },
    { k: 'accel', l: 'Speed-up', min: 0, max: 100, step: 1, u: '%', d: 60, show: CAUSE(['crack']) }]],
  ['Object', [
    { k: 'material', l: 'Material', type: 'select', opts: MAT_OPTS, d: 'steel' },
    { k: 'shape', l: 'Shape', type: 'select', opts: SHAPE_OPTS, d: 'plate' },
    { k: 'size', l: 'Size (pitch)', min: 30, max: 10000, log: true, u: 'Hz', d: 400 },
    { k: 'modes', l: 'Modes', min: 2, max: 32, step: 1, u: '', d: 14 },
    { k: 'ring', l: 'Ring time', min: 0.05, max: 8, log: true, u: 'ratio', d: 1 },
    { k: 'pos', l: 'Strike position', min: 1, max: 50, step: 1, u: '%', d: 25 },
    { k: 'irregular', l: 'Irregularity', min: 0, max: 100, step: 1, u: '%', d: 25 },
    { k: 'disp', l: 'Dispersion (chirp)', min: 0, max: 100, step: 1, u: '%', d: 0 }]],
  ['Aftermath', [
    { k: 'bounces', l: 'Bounces', min: 0, max: 24, step: 1, u: '', d: 0 },
    { k: 'gap', l: 'First bounce after', min: 15, max: 1000, log: true, u: 'ms', d: 140 },
    { k: 'restit', l: 'Bounciness', min: 20, max: 95, step: 1, u: '%', d: 55 },
    { k: 'roll', l: 'Roll out', min: 0, max: 100, step: 1, u: '%', d: 0 },
    { k: 'debris', l: 'Debris', min: 0, max: 100, step: 1, u: '%', d: 0 },
    { k: 'debrisPitch', l: 'Debris size (pitch)', min: 1, max: 16, log: true, u: 'ratio', d: 4 },
    { k: 'spread', l: 'Debris spread', min: 50, max: 4000, log: true, u: 'ms', d: 600 },
    { k: 'debrisMat', l: 'Debris material', type: 'select', opts: [['same', 'Same as object'], ...MAT_OPTS], d: 'same' },
    { k: 'rumble', l: 'Rumble', min: 0, max: 100, step: 1, u: '%', d: 0 },
    { k: 'seed', l: 'Seed', min: 1, max: 999, step: 1, u: '#', d: 1 }]],
];

export const IMPACT_TYPES = {
  'Metal clang': () => ({ material: 'steel', shape: pick(['plate', 'bar']), size: lr(250, 900), hard: rr(70, 95), ring: lr(0.6, 1.6), modes: ri(12, 20) }),
  'Pipe hit': () => ({ material: pick(['steel', 'aluminium']), shape: 'bar', size: lr(300, 1200), hard: rr(75, 95), ring: lr(0.8, 2), pos: rr(5, 20) }),
  'Wood knock': () => ({ material: 'wood', shape: 'box', size: lr(120, 400), hard: rr(50, 80), contact: rr(40, 70), irregular: rr(30, 70) }),
  'Glass clink': () => ({ material: 'glass', shape: pick(['shell', 'plate']), size: lr(1500, 3500), hard: rr(90, 100), modes: ri(6, 12), contact: rr(10, 30) }),
  'Stone hit': () => ({ material: 'stone', shape: 'box', size: lr(90, 300), hard: rr(60, 85), contact: rr(60, 90), irregular: rr(40, 80) }),
  'Ceramic plate': () => ({ material: 'ceramic', shape: 'plate', size: lr(700, 2000), hard: rr(85, 98), ring: lr(0.8, 1.5) }),
  'Bell': () => ({ material: pick(['brass', 'steel']), shape: 'bell', size: lr(200, 900), hard: rr(60, 85), ring: lr(1.5, 4), modes: 12, contact: rr(5, 15) }),
  'Ammo shell drop': () => ({ material: 'brass', shape: 'shell', size: lr(2500, 5000), modes: ri(8, 12), hard: rr(90, 100), contact: rr(20, 40), bounces: ri(3, 7), gap: lr(90, 180), restit: rr(45, 62), roll: rr(20, 50) }),
  'Coin drop': () => ({ material: pick(['steel', 'brass']), shape: 'plate', size: lr(3000, 6000), modes: ri(8, 12), hard: rr(90, 100), bounces: ri(10, 18), gap: lr(70, 130), restit: rr(72, 85) }),
  'Rubber bounce': () => ({ material: 'rubber', shape: 'membrane', size: lr(150, 400), hard: rr(20, 45), bounces: ri(6, 12), gap: lr(250, 500), restit: rr(70, 82), contact: rr(10, 30) }),
  'Can / bottle drop': () => ({ material: pick(['aluminium', 'glass']), shape: 'shell', size: lr(500, 1400), hard: rr(80, 95), bounces: ri(2, 5), gap: lr(120, 250), restit: rr(40, 55), roll: rr(40, 80) }),
  'Crate break': () => ({ cause: 'crack', material: 'wood', shape: 'box', size: lr(100, 260), clicks: ri(4, 9), dur: lr(120, 400), accel: rr(50, 80), debris: rr(45, 75), debrisPitch: lr(3, 6), spread: lr(300, 900), contact: rr(50, 80) }),
  'Glass shatter': () => ({ material: 'glass', shape: 'plate', size: lr(1200, 2500), hard: rr(95, 100), debris: rr(75, 95), debrisPitch: lr(2, 4), spread: lr(400, 1200), modes: 12 }),
  'Wall collapse': () => ({ cause: 'crack', material: 'stone', shape: 'box', size: lr(60, 140), clicks: ri(5, 10), dur: lr(250, 600), debris: rr(85, 100), debrisPitch: lr(4, 9), spread: lr(1500, 3500), rumble: rr(60, 90) }),
  'Ice crack': () => ({ cause: 'crack', material: 'ice', shape: 'plate', size: lr(500, 1500), clicks: ri(3, 8), dur: lr(150, 500), accel: rr(30, 70), disp: rr(70, 95), ring: lr(0.5, 1.2) }),
  'Wood snap': () => ({ cause: 'crack', material: 'wood', shape: 'bar', size: lr(200, 600), clicks: ri(3, 7), dur: lr(60, 200), accel: rr(60, 90), hard: rr(85, 100), contact: rr(50, 80) }),
  'Metal scrape': () => ({ cause: 'scrape', material: 'steel', shape: pick(['plate', 'bar']), size: lr(200, 700), dur: lr(500, 2000), rough: rr(30, 80), contact: rr(20, 50) }),
  'Stone drag': () => ({ cause: 'scrape', material: 'stone', shape: 'box', size: lr(80, 200), dur: lr(700, 2500), rough: rr(60, 95), contact: rr(60, 90) }),
  'Barrel roll': () => ({ cause: 'roll', material: 'steel', shape: 'shell', size: lr(120, 300), dur: lr(1200, 3000), speed: lr(3, 10), ring: lr(0.4, 0.9) }),
  'Blaster wire': () => ({ material: 'steel', shape: 'wire', size: lr(500, 1300), modes: 24, ring: lr(0.06, 0.16), hard: 100, pos: rr(5, 15), disp: rr(92, 100), contact: rr(20, 50) }),
  'Ricochet': () => ({ material: 'steel', shape: 'plate', size: lr(1500, 3000), modes: 10, ring: lr(0.1, 0.3), hard: 100, disp: rr(55, 80), contact: rr(30, 60) }),
};

/* ---------- Texture: event streams and continuous phenomena ---------- */
const KIND = k => ({ k: 'kind', in: k });
export const TEXTURE_GROUPS = [
  ['Texture', [
    { k: 'kind', l: 'Kind', type: 'select', opts: Object.entries(TEXTURE_KINDS), d: 'particles' },
    { k: 'dur', l: 'Length', min: 0.2, max: 20, log: true, u: 's', d: 3 },
    { k: 'fadeIn', l: 'Fade in', min: 0, max: 3000, step: 1, u: 'ms', d: 20 },
    { k: 'fadeOut', l: 'Fade out', min: 0, max: 5000, step: 1, u: 'ms', d: 300 },
    { k: 'width', l: 'Stereo width', min: 0, max: 100, step: 1, u: '%', d: 60 },
    { k: 'seed', l: 'Seed', min: 1, max: 999, step: 1, u: '#', d: 1 }]],
  ['Events', [
    { k: 'density', l: 'Density', min: 0.1, max: 3000, log: true, u: '/s', d: 80, show: KIND(['particles', 'sparks', 'fire', 'liquid', 'rain', 'rumble']) },
    { k: 'shape', l: 'Over time', type: 'select', opts: [['steady', 'Steady'], ['burst', 'Burst, then fewer'], ['swell', 'Swell and fade'], ['random', 'Random gusts']], d: 'burst', show: KIND(['particles', 'sparks', 'liquid']) },
    { k: 'material', l: 'Material', type: 'select', opts: MAT_OPTS, d: 'stone', show: KIND(['particles']) },
    { k: 'pitch', l: 'Pitch', min: 20, max: 12000, log: true, u: 'Hz', d: 2000, show: KIND(['particles', 'sparks', 'arc', 'rain', 'wind', 'energy', 'rumble']) },
    { k: 'spread', l: 'Pitch spread', min: 0, max: 4, step: 0.1, u: 'oct', d: 1.5, show: KIND(['particles', 'sparks']) },
    { k: 'sizeMin', l: 'Smallest bubble', min: 0.2, max: 20, log: true, u: 'mm', d: 1, show: KIND(['liquid']) },
    { k: 'sizeMax', l: 'Largest bubble', min: 0.2, max: 20, log: true, u: 'mm', d: 6, show: KIND(['liquid']) },
    { k: 'rise', l: 'Pitch rise', min: 0, max: 100, step: 1, u: '%', d: 20, show: KIND(['liquid']) },
    { k: 'hard', l: 'Hard surfaces', min: 0, max: 100, step: 1, u: '%', d: 40, show: KIND(['rain']) }]],
  ['Character', [
    { k: 'hiss', l: 'Hiss', min: 0, max: 100, step: 1, u: '%', d: 40, show: KIND(['sparks', 'arc', 'fire', 'liquid', 'rain', 'energy']) },
    { k: 'roar', l: 'Roar', min: 0, max: 100, step: 1, u: '%', d: 60, show: KIND(['fire']) },
    { k: 'crackle', l: 'Crackle', min: 0, max: 100, step: 1, u: '%', d: 50, show: KIND(['arc', 'fire', 'energy']) },
    { k: 'instab', l: 'Instability', min: 0, max: 100, step: 1, u: '%', d: 30, show: KIND(['arc']) },
    { k: 'gust', l: 'Gusts', min: 0, max: 100, step: 1, u: '%', d: 60, show: KIND(['wind', 'rumble']) },
    { k: 'whistle', l: 'Whistle', min: 0, max: 100, step: 1, u: '%', d: 25, show: KIND(['wind']) },
    { k: 'thuds', l: 'Distant thuds', min: 0, max: 100, step: 1, u: '%', d: 40, show: KIND(['rumble']) },
    { k: 'voices', l: 'Voices', min: 1, max: 8, step: 1, u: '', d: 4, show: KIND(['energy']) },
    { k: 'detune', l: 'Detune', min: 0, max: 60, step: 1, u: 'ct', d: 12, show: KIND(['energy']) },
    { k: 'sweep', l: 'Pitch sweep', min: -24, max: 24, step: 0.5, u: 'st', d: 0, show: KIND(['energy']) },
    { k: 'rate', l: 'Pulse rate', min: 0.1, max: 30, log: true, u: 'Hz', d: 3, show: KIND(['energy']) },
    { k: 'depth', l: 'Pulse depth', min: 0, max: 100, step: 1, u: '%', d: 30, show: KIND(['energy']) }]],
];

export const TEXTURE_TYPES = {
  'Gravel / crumble': () => ({ kind: 'particles', material: 'stone', density: lr(80, 400), shape: pick(['burst', 'random']), pitch: lr(1500, 4000), spread: rr(1, 2), dur: rr(1.5, 4) }),
  'Debris rain': () => ({ kind: 'particles', material: pick(['stone', 'wood', 'glass']), density: lr(20, 90), shape: 'burst', pitch: lr(800, 3000), spread: rr(1.5, 2.5), dur: rr(2, 5) }),
  'Sparks shower': () => ({ kind: 'sparks', density: lr(150, 800), shape: 'burst', pitch: lr(4000, 9000), spread: rr(1, 2.5), hiss: rr(20, 60), dur: rr(1, 3) }),
  'Short circuit': () => ({ kind: 'arc', pitch: pick([100, 120]), crackle: rr(60, 95), instab: rr(55, 90), hiss: rr(30, 70), dur: rr(1, 3), fadeOut: 80 }),
  'Electric hum': () => ({ kind: 'arc', pitch: pick([50, 60, 100, 120]), crackle: rr(0, 25), instab: rr(0, 20), hiss: rr(5, 25), dur: rr(3, 6), fadeIn: 200, fadeOut: 400 }),
  'Campfire': () => ({ kind: 'fire', density: lr(3, 10), roar: rr(30, 60), hiss: rr(20, 45), crackle: rr(50, 90), dur: rr(4, 8), fadeIn: 400, fadeOut: 600 }),
  'Big fire': () => ({ kind: 'fire', density: lr(10, 30), roar: rr(70, 100), hiss: rr(40, 70), crackle: rr(40, 70), dur: rr(4, 8), fadeIn: 400, fadeOut: 600 }),
  'Bubbling / boiling': () => ({ kind: 'liquid', density: lr(30, 150), shape: 'steady', sizeMin: lr(0.8, 2), sizeMax: lr(3, 8), rise: rr(15, 35), hiss: rr(0, 30), dur: rr(2, 5), fadeIn: 200, fadeOut: 400 }),
  'Drips': () => ({ kind: 'liquid', density: lr(1.5, 5), shape: 'steady', sizeMin: lr(2, 4), sizeMax: lr(5, 9), rise: rr(25, 50), hiss: 0, dur: rr(3, 6), width: rr(30, 70) }),
  'Potion / magic bubbles': () => ({ kind: 'liquid', density: lr(15, 60), shape: 'swell', sizeMin: lr(0.5, 1.2), sizeMax: lr(2, 4), rise: rr(50, 90), hiss: rr(0, 20), dur: rr(1.5, 3) }),
  'Light rain': () => ({ kind: 'rain', density: lr(80, 250), pitch: lr(2000, 5000), hard: rr(20, 50), hiss: rr(20, 40), dur: 6, fadeIn: 500, fadeOut: 800 }),
  'Heavy rain': () => ({ kind: 'rain', density: lr(600, 2000), pitch: lr(1500, 4000), hard: rr(30, 60), hiss: rr(60, 90), dur: 6, fadeIn: 500, fadeOut: 800 }),
  'Breeze': () => ({ kind: 'wind', pitch: lr(250, 600), gust: rr(20, 45), whistle: rr(0, 15), dur: 8, fadeIn: 1000, fadeOut: 1500 }),
  'Storm wind': () => ({ kind: 'wind', pitch: lr(400, 900), gust: rr(70, 100), whistle: rr(30, 70), dur: 8, fadeIn: 800, fadeOut: 1500 }),
  'Force field': () => ({ kind: 'energy', pitch: lr(70, 160), voices: ri(4, 7), detune: rr(10, 30), hiss: rr(30, 60), crackle: rr(10, 30), rate: lr(2, 8), depth: rr(20, 50), dur: rr(3, 5), fadeIn: 300, fadeOut: 500 }),
  'Reactor hum': () => ({ kind: 'energy', pitch: lr(40, 70), voices: ri(3, 6), detune: rr(4, 12), hiss: rr(10, 30), crackle: rr(0, 10), rate: lr(0.3, 1.5), depth: rr(10, 30), dur: rr(4, 6), fadeIn: 500, fadeOut: 800 }),
  'Portal': () => ({ kind: 'energy', pitch: lr(90, 220), voices: ri(5, 8), detune: rr(25, 50), hiss: rr(50, 90), crackle: rr(15, 40), rate: lr(4, 12), depth: rr(30, 60), sweep: rr(-3, 3), dur: rr(3, 5), fadeIn: 400, fadeOut: 600 }),
  'Charge up': () => ({ kind: 'energy', pitch: lr(60, 120), voices: ri(3, 6), detune: rr(10, 25), hiss: rr(40, 70), crackle: rr(20, 50), rate: lr(4, 10), depth: rr(20, 40), sweep: rr(12, 24), dur: rr(1.5, 3), fadeIn: 600, fadeOut: 40 }),
  'Deep rumble': () => ({ kind: 'rumble', pitch: lr(60, 120), gust: rr(30, 60), thuds: rr(0, 30), density: lr(0.2, 0.8), dur: 8, fadeIn: 1000, fadeOut: 1500 }),
  'Earthquake / distant battle': () => ({ kind: 'rumble', pitch: lr(90, 180), gust: rr(60, 90), thuds: rr(60, 100), density: lr(0.8, 3), dur: 8, fadeIn: 600, fadeOut: 1200 }),
};

/* ---------- Resynth: a measured recording as an editable object ---------- */
export const RESYNTH_GROUPS = [
  ['Measured object', [
    { k: 'modes', l: 'Modes used', min: 1, max: 48, step: 1, u: '', d: 24 },
    { k: 'shift', l: 'Size (pitch ×)', min: 0.25, max: 4, log: true, u: 'ratio', d: 1 },
    { k: 'ring', l: 'Ring time', min: 0.1, max: 8, log: true, u: 'ratio', d: 1 },
    { k: 'tilt', l: 'High modes ring', min: -100, max: 100, step: 1, u: '%', d: 0 },
    { k: 'stretch', l: 'Stiffness (spread)', min: -20, max: 20, step: 0.5, u: '%', d: 0 },
    { k: 'morphMat', l: 'Morph towards', type: 'select', opts: [['none', 'Nothing (as measured)'], ...MAT_OPTS], d: 'none' },
    { k: 'morphAmt', l: 'Morph amount', min: 0, max: 100, step: 1, u: '%', d: 60, show: { k: 'morphMat', in: Object.keys(MATERIALS) } },
    { k: 'keepAttack', l: 'Original attack', min: 0, max: 100, step: 1, u: '%', d: 60, show: CAUSE(['hit']) },
    { k: 'disp', l: 'Dispersion (chirp)', min: 0, max: 100, step: 1, u: '%', d: 0 },
    { k: 'pos', l: 'Strike position (re-hits)', min: 1, max: 50, step: 1, u: '%', d: 25 }]],
  ['Cause', [...IMPACT_GROUPS[0][1], { k: 'material', l: 'Contact and debris', type: 'select', opts: MAT_OPTS, d: 'steel' }]],
  IMPACT_GROUPS[2],
];
const RS = o => () => ({ cause: 'hit', ...o() });
export const RESYNTH_TYPES = {
  'As measured': RS(() => ({ shift: 1, ring: 1, keepAttack: 70 })),
  'Bigger and darker': RS(() => ({ shift: lr(0.4, 0.7), ring: lr(1.2, 2), tilt: rr(-40, -10), keepAttack: 40 })),
  'Smaller': RS(() => ({ shift: lr(1.6, 3), ring: lr(0.5, 0.9), keepAttack: 40 })),
  'Ring forever': RS(() => ({ ring: lr(3, 7), tilt: rr(0, 30), keepAttack: 50 })),
  'Dead and dull': RS(() => ({ ring: lr(0.15, 0.35), tilt: rr(-80, -40), keepAttack: 60 })),
  'Turn to glass': RS(() => ({ morphMat: 'glass', morphAmt: rr(60, 90), shift: lr(1.3, 2.2), stretch: rr(2, 8), keepAttack: 30 })),
  'Turn to wood': RS(() => ({ morphMat: 'wood', morphAmt: rr(70, 95), shift: lr(0.6, 1), material: 'wood', keepAttack: 40 })),
  'Turn to steel': RS(() => ({ morphMat: 'steel', morphAmt: rr(60, 90), keepAttack: 40 })),
  'Drop it': RS(() => ({ bounces: ri(3, 8), gap: lr(100, 250), restit: rr(45, 70), roll: rr(0, 40), keepAttack: 60 })),
  'Scrape it': () => ({ cause: 'scrape', dur: lr(600, 2000), rough: rr(30, 80), contact: rr(20, 50) }),
  'Roll it': () => ({ cause: 'roll', dur: lr(1200, 3000), speed: lr(4, 14), ring: lr(0.4, 0.9) }),
  'Break it': () => ({ cause: 'crack', clicks: ri(4, 9), dur: lr(150, 500), accel: rr(50, 85), debris: rr(50, 85), debrisPitch: lr(3, 7), spread: lr(400, 1200) }),
  'Blaster from it': RS(() => ({ ring: lr(0.08, 0.2), disp: rr(90, 100), keepAttack: 10 })),
};

/** All generator engines, in switch order. */
export const ENGINES = {
  synth: { name: 'Synth', render: 'synthGen', groups: GEN_GROUPS, types: GEN_TYPES,
    desc: 'Classic one-shot synthesis in the spirit of sfxr: oscillator, pitch slide, envelope and filter. Pick a type to roll a random sound of that kind.' },
  impact: { name: 'Impact', render: 'impactGen', groups: IMPACT_GROUPS, types: IMPACT_TYPES,
    desc: 'Physical model built as cause, object and aftermath: an action (hit, scrape, roll, crack) excites a resonant object of a chosen material and shape, followed by bounces, rolling, debris and rumble.' },
  resynth: { name: 'Resynth', render: 'resynthGen', groups: RESYNTH_GROUPS, types: RESYNTH_TYPES, measure: true,
    desc: 'Measures the resonant modes of a recorded hit, knock or clang (the selected sound) and turns it into an object you can strike, scrape, roll, bounce or break, resize, re-ring or morph into another material.' },
  texture: { name: 'Texture', render: 'textureGen', groups: TEXTURE_GROUPS, types: TEXTURE_TYPES,
    desc: 'Streams of small physical events and continuous phenomena: gravel, sparks, electricity, fire, bubbles, rain, wind, energy fields and rumble. Stereo, with fades, ready to loop or layer.' },
};
/** Flat list of an engine's parameter specs. */
export const engineSpecs = e => ENGINES[e].groups.flatMap(g => g[1]);
