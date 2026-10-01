import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, zonedToUtc, zonedParts, computeDays, monthDays, sumDays,
  spanishNationalHolidays, fmtDur, fromLocalInput, toLocalInput,
} from '../js/calc.js';
import { monthWorkbook, monthIcs } from '../js/report.js';

const H = 3600000;
const st = { ...DEFAULT_SETTINGS };
const at = (y, m, d, h, mi = 0) => zonedToUtc(y, m, d, h, mi);
const sess = (id, a, b) => ({ id, start: a, end: b, source: 'button' });

test('zonedToUtc respeta CET y CEST', () => {
  assert.equal(new Date(at(2026, 1, 15, 7)).toISOString(), '2026-01-15T06:00:00.000Z');
  assert.equal(new Date(at(2026, 7, 15, 7)).toISOString(), '2026-07-15T05:00:00.000Z');
  assert.deepEqual(zonedParts(at(2026, 3, 29, 3, 30)).h, 3); // día del cambio de hora
});

test('jornada normal 07:00–15:00 sin horas extra', () => {
  const day = computeDays([sess('a', at(2026, 10, 1, 7), at(2026, 10, 1, 15))], st).get('2026-10-01');
  assert.equal(day.worked, 8 * H);
  assert.equal(day.outside, 0);
  assert.equal(day.expected, 8 * H);
});

test('salida a comer y vuelta por la tarde: lo de después de las 15:00 es extra', () => {
  const day = computeDays([
    sess('a', at(2026, 10, 1, 7), at(2026, 10, 1, 15)),
    sess('b', at(2026, 10, 1, 16), at(2026, 10, 1, 18, 30)),
  ], st).get('2026-10-01');
  assert.equal(day.worked, 10.5 * H);
  assert.equal(day.outside, 2.5 * H);
  assert.equal(day.extra.length, 1);
});

test('entrar antes de las 07:00 cuenta como extra', () => {
  const day = computeDays([sess('a', at(2026, 10, 1, 6, 30), at(2026, 10, 1, 15))], st).get('2026-10-01');
  assert.equal(day.outside, 0.5 * H);
  assert.equal(day.inSchedule, 8 * H);
});

test('sábado y festivos: todo es extra', () => {
  const sat = computeDays([sess('a', at(2026, 10, 3, 9), at(2026, 10, 3, 11))], st).get('2026-10-03');
  assert.equal(sat.outside, 2 * H);
  assert.equal(sat.expected, 0);
  const hol = { ...st, holidays: ['2026-10-12'] };
  const d = computeDays([sess('a', at(2026, 10, 12, 7), at(2026, 10, 12, 9))], hol).get('2026-10-12');
  assert.equal(d.kind, 'Festivo');
  assert.equal(d.outside, 2 * H);
});

test('un fichaje que cruza medianoche se reparte entre los dos días', () => {
  const days = computeDays([sess('a', at(2026, 10, 1, 22), at(2026, 10, 2, 1))], st);
  assert.equal(days.get('2026-10-01').worked, 2 * H);
  assert.equal(days.get('2026-10-02').worked, 1 * H);
  assert.equal(days.get('2026-10-02').outside, 1 * H);
});

test('fichaje abierto se cuenta hasta ahora', () => {
  const now = at(2026, 10, 1, 10);
  const day = computeDays([sess('a', at(2026, 10, 1, 7), null)], st, now).get('2026-10-01');
  assert.equal(day.worked, 3 * H);
});

test('resumen mensual no cuenta días futuros', () => {
  const now = at(2026, 10, 5, 12);
  const days = monthDays(2026, 10, [], st, now);
  assert.equal(days.length, 5);
  assert.equal(sumDays(days).expected, 3 * 8 * H); // 1, 2 y 5 de octubre son laborables
});

test('festivos nacionales incluyen Viernes Santo', () => {
  assert.ok(spanishNationalHolidays(2026).includes('2026-04-03'));
  assert.ok(spanishNationalHolidays(2027).includes('2027-03-26'));
});

test('formatos', () => {
  assert.equal(fmtDur(2.5 * H), '2:30');
  assert.equal(fmtDur(-0.25 * H), '-0:15');
  assert.equal(toLocalInput(fromLocalInput('2026-10-01T16:05')), '2026-10-01T16:05');
});

test('genera un .xlsx (zip) y un .ics', () => {
  const list = [
    sess('a', at(2026, 10, 1, 7), at(2026, 10, 1, 15)),
    sess('b', at(2026, 10, 1, 16), at(2026, 10, 1, 18)),
  ];
  const bytes = monthWorkbook(2026, 10, list, st, at(2026, 10, 2, 12));
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const ics = monthIcs(2026, 10, list, st, at(2026, 10, 2, 12));
  assert.match(ics, /DTSTART:20261001T140000Z/);
  assert.match(ics, /SUMMARY:Horas extra \(2:00\)/);
});
