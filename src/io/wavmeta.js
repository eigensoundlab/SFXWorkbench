// SPDX-License-Identifier: Apache-2.0
/**
 * Metadata that travels with a sound: the bext, iXML, XMP (_PMX) and LIST/INFO chunks of the WAV it came from
 * (field recorders, Ballistic Foley Lab, Kurator, sound libraries). A result made from a sound - the output,
 * variations, takes, loops, layers - keeps its source's chunks, updated for what this save changed:
 *   bext  a line for this save is added to the coding history; description, originator, date and time stay
 *   iXML  the file sample rate is set; the track list goes when the channel count changed
 *   XMP   SFX Workbench becomes the creator tool; keywords (subjects, Projects|..., Source|...), dates and rights stay
 *   INFO  as it was
 * So Kurator, Soundminer or REAPER still sort a result with the recording it came from. Pure: no DOM.
 */
export const TOOL = 'SFX Workbench';
const enc = new TextEncoder(), dec = new TextDecoder();

function ascii(s) { return Uint8Array.from(String(s).replace(/[^\x20-\x7e\r\n]/g, '?'), ch => ch.charCodeAt(0)); }
function latin1(b) { let s = ''; for (const x of b) s += String.fromCharCode(x); return s; }

/** The chunks for a save of this sound: { sr, channels, bits, isFloat } describe the file being written. */
export function carryMeta(chunks, { sr, channels, bits, isFloat, tool = TOOL } = {}) {
  if (!chunks || !chunks.length) return [];
  return chunks.map(c => {
    if (c.id === 'bext' && c.data.length >= 602) {
      let end = c.data.length;
      while (end > 602 && c.data[end - 1] === 0) end--;            // a null terminator or padding after the history
      const m = channels === 1 ? 'mono' : channels === 2 ? 'stereo' : `${channels} channels`;
      const line = ascii(`A=${isFloat ? 'PCM_FLOAT' : 'PCM'},F=${sr},W=${bits},M=${m},T=${tool}\r\n`);
      const out = new Uint8Array(end + line.length);
      out.set(c.data.subarray(0, end)); out.set(line, end);
      return { id: 'bext', data: out };
    }
    if (c.id === 'iXML') {
      let t = dec.decode(c.data);
      t = t.replace(/<FILE_SAMPLE_RATE>\s*\d+\s*<\/FILE_SAMPLE_RATE>/, `<FILE_SAMPLE_RATE>${sr}</FILE_SAMPLE_RATE>`);
      const tc = /<TRACK_COUNT>\s*(\d+)\s*<\/TRACK_COUNT>/.exec(t);
      if (tc && +tc[1] !== channels) t = t.replace(/[ \t]*<TRACK_LIST>[\s\S]*?<\/TRACK_LIST>\s*/, '');
      return { id: 'iXML', data: enc.encode(t) };
    }
    if (c.id === '_PMX') {
      let t = dec.decode(c.data);
      t = t.replace(/xmp:CreatorTool="[^"]*"/, `xmp:CreatorTool="${tool}"`).replace(/<xmp:CreatorTool>[^<]*<\/xmp:CreatorTool>/, `<xmp:CreatorTool>${tool}</xmp:CreatorTool>`);
      return { id: '_PMX', data: enc.encode(t) };
    }
    return { id: c.id, data: c.data };
  });
}

/** What the chunks say, in short, for the library: description, origin, date, project, keywords. */
export function metaSummary(chunks) {
  const out = { keywords: [] };
  for (const c of chunks || []) {
    if (c.id === 'bext' && c.data.length >= 338) {
      const t = (a, b) => latin1(c.data.subarray(a, b)).split('\0')[0].trim();
      out.description = t(0, 256); out.originator = t(256, 288); out.date = t(320, 330); out.time = t(330, 338);
    } else if (c.id === 'iXML') {
      const m = /<PROJECT>([^<]*)<\/PROJECT>/.exec(dec.decode(c.data));
      if (m && m[1].trim()) out.project = unxml(m[1].trim());
    } else if (c.id === '_PMX') {
      const t = dec.decode(c.data), block = /<lr:hierarchicalSubject>([\s\S]*?)<\/lr:hierarchicalSubject>/.exec(t) || /<dc:subject>([\s\S]*?)<\/dc:subject>/.exec(t);
      if (block) for (const m of block[1].matchAll(/<rdf:li[^>]*>([^<]*)<\/rdf:li>/g)) out.keywords.push(unxml(m[1].trim()).replace(/\|/g, '/'));
    }
  }
  return out;
}
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
