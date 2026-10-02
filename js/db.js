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

// Avisos de cambios locales (los usa la sincronización con Google Drive)
const listeners = new Set();
let version = 0; // se incrementa al empezar cualquier cambio local
export const localVersion = () => version;
export function onLocalChange(fn) {
  listeners.add(fn);
}
function changed() {
  for (const fn of listeners) fn();
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Guarda un fichaje y marca la hora de modificación. */
export async function putSession(session) {
  version++;
  await wrap((await store('sessions', 'readwrite')).put({ ...session, updatedAt: Date.now() }));
  changed();
}

/** Borra un fichaje y deja constancia del borrado para que no reaparezca al sincronizar. */
export async function deleteSession(id) {
  version++;
  const db = await open();
  const tx = db.transaction(['sessions', 'meta'], 'readwrite');
  tx.objectStore('sessions').delete(id);
  const meta = tx.objectStore('meta');
  const req = meta.get('deleted');
  req.onsuccess = () => meta.put({ ...(req.result || {}), [id]: Date.now() }, 'deleted');
  await txDone(tx);
  changed();
}

/** Importa fichajes (copia de seguridad). */
export async function putSessions(list) {
  version++;
  const db = await open();
  const tx = db.transaction('sessions', 'readwrite');
  const s = tx.objectStore('sessions');
  const now = Date.now();
  for (const item of list) s.put({ ...item, updatedAt: now });
  await txDone(tx);
  changed();
}

export async function getMeta(key) {
  return wrap((await store('meta')).get(key));
}

export async function setMeta(key, value) {
  return wrap((await store('meta', 'readwrite')).put(value, key));
}

/** Guarda los ajustes y marca la hora de modificación. */
export async function saveSettings(settings) {
  version++;
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(settings, 'settings');
  tx.objectStore('meta').put(Date.now(), 'settingsUpdatedAt');
  await txDone(tx);
  changed();
}

/** Todos los datos sincronizables. */
export async function exportData() {
  const [sessions, settings, settingsUpdatedAt, deleted] = await Promise.all([
    allSessions(), getMeta('settings'), getMeta('settingsUpdatedAt'), getMeta('deleted'),
  ]);
  return { sessions, settings: settings || null, settingsUpdatedAt: settingsUpdatedAt || 0, deleted: deleted || {} };
}

/**
 * Sustituye todos los datos locales por los ya fusionados (sin avisar de cambios).
 * Si desde `expectedVersion` ha empezado algún cambio local, no hace nada y devuelve false
 * para que la sincronización vuelva a fusionar con los datos más recientes.
 */
export async function replaceData(data, expectedVersion) {
  const db = await open();
  if (expectedVersion !== undefined && expectedVersion !== version) return false;
  const tx = db.transaction(['sessions', 'meta'], 'readwrite');
  const s = tx.objectStore('sessions');
  s.clear();
  for (const item of data.sessions) s.put(item);
  const meta = tx.objectStore('meta');
  if (data.settings) meta.put(data.settings, 'settings');
  meta.put(data.settingsUpdatedAt || 0, 'settingsUpdatedAt');
  meta.put(data.deleted || {}, 'deleted');
  await txDone(tx);
  return true;
}

/** Pide al navegador que no borre los datos aunque falte espacio. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
