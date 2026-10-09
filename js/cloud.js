// Sincronización opcional con el Google Drive del usuario.
// Los datos se guardan en la carpeta privada de la aplicación (appDataFolder): no aparece entre
// los archivos del usuario y ninguna otra app ni persona puede leerla.
import { GOOGLE_CLIENT_ID } from './config.js';
import * as db from './db.js';
import { mergeData, fingerprint, encode, decode } from './sync.js';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SCOPES = `${DRIVE_SCOPE} openid email`;
const FILE_NAME = 'fichajes.json.gz';
const GIS_URL = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com';
const TOKEN_KEY = 'fichajes.google.token';

export const enabled = Boolean(GOOGLE_CLIENT_ID);

const state = {
  status: enabled ? 'signedOut' : 'off', // off | signedOut | syncing | ok | pending | offline | error
  email: null,
  lastSync: null,
  message: '',
};
const listeners = new Set();
let token = loadToken();
let tokenClient = null;
let gisPromise = null;
let pending = null; // { promise, resolve, reject } de la petición de token en curso
let running = null;
let rerun = false;
let timer = null;
let onRemoteData = () => {};

export function getState() {
  return { ...state };
}

export function subscribe(fn) {
  listeners.add(fn);
}

function set(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(getState());
}

// Avisos puntuales para la interfaz: renovando, renovada, fallo al renovar, sesión iniciada
const eventListeners = new Set();
export function onEvent(fn) {
  eventListeners.add(fn);
}
function emit(type, data = {}) {
  for (const fn of eventListeners) fn({ type, email: state.email, ...data });
}

// ---------- Token de acceso ----------

function loadToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY));
    return t && t.exp > Date.now() ? t : null;
  } catch {
    return null;
  }
}

function storeToken(t) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* almacenamiento no disponible */ }
}

const tokenValid = () => token && token.exp > Date.now() + 60000;

function loadGis() {
  gisPromise ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('No se pudo cargar el inicio de sesión de Google'));
    };
    document.head.appendChild(s);
  }).then(() => {
    tokenClient ??= window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (!pending) return;
        if (resp.error) return pending.reject(new Error(resp.error_description || resp.error));
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
          return pending.reject(new Error('Hay que permitir el acceso a Google Drive para sincronizar'));
        }
        storeToken({ value: resp.access_token, exp: Date.now() + Number(resp.expires_in || 3600) * 1000 });
        pending.resolve(token.value);
      },
      error_callback: (err) => {
        if (pending) {
          pending.reject(new Error(err?.type === 'popup_closed'
            ? 'Inicio de sesión cancelado' : 'No se pudo abrir la ventana de Google'));
        }
      },
    });
  });
  return gisPromise;
}

/**
 * Pide un token a Google. Debe llamarse dentro de una acción del usuario (toque o clic),
 * porque Google abre una ventana emergente; si ya se dio permiso, se cierra sola.
 */
function requestToken(prompt = '') {
  if (!tokenClient) return Promise.reject(new Error('El inicio de sesión de Google aún no está listo'));
  if (pending) return pending.promise;
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  pending = { promise, resolve, reject };
  promise.then(() => { pending = null; }, () => { pending = null; });
  const opts = { prompt };
  if (state.email) opts.hint = state.email;
  tokenClient.requestAccessToken(opts);
  return promise;
}

// ---------- Llamadas a Google ----------

class AuthError extends Error {}

async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  if (!tokenValid()) throw new AuthError('Sesión caducada');
  const res = await fetch(`${API}${path}`, {
    method,
    body,
    headers: { Authorization: `Bearer ${token.value}`, ...headers },
  });
  if (res.status === 401) {
    storeToken(null);
    throw new AuthError('Sesión caducada');
  }
  if (!res.ok) throw new Error(`Google Drive respondió ${res.status}`);
  if (raw) return new Uint8Array(await res.arrayBuffer());
  return res.status === 204 ? null : res.json();
}

async function findFile() {
  const cached = await db.getMeta('cloudFileId');
  if (cached) return cached;
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const r = await api(`/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=10`);
  const id = r.files?.[0]?.id || null;
  if (id) await db.setMeta('cloudFileId', id);
  return id;
}

async function download(id) {
  try {
    return await api(`/drive/v3/files/${id}?alt=media`, { raw: true });
  } catch (e) {
    if (/ 404$/.test(e.message)) {
      await db.setMeta('cloudFileId', null);
      return null;
    }
    throw e;
  }
}

