// Persistencia local en IndexedDB (los datos nunca salen del dispositivo).

const DB_NAME = 'fichajes';
const VERSION = 1;
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('start', 'start');
      db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function allSessions() {
  const list = await wrap((await store('sessions')).getAll());
  return list.sort((a, b) => a.start - b.start);
}

export async function putSession(session) {
  return wrap((await store('sessions', 'readwrite')).put(session));
}

export async function deleteSession(id) {
  return wrap((await store('sessions', 'readwrite')).delete(id));
}

export async function putSessions(list) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    const s = tx.objectStore('sessions');
    for (const item of list) s.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta(key) {
  return wrap((await store('meta')).get(key));
}

export async function setMeta(key, value) {
  return wrap((await store('meta', 'readwrite')).put(value, key));
}

/** Pide al navegador que no borre los datos aunque falte espacio. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
