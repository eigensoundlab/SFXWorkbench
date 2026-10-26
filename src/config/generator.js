// SPDX-License-Identifier: Apache-2.0
/**
 * Procedural generator: parameter specs (grouped for the UI) and the sound types that roll random settings.
 * Each GEN_TYPES entry returns a partial params object; missing keys use the spec defaults. DSP: src/dsp/generator.js.
 */

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
