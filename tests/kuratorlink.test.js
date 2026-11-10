// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLink, stripLink, manifestUrl, fileUrl, saveUrl, describe, LINK_FETCH } from '../src/app/kuratorlink.js';

const TOK = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

test('the Kurator link is read from the address hash', () => {
  assert.deepEqual(parseLink(`#kurator=http%3A%2F%2F127.0.0.1%3A8765&link=${TOK}`), { server: 'http://127.0.0.1:8765', token: TOK });
  assert.deepEqual(parseLink(`kurator=http://localhost:9000/&link=${TOK}`), { server: 'http://localhost:9000', token: TOK });
  assert.deepEqual(parseLink(`#kurator=http://[::1]:8765&link=${TOK}`), { server: 'http://[::1]:8765', token: TOK });
  assert.equal(parseLink(''), null);
  assert.equal(parseLink('#tab=fx'), null);
});

test('only a Kurator on this computer, over plain http, with a well-formed token', () => {
  for (const server of ['https://127.0.0.1:8765', 'http://192.168.1.5:8765', 'http://evil.example', 'http://127.0.0.1.evil.example',
    'http://user:pw@127.0.0.1:8765', 'http://127.0.0.1:8765/elsewhere', 'javascript:alert(1)', 'not a url']) {
    assert.equal(parseLink('#' + new URLSearchParams({ kurator: server, link: TOK })), null, server);
  }
  for (const token of ['short', 'has spaces in it and more', 'a/b'.repeat(10), 'x'.repeat(101)]) {
    assert.equal(parseLink('#' + new URLSearchParams({ kurator: 'http://127.0.0.1:8765', link: token })), null, token);
  }
});

test('the link leaves the address, other hash parts stay', () => {
  assert.equal(stripLink(`#kurator=http%3A%2F%2F127.0.0.1%3A8765&link=${TOK}`), '');
  assert.equal(stripLink(`#tab=gen&kurator=x&link=${TOK}`), '#tab=gen');
});

test('URLs of the link', () => {
  const link = { server: 'http://127.0.0.1:8765', token: TOK };
  assert.equal(manifestUrl(link), `http://127.0.0.1:8765/api/sfx/link/${TOK}`);
  assert.equal(fileUrl(link, 2), `http://127.0.0.1:8765/api/sfx/link/${TOK}/file/2`);
  assert.equal(saveUrl(link, 'gravel_fx.wav', [1, 1, 0, -1, 2.5]), `http://127.0.0.1:8765/api/sfx/link/${TOK}/save?name=gravel_fx.wav&src=1%2C0`);
  assert.equal(saveUrl(link, 'new & loud.wav'), `http://127.0.0.1:8765/api/sfx/link/${TOK}/save?name=new+%26+loud.wav`);
  assert.equal(LINK_FETCH.targetAddressSpace, 'loopback');
  assert.equal(LINK_FETCH.credentials, 'omit');
});

test('the line about the link', () => {
  assert.equal(describe({ files: [{ n: 0, name: 'a.wav' }, { n: 1, missing: true }], dest: 'foley', tags: ['SFX Workbench', '◆ Game'] }),
    '1 sound from Kurator. Saved sounds go to the folder foley, tagged SFX Workbench, ◆ Game.');
  assert.equal(describe({ files: [], dest: 'new', tags: [] }), 'Linked to Kurator. Saved sounds go to the folder new.');
});
