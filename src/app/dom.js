// SPDX-License-Identifier: Apache-2.0
/** Tiny DOM helpers. No framework: elements are built with h() and re-rendered by replaceChildren(). */

export const $ = (s, r = document) => r.querySelector(s);

/**
 * Create an element. attrs: class, text, value, checked, on<event> handlers, any other attribute.
 * null/false attributes and children are skipped.
 */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

export function playIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 10 10'); s.setAttribute('width', '10'); s.setAttribute('height', '10'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', 'M2 1l7 4-7 4z'); p.setAttribute('fill', 'currentColor');
  s.append(p);
  return s;
}

let toastTimer = 0;
/** Short status message at the bottom of the screen. kind 'err' stays longer and is red. */
export function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (kind === 'err' ? ' is-err' : ''); t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'err' ? 5200 : 2800);
}
