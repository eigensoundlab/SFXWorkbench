// SPDX-License-Identifier: Apache-2.0
/**
 * Shared data shapes (JSDoc only, no runtime code). Import types in editors with
 * `/** @typedef {import('./types.js').Channels} Channels *\/`.
 *
 * @typedef {Float32Array[]} Channels
 *   Audio as one Float32Array per channel, all the same length, samples in [-1, 1] (may exceed while processing).
 *
 * @typedef {{ sr: number, ch: Channels }} Audio
 *   Audio plus its sample rate in Hz.
 *
 * @typedef {Audio & { id: number, name: string, bits: number, isFloat: boolean,
 *   origin: 'file'|'example'|'generated'|'render', ver: number, undo: Channels[] }} Sound
 *   A library item. `bits`/`isFloat` describe the source file and are the default save format.
 *   `ver` increments on every edit and is part of every cache key.
 *
 * @typedef {{ id: number, type: string, on: boolean, p: Record<string, number|string|boolean> }} Effect
 *   One effect in the chain. `type` is a key of FX (src/dsp/effects.js) and FXDEF (src/config/effects.js).
 *
 * @typedef {{ a: number, b: number }} Region
 *   Sample range [a, b) in a sound.
 */
export {};