async function upload(id, bytes) {
  let fileId = id;
  if (!fileId) {
    const meta = await api('/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/gzip' }),
    });
    fileId = meta.id;
    await db.setMeta('cloudFileId', fileId);
  }
  await api(`/upload/drive/v3/files/${fileId}?uploadType=media&fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/gzip' },
    body: bytes,
  });
}

// ---------- Sincronización ----------

async function doSync() {
  set({ status: 'syncing', message: '' });
  const id = await findFile();
  const remoteBytes = id ? await download(id) : null;
  const remote = remoteBytes ? await decode(remoteBytes) : null;
  const version = db.localVersion();
  const local = await db.exportData();
  const merged = mergeData(local, remote || { sessions: [] });
  const fp = fingerprint(merged);
  if (fp !== fingerprint(local)) {
    // Si mientras tanto se ha fichado o editado algo, se repite la fusión con esos cambios
    if (!(await db.replaceData(merged, version))) {
      rerun = true;
      return;
    }
    onRemoteData();
  }
  if (!remote || fp !== fingerprint(remote)) {
    await upload(remote ? id : null, await encode(merged));
  }
  const now = Date.now();
  await db.setMeta('cloudAccount', { email: state.email, lastSync: now });
  set({ status: 'ok', lastSync: now, message: '' });
}

/** Sincroniza ahora (si hay token válido). Las llamadas simultáneas se encadenan. */
export async function sync() {
  if (!enabled || !state.email) return;
  if (running) {
    rerun = true;
    return running;
  }
  if (!tokenValid()) {
    set({ status: 'pending', message: 'Toca para sincronizar' });
    return;
  }
  if (!navigator.onLine) {
    set({ status: 'offline', message: 'Sin conexión: se sincronizará al recuperarla' });
    return;
  }
  running = (async () => {
    try {
      do {
        rerun = false;
        await doSync();
      } while (rerun);
    } catch (e) {
      if (e instanceof AuthError) set({ status: 'pending', message: 'Toca para sincronizar' });
      else if (!navigator.onLine || e instanceof TypeError) set({ status: 'offline', message: 'Sin conexión: se sincronizará al recuperarla' });
      else set({ status: 'error', message: e.message });
    } finally {
      running = null;
    }
  })();
  return running;
}

function schedule(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(sync, delay);
}

/** Renueva la sesión de Google avisando a la interfaz para que muestre la transición. */
function renew() {
  emit('renewing');
  return requestToken('').then((t) => {
    emit('renewed');
    return t;
  }, (e) => {
    emit('renew-failed', { message: e.message });
    throw e;
  });
}

/**
 * Llamar al principio de cualquier acción del usuario que modifique datos: si la sesión de
 * Google ha caducado, la renueva aprovechando el toque (Google solo permite abrir su ventana
 * como respuesta a una acción del usuario).
 */
export function touch() {
  if (!enabled || !state.email || tokenValid() || !tokenClient) return;
  renew().then(() => schedule(300), () => set({ status: 'pending', message: 'Toca para sincronizar' }));
}

/** Sincronización pedida explícitamente por el usuario (botón). */
export async function syncNow() {
  if (!state.email) return;
  try {
    if (!tokenValid()) await renew();
    await sync();
  } catch (e) {
    set({ status: 'pending', message: e.message });
  }
}

/** Inicio de sesión: elegir cuenta, dar permiso y sincronizar. */
export async function signIn() {
  if (!tokenClient) {
    set({ message: 'Cargando Google… vuelve a pulsar en unos segundos' });
    loadGis().catch((e) => set({ status: 'error', message: e.message }));
    return;
  }
  try {
    await requestToken('select_account');
    const info = await api('/oauth2/v3/userinfo');
    await db.setMeta('cloudFileId', null);
    await db.setMeta('cloudAccount', { email: info.email, lastSync: null });
    set({ email: info.email, lastSync: null });
    emit('signed-in');
    await sync();
  } catch (e) {
    set({ status: state.email ? 'error' : 'signedOut', message: e.message });
  }
}

/** Cierra la sesión y retira el permiso. Los datos del dispositivo se conservan. */
export async function signOut() {
  if (token && window.google?.accounts?.oauth2) {
    try { window.google.accounts.oauth2.revoke(token.value, () => {}); } catch { /* sin conexión */ }
  }
  storeToken(null);
  await db.setMeta('cloudAccount', null);
  await db.setMeta('cloudFileId', null);
  set({ status: 'signedOut', email: null, lastSync: null, message: '' });
}

/** Borra la copia de Google Drive y cierra la sesión. Los datos del dispositivo se conservan. */
export async function deleteRemote() {
  if (!tokenValid()) await renew();
  const id = await findFile();
  if (id) await api(`/drive/v3/files/${id}`, { method: 'DELETE' });
  await signOut();
}

/** Prepara la sincronización al arrancar la app. */
export async function init({ onData }) {
  onRemoteData = onData;
  if (!enabled) return;
  db.onLocalChange(() => schedule());
  window.addEventListener('online', () => schedule(500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(500); });
  const account = await db.getMeta('cloudAccount');
  if (account?.email) {
    set({ email: account.email, lastSync: account.lastSync, status: 'pending', message: '' });
    sync();
  }
  // Se carga por adelantado para poder abrir la ventana de Google al primer toque
  loadGis().catch(() => { /* sin conexión: se reintentará al iniciar sesión */ });
}
