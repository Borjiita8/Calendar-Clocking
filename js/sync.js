// Fusión de datos entre el dispositivo y la copia de Google Drive.
// Nunca se sustituye una copia por otra: se combinan fichaje a fichaje, de modo que
// lo registrado en cualquier dispositivo se conserva.

export const FORMAT = 1;
// Los registros de fichajes borrados se conservan un año para que un dispositivo que
// lleve tiempo sin conectarse no los vuelva a subir; después se descartan.
export const TOMBSTONE_TTL = 365 * 86400000;

const stamp = (s) => s.updatedAt ?? s.createdAt ?? s.start ?? 0;

/**
 * Combina dos conjuntos de datos { sessions, settings, settingsUpdatedAt, deleted }.
 *  - Fichajes: se unen; si un mismo fichaje existe en ambos, gana la versión modificada más tarde.
 *  - Borrados: un fichaje borrado desaparece salvo que se haya modificado después del borrado.
 *  - Ajustes: gana la versión modificada más tarde.
 */
export function mergeData(a, b, now = Date.now()) {
  const deleted = {};
  for (const src of [a.deleted, b.deleted]) {
    for (const [id, ts] of Object.entries(src || {})) {
      if (now - ts < TOMBSTONE_TTL) deleted[id] = Math.max(deleted[id] || 0, ts);
    }
  }
  const byId = new Map();
  for (const s of [...(a.sessions || []), ...(b.sessions || [])]) {
    const cur = byId.get(s.id);
    if (!cur || stamp(s) > stamp(cur)) byId.set(s.id, s);
  }
  const sessions = [...byId.values()]
    .filter((s) => !(deleted[s.id] >= stamp(s)))
    .sort((x, y) => x.start - y.start || (x.id < y.id ? -1 : 1));

  const aTs = a.settings ? a.settingsUpdatedAt || 0 : -1;
  const bTs = b.settings ? b.settingsUpdatedAt || 0 : -1;
  const newer = aTs >= bTs ? a : b;
  return {
    sessions,
    deleted,
    settings: newer.settings || null,
    settingsUpdatedAt: newer.settings ? newer.settingsUpdatedAt || 0 : 0,
  };
}

/** Representación canónica para comparar si dos conjuntos de datos son iguales. */
export function fingerprint(data) {
  const deleted = Object.keys(data.deleted || {}).sort().map((k) => [k, data.deleted[k]]);
  return JSON.stringify([data.sessions, data.settings, data.settingsUpdatedAt || 0, deleted]);
}

async function streamBytes(stream) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Serializa y comprime (gzip) los datos para guardarlos en Drive. */
export async function encode(data, now = Date.now()) {
  const json = JSON.stringify({ app: 'fichajes', format: FORMAT, savedAt: now, ...data });
  const input = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return streamBytes(input);
}

/** Descomprime y valida los datos descargados de Drive. */
export async function decode(bytes) {
  const input = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const data = JSON.parse(new TextDecoder().decode(await streamBytes(input)));
  if (data.app !== 'fichajes' || !Array.isArray(data.sessions)) throw new Error('Formato no reconocido');
  if (data.format > FORMAT) throw new Error('Los datos de Drive son de una versión más nueva de la app');
  return {
    sessions: data.sessions.filter((s) => s && s.id && Number.isFinite(s.start)),
    settings: data.settings || null,
    settingsUpdatedAt: data.settingsUpdatedAt || 0,
    deleted: data.deleted || {},
  };
}
