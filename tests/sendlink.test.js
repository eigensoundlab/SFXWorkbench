// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, cleanName, readyMessage, importedMessage, describeImport, IMPORT, MAX_FILES } from '../src/app/sendlink.js';

const wav = (n = 64) => new ArrayBuffer(n);
const msg = over => ({ type: IMPORT, v: 1, id: 'ballistic-railgun-4821-action-m1abc', from: 'Ballistic Foley Lab', files: [{ name: 'shot.wav', bytes: wav() }], ...over });

test('an import request is read with its files, id and sender', () => {
  const m = parseImport(msg());
  assert.equal(m.id, 'ballistic-railgun-4821-action-m1abc');
  assert.equal(m.from, 'Ballistic Foley Lab');
  assert.equal(m.files.length, 1);
  assert.equal(m.files[0].name, 'shot.wav');
  assert.equal(m.files[0].bytes.byteLength, 64);
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
  assert.equal(parseImport(msg({ from: 'Lab\u0007 ' + 'y'.repeat(100) })).from.length, 60);
});

test('answers carry the request id', () => {
  assert.deepEqual(readyMessage(), { type: 'sfxworkbench:ready', v: 1 });
  assert.deepEqual(importedMessage('abc', 2), { type: 'sfxworkbench:imported', v: 1, id: 'abc', count: 2 });
  assert.equal(describeImport(['shot'], 'Ballistic Foley Lab'), 'Received shot from Ballistic Foley Lab');
  assert.equal(describeImport(['a', 'b'], ''), 'Received 2 sounds');
  assert.equal(describeImport([], 'x'), '');
});
