// SPDX-License-Identifier: Apache-2.0
/**
 * Tiny IndexedDB key-value store for things that must survive reloads but cannot go in localStorage,
 * such as folder handles (File System Access API). Every call fails soft: storage can be blocked or cleared.
 */
const DB = 'sfx-workbench', STORE = 'kv';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(e => { dbp = null; throw e; });
  }
  return dbp;
}

function run(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  }));
}

export const kvGet = key => run('readonly', s => s.get(key)).catch(() => undefined);
export const kvSet = (key, value) => run('readwrite', s => s.put(value, key)).then(() => true).catch(() => false);
