// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, cleanName, readyMessage, importedMessage, describeImport, stemLayers, stackIsFree, IMPORT, MAX_FILES, MAX_STACK } from '../src/app/sendlink.js';
import { libraryRows, stemShortName } from '../src/app/libgroups.js';

const wav = (n = 64) => new ArrayBuffer(n);
const msg = over => ({ type: IMPORT, v: 1, id: 'ballistic-railgun-4821-action-m1abc', from: 'Ballistic Foley Lab', files: [{ name: 'shot.wav', bytes: wav() }], ...over });

test('an import request is read with its files, id, sender and group', () => {
  const m = parseImport(msg());
  assert.equal(m.id, 'ballistic-railgun-4821-action-m1abc');
  assert.equal(m.from, 'Ballistic Foley Lab');
  assert.equal(m.group, 'Ballistic Foley Lab', 'the group defaults to the sender');
  assert.equal(m.files.length, 1);
  assert.equal(m.files[0].name, 'shot.wav');
  assert.equal(m.files[0].role, 'mix');
  assert.equal(m.files[0].bytes.byteLength, 64);
  const s = parseImport(msg({ group: 'Weapons', files: [{ name: 'mix.wav', bytes: wav() }, { name: 'stem-1.wav', bytes: wav(), role: 'stem' }, { name: 'x.wav', bytes: wav(), role: 'odd' }] }));
  assert.equal(s.group, 'Weapons');
  assert.deepEqual(s.files.map(f => f.role), ['mix', 'stem', 'mix']);
});

test('anything else is ignored', () => {
  for (const bad of [null, 'text', 42, {}, msg({ type: 'other' }), msg({ v: 2 }), msg({ id: '' }), msg({ id: 'has spaces' }), msg({ id: 'x'.repeat(161) }),
    msg({ files: [] }), msg({ files: 'shot.wav' }), msg({ files: [{ name: 'a.wav' }] }), msg({ files: [{ name: 'a.wav', bytes: new ArrayBuffer(0) }] }),
    msg({ files: [{ name: 'a.wav', bytes: new Uint8Array(8) }] }), msg({ files: Array.from({ length: MAX_FILES + 1 }, () => ({ name: 'a.wav', bytes: wav() })) })]) {
    assert.equal(parseImport(bad), null, JSON.stringify(bad));
  }
});

test('file names lose folders and unsafe characters and keep an audio extension', () => {
  assert.equal(cleanName('../../etc/passwd'), 'passwd.wav');
  assert.equal(cleanName('C:\\sounds\\hit.WAV'), 'hit.WAV');
  assert.equal(cleanName('a<b>:c"d|e?f*.aiff'), 'abcdef.aiff');
  assert.equal(cleanName(''), 'sound.wav');
  assert.equal(cleanName(undefined), 'sound.wav');
  const long = cleanName('x'.repeat(300) + '.wav');
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('.wav'));
  const m = parseImport(msg({ from: 'Lab\u0007 ' + 'y'.repeat(100), group: '  ' }));
  assert.equal(m.from.length, 60);
  assert.equal(m.group, m.from, 'a blank group falls back to the sender');
});

test('answers carry the request id, and the toast says where the sounds went', () => {
  assert.deepEqual(readyMessage(), { type: 'sfxworkbench:ready', v: 1 });
  assert.deepEqual(importedMessage('abc', 2), { type: 'sfxworkbench:imported', v: 1, id: 'abc', count: 2 });
  assert.equal(describeImport({ names: ['shot'], from: 'Ballistic Foley Lab' }), 'Received shot from Ballistic Foley Lab.');
  assert.equal(describeImport({ names: ['a', 'b'] }), 'Received 2 sounds.');
  assert.equal(describeImport({ names: [] }), '');
  assert.match(describeImport({ names: ['shot'], stems: 4, from: 'Lab', stacked: true }), /^Received shot and its 4 stems from Lab\. The stems are in the layer stack/);
  assert.match(describeImport({ names: ['shot'], stems: 1, stacked: false }), /its stem\. Your layer stack was kept/);
});

test('stems become a layer stack in place, padded to four slots', () => {
  const rows = stemLayers([7, 8, 9]);
  assert.equal(rows.length, MAX_STACK);
  assert.deepEqual(rows.map(r => r.src), [7, 8, 9, null]);
  for (const r of rows) assert.deepEqual([r.offset, r.gain, r.pitch, r.pan, r.reverse, r.stretch, r.polarity, r.mute, r.solo], [0, 0, 0, 0, false, 1, 1, false, false]);
  assert.equal(stemLayers([1, 2, 3, 4, 5, 6]).length, MAX_STACK, 'never more than the stack holds');
});

test('received stems replace the layer stack only when the user has not built one', () => {
  const sounds = { 1: { origin: 'example' }, 2: { origin: 'file' }, 3: { origin: 'file', stemOf: 9 }, 4: { origin: 'file', stemOf: 9 } };
  const soundOf = id => sounds[id] || null;
  const L = (src, over) => ({ ...stemLayers([src])[0], ...over });
  assert.ok(stackIsFree([L(null), L(null)], soundOf), 'empty');
  assert.ok(stackIsFree([L(1, { offset: 880, gain: -8 }), L(null)], soundOf), 'only the built-in examples');
  assert.ok(stackIsFree([L(3), L(4), L(42)], soundOf), 'untouched stems from an earlier send, and a sound that is gone');
  assert.ok(!stackIsFree([L(2)], soundOf), 'a sound the user put there');
  assert.ok(!stackIsFree([L(3, { offset: 12 })], soundOf), 'a stem the user moved');
  assert.ok(!stackIsFree([L(4, { mute: true })], soundOf), 'a stem the user muted');
});

test('library rows gather each group where its first sound sits, open unless closed', () => {
  const s = (id, group) => ({ id, group });
  const rows = libraryRows([s(1), s(2, 'Lab'), s(3), s(4, 'Lab'), s(5, 'Kit')], { Kit: false });
  assert.deepEqual(rows.map(r => r.sound ? r.sound.id : r.group), [1, 'Lab', 3, 'Kit']);
  assert.deepEqual(rows[1].members.map(m => m.id), [2, 4]);
  assert.equal(rows[1].open, true);
  assert.equal(rows[3].open, false);
});

test('a stem is shown by what tells it apart from its mix', () => {
  assert.equal(stemShortName('ballistic-railgun-4821-stem-1-launcher', 'ballistic-railgun-4821-action'), 'stem-1-launcher');
  assert.equal(stemShortName('ballistic-laser-7-stem-3-impact', 'ballistic-laser-7-physics'), 'stem-3-impact');
  assert.equal(stemShortName('kick body', 'kick tail'), 'body');
  assert.equal(stemShortName('alpha', 'beta'), 'alpha', 'nothing shared: the full name');
  assert.equal(stemShortName('same', 'same'), 'same');
  assert.equal(stemShortName('snare', null), 'snare');
});
