// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, examples } from './helpers.js';

const { gunshot } = examples();
const enc = new TextEncoder(), dec = new TextDecoder();
/* a bext body as Ballistic Foley Lab and field recorders write it: 602 bytes, then the coding history */
function bext(desc, date, time, hist) {
  const b = new Uint8Array(602 + hist.length + 1);
  const put = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  put(0, desc); put(256, 'Ballistic Foley Lab'); put(320, date); put(330, time); put(602, hist);
  return b;
}
const IXML = '<?xml version="1.0" encoding="UTF-8"?>\n<BWFXML>\n <PROJECT>Forest walk</PROJECT>\n <SPEED>\n  <FILE_SAMPLE_RATE>48000</FILE_SAMPLE_RATE>\n </SPEED>\n' +
  ' <TRACK_LIST>\n  <TRACK_COUNT>2</TRACK_COUNT>\n  <TRACK><CHANNEL_INDEX>1</CHANNEL_INDEX></TRACK>\n </TRACK_LIST>\n</BWFXML>\n';
const XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description rdf:about="" xmp:CreateDate="2026-11-15T05:42:10+01:00" xmp:CreatorTool="Ballistic Foley Lab">' +
  '<lr:hierarchicalSubject><rdf:Bag><rdf:li>Nature|Birds</rdf:li><rdf:li>Projects|Forest walk</rdf:li></rdf:Bag></lr:hierarchicalSubject></rdf:Description></rdf:RDF></x:xmpmeta>';
const INFO = (() => { const b = new Uint8Array(4 + 8 + 6); b.set(enc.encode('INFOINAM'), 0); new DataView(b.buffer).setUint32(8, 6, true); b.set(enc.encode('Kos 1\0'), 12); return b; })();
const CHUNKS = [{ id: 'bext', data: bext('Blackbird 1', '2026-11-15', '05:42:10', 'A=PCM,F=48000,W=24,M=stereo,T=Ballistic Foley Lab\r\n') },
  { id: 'iXML', data: enc.encode(IXML) }, { id: '_PMX', data: enc.encode(XMP) }, { id: 'LIST', data: INFO }];

test('a WAV keeps its bext, iXML, XMP and INFO chunks through decode and encode, and its audio bit-exactly', () => {
  const q = 2 ** 23, grid = gunshot.map(c => c.map(v => Math.round(v * q) / q));
  const bytes = D.encodeWav(grid, SR, 24, false, [...CHUNKS, { id: 'cue ', data: new Uint8Array(4) }]);
  const back = D.decodeWav(bytes.buffer);
  assert.deepEqual(back.chunks.map(c => c.id), ['bext', 'iXML', '_PMX', 'LIST'], 'cue points are not carried');
  back.chunks.forEach((c, i) => assert.deepEqual(Array.from(c.data), Array.from(CHUNKS[i].data)));
  const err = Math.max(...back.ch.map((c, k) => c.reduce((m, v, i) => Math.max(m, Math.abs(v - grid[k][i])), 0)));
  assert.ok(err < 1e-7, `audio error ${err}`);
  /* a WAV with an odd-length chunk stays readable */
  const odd = D.decodeWav(D.encodeWav(grid, SR, 16, false, [{ id: 'iXML', data: enc.encode('<BWFXML/>') }]).buffer);
  assert.equal(dec.decode(odd.chunks[0].data), '<BWFXML/>');
  assert.equal(odd.ch[0].length, grid[0].length);
});

test('a result carries its source metadata, updated for the save', () => {
  const out = D.carryMeta(CHUNKS, { sr: 44100, channels: 1, bits: 16, isFloat: false });
  const b = out[0].data, txt = (a, z) => dec.decode(b.subarray(a, z)).split('\0')[0];
  assert.equal(txt(0, 256), 'Blackbird 1'); assert.equal(txt(320, 330), '2026-11-15'); assert.equal(txt(330, 338), '05:42:10');
  assert.equal(dec.decode(b.subarray(602)), 'A=PCM,F=48000,W=24,M=stereo,T=Ballistic Foley Lab\r\nA=PCM,F=44100,W=16,M=mono,T=SFX Workbench\r\n');
  const ixml = dec.decode(out[1].data);
  assert.match(ixml, /<FILE_SAMPLE_RATE>44100<\/FILE_SAMPLE_RATE>/);
  assert.ok(!ixml.includes('TRACK_LIST'), 'the stereo track list does not describe a mono file');
  assert.match(ixml, /<PROJECT>Forest walk<\/PROJECT>/);
  const xmp = dec.decode(out[2].data);
  assert.match(xmp, /xmp:CreatorTool="SFX Workbench"/);
  assert.match(xmp, /<rdf:li>Nature\|Birds<\/rdf:li>/); assert.match(xmp, /xmp:CreateDate="2026-11-15T05:42:10\+01:00"/);
  assert.deepEqual(Array.from(out[3].data), Array.from(INFO));
  /* same channels: the track list stays */
  assert.match(dec.decode(D.carryMeta(CHUNKS, { sr: 48000, channels: 2, bits: 24 })[1].data), /<TRACK_LIST>/);
  assert.deepEqual(D.carryMeta(null, { sr: 48000 }), []);
});

test('the metadata summary names the date, origin, project and keywords', () => {
  const m = D.metaSummary(CHUNKS);
  assert.equal(m.description, 'Blackbird 1'); assert.equal(m.originator, 'Ballistic Foley Lab');
  assert.equal(m.date, '2026-11-15'); assert.equal(m.time, '05:42:10'); assert.equal(m.project, 'Forest walk');
  assert.deepEqual(m.keywords, ['Nature/Birds', 'Projects/Forest walk']);
});
