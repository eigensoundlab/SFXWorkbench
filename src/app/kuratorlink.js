// SPDX-License-Identifier: Apache-2.0
/**
 * The Kurator link, the pure part (no DOM, so it runs in Node tests).
 *
 * Kurator (a local asset manager) opens SFX Workbench with `#kurator=<its address>&link=<token>`. The part
 * after # never reaches the web server. The token lets this page read the sounds Kurator chose and save new
 * sounds into one folder of the user's library. Kurator only answers pages from SFX Workbench's own address.
 * This page only talks to a Kurator on this computer (loopback addresses), so a crafted link cannot make it
 * send sounds anywhere else.
 */

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const TOKEN = /^[A-Za-z0-9_-]{16,100}$/;

/** The link in an address hash, or null. Returns { server, token } with server like http://127.0.0.1:8765. */
export function parseLink(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const server = q.get('kurator'), token = q.get('link');
  if (!server || !token || !TOKEN.test(token)) return null;
  let u;
  try { u = new URL(server); } catch (e) { return null; }
  if (u.protocol !== 'http:' || !LOOPBACK.has(u.hostname) || u.username || u.password || (u.pathname !== '/' && u.pathname !== '')) return null;
  return { server: u.origin, token };
}

/** The hash without the link (other parts kept), so a bookmark or a shared address does not carry it. */
export function stripLink(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  q.delete('kurator'); q.delete('link');
  const rest = q.toString();
  return rest ? '#' + rest : '';
}

const base = link => `${link.server}/api/sfx/link/${encodeURIComponent(link.token)}`;
export const manifestUrl = link => base(link);
export const fileUrl = (link, n) => `${base(link)}/file/${n | 0}`;

/** Where a result is sent: its file name and the Kurator sounds it was made from (indexes into the link's list). */
export function saveUrl(link, name, src = []) {
  const q = new URLSearchParams({ name: String(name) });
  const from = [...new Set(src.filter(n => Number.isInteger(n) && n >= 0))];
  if (from.length) q.set('src', from.join(','));
  return `${base(link)}/save?${q}`;
}

/** One line about the link, from Kurator's description of it. */
export function describe(m) {
  const n = (m.files || []).filter(f => f && !f.missing).length;
  const what = n ? `${n} sound${n === 1 ? '' : 's'} from Kurator` : 'Linked to Kurator';
  const tags = (m.tags || []).join(', ');
  return `${what}. Saved sounds go to the folder ${m.dest}${tags ? `, tagged ${tags}` : ''}.`;
}

/** Fetch options for Kurator: Chrome asks the user once whether this site may connect to apps on this device. */
export const LINK_FETCH = { targetAddressSpace: 'loopback', mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' };
