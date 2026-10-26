// SPDX-License-Identifier: Apache-2.0
/**
 * Effect-chain presets, grouped by category for the preset menu.
 * Each preset is a list of [effectType, params]; params not given use the defaults from src/config/effects.js.
 * Presets should work on arbitrary source sounds, so prefer relative moves (pitch, EQ, envelopes) and end with normalize when level matters.
 */

export const N1 = ['normalize', { target: -1 }];
export const PRESETS = {
  'Weapons': {
    'Rifle shot': [['comp', { thr: -20, ratio: 4, att: 8, rel: 120, makeup: 5 }], ['transient', { attack: 35, sustain: -20 }], ['distort', { type: 'soft', drive: 10, mix: 35 }], ['filter', { mode: 'highpass', freq: 35 }], ['eq', { lowGain: 3, lowFreq: 110, midGain: -2, midFreq: 450, highGain: 2, highFreq: 6000 }], ['reverb', { size: 65, damp: 55, predelay: 8, mix: 18, tail: 1.4 }], N1],
    'Pistol snap': [['pitch', { st: 3 }], ['transient', { attack: 70, sustain: -40 }], ['eq', { lowGain: -2, lowFreq: 150, midGain: 3, midFreq: 2500, highGain: 3, highFreq: 8000 }], ['comp', { thr: -18, ratio: 3, att: 5, rel: 80, makeup: 3 }], ['fade', { in: 0, out: 60 }], N1],
    'Shotgun boom': [['pitch', { st: -4 }], ['transient', { attack: 50, sustain: 10 }], ['distort', { type: 'soft', drive: 14, mix: 40 }], ['eq', { lowGain: 5, lowFreq: 90, midGain: -3, midFreq: 500, highGain: 0 }], ['reverb', { size: 75, damp: 60, predelay: 10, mix: 25, tail: 2 }], N1],
    'Silenced shot': [['filter', { mode: 'lowpass', freq: 2500 }], ['transient', { attack: 60, sustain: -60 }], ['fade', { in: 0, out: 120 }], ['normalize', { target: -6 }]],
    'Blaster (spring zap)': [['transient', { attack: 60, sustain: -60 }], ['disperse', { amount: 92, stages: 320, fb: 25, delay: 30, mix: 85 }], ['fade', { in: 0, out: 150 }], N1],
    'Laser zap': [['pitch', { st: 7, sweep: true, end: -14, curve: 'exp' }], ['ring', { freq: 220, sweep: true, freqEnd: 40, mix: 35 }], ['echo', { time: 90, fb: 35, damp: 5000, mix: 30 }], ['fade', { in: 0, out: 120 }], N1],
    'Plasma shot': [['pitch', { st: 5, sweep: true, end: -7, curve: 'exp' }], ['moddelay', { delay: 1.2, depth: 1.5, rate: 6, fb: 75, mix: 55 }], ['ring', { freq: 260, sweep: true, freqEnd: 60, mix: 30 }], ['reverb', { size: 50, damp: 40, predelay: 0, mix: 15, tail: 1 }], N1],
    'Energy charge-up': [['pitch', { st: -12, sweep: true, end: 12, curve: 'late' }], ['moddelay', { delay: 1.5, depth: 2, rate: 3, fb: 70, mix: 50 }], ['trem', { rate: 18, depth: 40 }], ['fade', { in: 150, out: 60 }], N1],
    'Reload / mechanism': [['filter', { mode: 'highpass', freq: 150 }], ['eq', { lowGain: -4, lowFreq: 200, midGain: 4, midFreq: 3000, midQ: 1.5, highGain: 2, highFreq: 9000 }], ['transient', { attack: 60, sustain: -50 }], ['comp', { thr: -22, ratio: 6, att: 1, rel: 60, makeup: 6 }], N1],
    'Melee swing': [['pitch', { st: 3, sweep: true, end: -3 }], ['filter', { mode: 'bandpass', freq: 800, sweep: true, freqEnd: 2500, q: 1.2 }], ['fade', { in: 30, out: 150 }], N1],
  },
  'Power & devices': {
    'Power up': [['pitch', { st: -12, sweep: true, end: 2, curve: 'exp' }], ['filter', { mode: 'lowpass', freq: 300, sweep: true, freqEnd: 12000 }], ['trem', { rate: 22, depth: 25 }], ['fade', { in: 80, out: 60 }], N1],
    'Power down': [['pitch', { st: 0, sweep: true, end: -24, curve: 'late' }], ['filter', { mode: 'lowpass', freq: 12000, sweep: true, freqEnd: 200 }], ['fade', { in: 0, out: 300 }], N1],
    'Device on': [['transient', { attack: 60, sustain: 0 }], ['pitch', { st: -5, sweep: true, end: 0, curve: 'exp' }], ['filter', { mode: 'highpass', freq: 60 }], ['fade', { in: 5, out: 50 }], N1],
    'Device off': [['pitch', { st: 0, sweep: true, end: -10, curve: 'late' }], ['filter', { mode: 'lowpass', freq: 8000, sweep: true, freqEnd: 600 }], ['fade', { in: 0, out: 250 }], N1],
    'Servo / motor': [['moddelay', { delay: 4, depth: 1, rate: 0.3, fb: 30, mix: 30 }], ['trem', { rate: 32, depth: 25 }], ['eq', { midGain: 4, midFreq: 1500, midQ: 2 }], N1],
    'Computer glitch': [['crush', { bits: 7, ds: 4, mix: 70 }], ['ring', { freq: 440, mix: 30 }], ['trem', { rate: 14, depth: 70, shape: 'square' }], N1],
    'Electric buzz': [['distort', { type: 'asym', drive: 16, mix: 60 }], ['eq', { lowGain: 3, lowFreq: 100, highGain: 4, highFreq: 5000 }], ['trem', { rate: 25, depth: 20, shape: 'square' }], N1],
    'Force field': [['moddelay', { delay: 2, depth: 3, rate: 0.8, fb: 80, mix: 60 }], ['filter', { mode: 'highpass', freq: 200 }], ['reverb', { size: 70, damp: 30, predelay: 0, mix: 35, tail: 2.5 }], N1],
    'Radio / comms': [['filter', { mode: 'bandpass', freq: 1800, q: 1.2 }], ['distort', { type: 'hard', drive: 14, mix: 60 }], ['crush', { bits: 10, ds: 3, mix: 50 }], N1],
    'Robot voice': [['ring', { freq: 95, mix: 65 }], ['crush', { bits: 9, ds: 2, mix: 60 }], ['moddelay', { delay: 2.5, depth: 1.5, rate: 0.6, fb: 60, mix: 45 }], N1],
  },
  'Movement & foley': {
    'Whoosh / swish': [['filter', { mode: 'bandpass', freq: 600, sweep: true, freqEnd: 3000, q: 1 }], ['fade', { in: 40, out: 160 }], N1],
    'Fast pass-by': [['pitch', { st: 3, sweep: true, end: -4 }], ['filter', { mode: 'lowpass', freq: 9000, sweep: true, freqEnd: 2500 }], ['fade', { in: 150, out: 300 }], N1],
    'Heavy footstep': [['pitch', { st: -3 }], ['eq', { lowGain: 5, lowFreq: 100, midGain: -3, midFreq: 600, highGain: -2, highFreq: 6000 }], ['transient', { attack: 40, sustain: -20 }], N1],
    'Light footstep': [['eq', { lowGain: -6, lowFreq: 150, highGain: 2, highFreq: 5000 }], ['fade', { in: 0, out: 40 }], ['normalize', { target: -6 }]],
    'Cloth / soft foley': [['filter', { mode: 'lowpass', freq: 6000 }], ['comp', { thr: -24, ratio: 3, att: 5, rel: 100, makeup: 4 }], ['eq', { lowGain: -3, lowFreq: 200 }], ['normalize', { target: -3 }]],
    'Big creature move': [['stretch', { factor: 1.4, method: 'wsola' }], ['pitch', { st: -7 }], ['eq', { lowGain: 4, lowFreq: 120 }], ['reverb', { size: 40, damp: 60, predelay: 5, mix: 12, tail: 1 }], N1],
  },
  'Inventory & UI': {
    'Pickup / collect': [['pitch', { st: 2, sweep: true, end: 7, curve: 'exp' }], ['eq', { highGain: 3, highFreq: 8000 }], ['echo', { time: 70, fb: 25, damp: 8000, mix: 20 }], ['fade', { in: 0, out: 80 }], N1],
    'Equip / holster': [['filter', { mode: 'highpass', freq: 120 }], ['transient', { attack: 50, sustain: -40 }], ['eq', { midGain: 3, midFreq: 2500 }], N1],
    'Coin / sparkle': [['pshift', { st: 12 }], ['echo', { time: 60, fb: 40, damp: 10000, mix: 30 }], ['eq', { highGain: 4, highFreq: 7000 }], N1],
    'Menu click': [['filter', { mode: 'highpass', freq: 300 }], ['transient', { attack: 40, sustain: -60 }], ['fade', { in: 0, out: 30 }], ['normalize', { target: -3 }]],
    'UI error / denied': [['pitch', { st: -5 }], ['crush', { bits: 8, ds: 2, mix: 40 }], ['trem', { rate: 18, depth: 60, shape: 'square' }], N1],
  },
  'Impacts': {
    'Body hit': [['eq', { lowGain: 4, lowFreq: 110, midGain: -2, midFreq: 700, highGain: -3, highFreq: 7000 }], ['transient', { attack: 60, sustain: -30 }], ['distort', { type: 'soft', drive: 6, mix: 30 }], N1],
    'Strike through metal': [['resonate', { material: 'steel', shape: 'plate', size: 420, modes: 18, ring: 0.8, mix: 75 }], N1],
    'Knock through wood': [['resonate', { material: 'wood', shape: 'box', size: 180, modes: 14, ring: 1, mix: 70 }], N1],
    'Ring as glass': [['resonate', { material: 'glass', shape: 'shell', size: 1800, modes: 10, ring: 1, mix: 60 }], N1],
    'Metal impact': [['eq', { midGain: 3, midFreq: 2500, midQ: 4, highGain: 4, highFreq: 6000 }], ['ring', { freq: 1200, mix: 15 }], ['reverb', { size: 40, damp: 20, predelay: 0, mix: 20, tail: 1.2 }], N1],
    'Giant impact': [['pitch', { st: -9 }], ['transient', { attack: 40, sustain: 20 }], ['reverb', { size: 75, damp: 60, predelay: 15, mix: 25, tail: 2.2 }], N1],
    'Debris / crumble': [['pitch', { st: -4 }], ['filter', { mode: 'lowpass', freq: 5000 }], ['echo', { time: 45, fb: 30, damp: 4000, mix: 25 }], N1],
    'Distant explosion': [['pitch', { st: -5 }], ['filter', { mode: 'lowpass', freq: 900 }], ['reverb', { size: 90, damp: 70, predelay: 40, mix: 50, tail: 3 }], ['normalize', { target: -3 }]],
    'Glass / bright': [['pshift', { st: 7 }], ['eq', { highGain: 5, highFreq: 6000 }], ['reverb', { size: 35, damp: 20, predelay: 0, mix: 15, tail: 0.8 }], N1],
  },
  'Space & character': {
    'Distant': [['filter', { mode: 'lowpass', freq: 1400 }], ['reverb', { size: 80, damp: 70, predelay: 35, mix: 45, tail: 2 }], ['gain', { db: -6 }]],
    'Through a wall': [['filter', { mode: 'lowpass', freq: 350 }], ['eq', { lowGain: 3, lowFreq: 90 }], ['gain', { db: -8 }]],
    'Underwater': [['filter', { mode: 'lowpass', freq: 500, q: 4 }], ['moddelay', { delay: 8, depth: 4, rate: 0.2, fb: 40, mix: 40 }], ['pitch', { st: -1 }], N1],
    'Small room': [['reverb', { size: 30, damp: 60, predelay: 2, mix: 25, tail: 0.8 }]],
    'Spring reverb': [['disperse', { amount: 70, stages: 150, fb: 70, delay: 45, mix: 35 }]],
    'Large hall': [['reverb', { size: 92, damp: 40, predelay: 25, mix: 35, tail: 4 }]],
    'Reverse swell': [['reverse', {}], ['reverb', { size: 90, damp: 40, predelay: 0, mix: 75, tail: 2.5 }], ['reverse', {}], ['fade', { in: 30, out: 20 }], N1],
    'Slow motion': [['pitch', { st: -7 }], ['stretch', { factor: 1.6, method: 'wsola' }], ['reverb', { size: 60, damp: 50, predelay: 10, mix: 20, tail: 1.5 }], N1],
    'Ambient smear': [['stretch', { factor: 6, method: 'smear' }], ['reverb', { size: 80, damp: 50, predelay: 0, mix: 40, tail: 3 }], ['fade', { in: 300, out: 800 }], N1],
    'Monster voice': [['pshift', { st: -9 }], ['distort', { type: 'soft', drive: 6, mix: 30 }], ['eq', { lowGain: 4, lowFreq: 150 }], N1],
    'Retro 8-bit': [['crush', { bits: 5, ds: 6, mix: 100 }], ['filter', { mode: 'lowpass', freq: 7000 }], N1],
  },
};
