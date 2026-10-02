import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeData, fingerprint, encode, decode, TOMBSTONE_TTL } from '../js/sync.js';

const NOW = Date.UTC(2026, 9, 2, 12);
const s = (id, start, updatedAt, extra = {}) => ({ id, start, end: start + 3600000, note: '', source: 'button', updatedAt, ...extra });
const data = (sessions = [], extra = {}) => ({ sessions, deleted: {}, settings: null, settingsUpdatedAt: 0, ...extra });

test('une los fichajes de dos dispositivos', () => {
  const m = mergeData(data([s('a', 1, 10)]), data([s('b', 2, 10)]), NOW);
  assert.deepEqual(m.sessions.map((x) => x.id), ['a', 'b']);
});

test('si un fichaje se editó en los dos, gana la versión más reciente', () => {
  const m = mergeData(data([s('a', 1, 10, { note: 'vieja' })]), data([s('a', 1, 20, { note: 'nueva' })]), NOW);
  assert.equal(m.sessions.length, 1);
  assert.equal(m.sessions[0].note, 'nueva');
  const m2 = mergeData(data([s('a', 1, 30, { note: 'local' })]), data([s('a', 1, 20, { note: 'drive' })]), NOW);
  assert.equal(m2.sessions[0].note, 'local');
});

test('un fichaje borrado en un dispositivo no reaparece desde el otro', () => {
  const local = data([], { deleted: { a: NOW - 1000 } });
  const remote = data([s('a', 1, NOW - 5000), s('b', 2, 10)]);
  const m = mergeData(local, remote, NOW);
  assert.deepEqual(m.sessions.map((x) => x.id), ['b']);
  assert.ok(m.deleted.a);
  // y en la siguiente sincronización del otro dispositivo tampoco
  const again = mergeData(remote, m, NOW);
  assert.deepEqual(again.sessions.map((x) => x.id), ['b']);
});

test('si se edita después de haberlo borrado en otro dispositivo, se conserva', () => {
  const m = mergeData(data([], { deleted: { a: 100 } }), data([s('a', 1, 200)]), 1000);
  assert.deepEqual(m.sessions.map((x) => x.id), ['a']);
});

test('los registros de borrado de más de un año se descartan', () => {
  const m = mergeData(data([], { deleted: { old: NOW - TOMBSTONE_TTL - 1, recent: NOW - 1000 } }), data(), NOW);
  assert.deepEqual(Object.keys(m.deleted), ['recent']);
});

test('ajustes: gana la versión más reciente; sin ajustes en un lado se usan los del otro', () => {
  const a = data([], { settings: { workStart: '07:00' }, settingsUpdatedAt: 50 });
  const b = data([], { settings: { workStart: '08:00' }, settingsUpdatedAt: 60 });
  assert.equal(mergeData(a, b, NOW).settings.workStart, '08:00');
  assert.equal(mergeData(b, a, NOW).settings.workStart, '08:00');
  assert.equal(mergeData(data(), a, NOW).settings.workStart, '07:00');
  assert.equal(mergeData(a, data(), NOW).settingsUpdatedAt, 50);
});

test('fusionar es idempotente y el orden no altera el resultado', () => {
  const a = data([s('a', 1, 10), s('c', 3, 10)], { deleted: { x: NOW - 10 } });
  const b = data([s('b', 2, 10), s('c', 3, 20, { note: 'n' })], { settings: { k: 1 }, settingsUpdatedAt: 5 });
  const ab = mergeData(a, b, NOW);
  assert.equal(fingerprint(ab), fingerprint(mergeData(b, a, NOW)));
  assert.equal(fingerprint(ab), fingerprint(mergeData(ab, ab, NOW)));
  assert.equal(fingerprint(ab), fingerprint(mergeData(ab, b, NOW)));
});

test('fichajes antiguos sin fecha de modificación se fusionan sin problemas', () => {
  const legacy = { id: 'a', start: 5, end: 10, createdAt: 7 };
  const m = mergeData(data([legacy]), data([{ ...legacy, note: 'editado', updatedAt: 9 }]), NOW);
  assert.equal(m.sessions[0].note, 'editado');
});

test('comprime y descomprime los datos sin pérdida', async () => {
  const d = mergeData(data([s('a', 1, 10, { note: 'ñandú – «prueba»' })], { settings: { a: 1 }, settingsUpdatedAt: 3 }), data(), NOW);
  const bytes = await encode(d, NOW);
  assert.equal(bytes[0], 0x1f); // cabecera gzip
  assert.equal(bytes[1], 0x8b);
  assert.equal(fingerprint(await decode(bytes)), fingerprint(d));
});

test('rechaza archivos que no son de la app o de una versión futura', async () => {
  const gz = async (obj) => new Uint8Array(await new Response(new Blob([JSON.stringify(obj)]).stream()
    .pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  await assert.rejects(decode(await gz({ foo: 1 })), /Formato/);
  await assert.rejects(decode(await gz({ app: 'fichajes', format: 99, sessions: [] })), /versión más nueva/);
});

test('tamaño: 10 años de fichajes ocupan poco en Drive', async () => {
  const sessions = [];
  for (let d = 0; d < 2600; d++) {
    for (let k = 0; k < 3; k++) {
      sessions.push(s(crypto.randomUUID(), d * 86400000 + k * 1e7, d * 86400000, { note: k === 2 ? 'Incidencia producción' : '' }));
    }
  }
  const bytes = await encode(data(sessions), NOW);
  assert.ok(bytes.length < 400 * 1024, `ocupa ${bytes.length} bytes`);
});
