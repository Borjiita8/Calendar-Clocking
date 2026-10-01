import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, zonedToUtc, zonedParts, computeDays, dayStats, monthDays, sumDays,
  spanishNationalHolidays, fmtDur, fromLocalInput, toLocalInput, workingDaysBetween, dailyTarget, weeklyTarget, validateSchedule,
} from '../js/calc.js';
import { monthWorkbook, monthIcs } from '../js/report.js';

const H = 3600000;
const M = 60000;
const st = { ...DEFAULT_SETTINGS };
const at = (y, m, d, h, mi = 0) => zonedToUtc(y, m, d, h, mi);
const sess = (id, a, b) => ({ id, start: a, end: b, source: 'button' });
const day = (sessions, key, settings = st, now) => computeDays(sessions, settings, now).get(key);

test('zonedToUtc respeta CET y CEST', () => {
  assert.equal(new Date(at(2026, 1, 15, 7)).toISOString(), '2026-01-15T06:00:00.000Z');
  assert.equal(new Date(at(2026, 7, 15, 7)).toISOString(), '2026-07-15T05:00:00.000Z');
  assert.equal(zonedParts(at(2026, 3, 29, 3, 30)).h, 3); // día del cambio de hora
});

test('jornada diaria = 8 h', () => {
  assert.equal(dailyTarget(st), 8 * H);
});

test('jornada normal 07:00–15:00: ni extra ni pendiente', () => {
  const d = day([sess('a', at(2026, 10, 1, 7), at(2026, 10, 1, 15))], '2026-10-01');
  assert.equal(d.worked, 8 * H);
  assert.equal(d.overtime, 0);
  assert.equal(d.pending, 0);
});

test('entrar tarde, parar a comer y volver: solo es extra lo que pasa de 8 h', () => {
  // 07:56–13:00 (5:04) + 14:00–17:30 (3:30) = 8:34 → 0:34 extra, no 2:30
  const list = [
    sess('a', at(2026, 10, 1, 7, 56), at(2026, 10, 1, 13)),
    sess('b', at(2026, 10, 1, 14), at(2026, 10, 1, 17, 30)),
  ];
  const d = day(list, '2026-10-01');
  assert.equal(d.worked, 8 * H + 34 * M);
  assert.equal(d.overtime, 34 * M);
  assert.equal(d.pending, 0);
  // el tramo extra es el final del día: desde que se completan las 8 h
  assert.equal(d.extra.length, 1);
  assert.equal(d.extra[0].start, at(2026, 10, 1, 16, 56));
  assert.equal(d.extra[0].end, at(2026, 10, 1, 17, 30));
});

test('trabajar menos de 8 h deja horas pendientes de compensar', () => {
  const d = day([sess('a', at(2026, 10, 1, 9), at(2026, 10, 1, 15))], '2026-10-01');
  assert.equal(d.pending, 2 * H);
  assert.equal(d.overtime, 0);
  assert.equal(d.balance, -2 * H);
});

test('salida a comer + vuelta por la tarde con jornada completa', () => {
  const d = day([
    sess('a', at(2026, 10, 1, 7), at(2026, 10, 1, 15)),
    sess('b', at(2026, 10, 1, 16), at(2026, 10, 1, 18, 30)),
  ], '2026-10-01');
  assert.equal(d.overtime, 2.5 * H);
  assert.equal(d.extra[0].start, at(2026, 10, 1, 16));
});

test('sábado y festivos: todo es extra y no hay pendiente', () => {
  const sat = day([sess('a', at(2026, 10, 3, 9), at(2026, 10, 3, 11))], '2026-10-03');
  assert.equal(sat.overtime, 2 * H);
  assert.equal(sat.expected, 0);
  const hol = { ...st, holidays: ['2026-10-12'] };
  const d = day([sess('a', at(2026, 10, 12, 7), at(2026, 10, 12, 9))], '2026-10-12', hol);
  assert.equal(d.kind, 'Festivo');
  assert.equal(d.overtime, 2 * H);
});

test('vacaciones: no se espera jornada y lo fichado es extra', () => {
  const vac = { ...st, vacations: [{ id: 'v', from: '2026-10-05', to: '2026-10-09' }] };
  const days = monthDays(2026, 10, [sess('a', at(2026, 10, 7, 10), at(2026, 10, 7, 11))], vac, at(2026, 10, 9, 20));
  const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
  assert.equal(byKey['2026-10-06'].kind, 'Vacaciones');
  assert.equal(byKey['2026-10-06'].expected, 0);
  assert.equal(byKey['2026-10-06'].pending, 0);
  assert.equal(byKey['2026-10-07'].overtime, 1 * H);
  const tot = sumDays(days);
  assert.equal(tot.vacationDays, 5);
  assert.equal(tot.expected, 2 * 8 * H); // solo 1 y 2 de octubre (5–9 son vacaciones)
  // un solo día de vacaciones
  const one = { ...st, vacations: [{ id: 'v', from: '2026-10-02', to: '2026-10-02' }] };
  assert.equal(dayStats('2026-10-02', [], one, at(2026, 10, 2, 20)).kind, 'Vacaciones');
});

test('días laborables de un periodo de vacaciones', () => {
  assert.equal(workingDaysBetween('2026-10-05', '2026-10-18', st), 10);
  assert.equal(workingDaysBetween('2026-10-03', '2026-10-03', st), 0);
  assert.equal(workingDaysBetween('2026-10-12', '2026-10-13', { ...st, holidays: ['2026-10-12'] }), 1);
});

test('un fichaje que cruza medianoche se reparte entre los dos días', () => {
  const days = computeDays([sess('a', at(2026, 10, 1, 22), at(2026, 10, 2, 1))], st);
  assert.equal(days.get('2026-10-01').worked, 2 * H);
  assert.equal(days.get('2026-10-02').worked, 1 * H);
});

test('fichaje abierto se cuenta hasta ahora', () => {
  const now = at(2026, 10, 1, 10);
  const d = dayStats('2026-10-01', [sess('a', at(2026, 10, 1, 7), null)], st, now);
  assert.equal(d.worked, 3 * H);
  assert.equal(d.pending, 5 * H);
});

test('resumen mensual no cuenta días futuros', () => {
  const days = monthDays(2026, 10, [], st, at(2026, 10, 5, 12));
  assert.equal(days.length, 5);
  assert.equal(sumDays(days).expected, 3 * 8 * H);
});

test('festivos nacionales incluyen Viernes Santo', () => {
  assert.ok(spanishNationalHolidays(2026).includes('2026-04-03'));
  assert.ok(spanishNationalHolidays(2027).includes('2027-03-26'));
});

test('los segundos no cuentan: se contabiliza por minutos', () => {
  const d = day([sess('a', at(2026, 10, 1, 7) + 42000, at(2026, 10, 1, 15) + 59999)], '2026-10-01');
  assert.equal(d.worked, 8 * H);
  assert.equal(d.overtime, 0);
});

test('formatos', () => {
  assert.equal(fmtDur(2.5 * H), '2:30');
  assert.equal(fmtDur(-0.25 * H), '-0:15');
  assert.equal(toLocalInput(fromLocalInput('2026-10-01T16:05')), '2026-10-01T16:05');
});

test('genera un .xlsx (zip) y un .ics con el tramo extra correcto', () => {
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

test('break: la jornada es el horario menos el break', () => {
  const partida = { ...st, workStart: '08:00', workEnd: '17:00', breakMinutes: 60 };
  assert.equal(dailyTarget(partida), 8 * H);
  const dosHoras = { ...st, workStart: '09:00', workEnd: '19:00', breakMinutes: 120 };
  assert.equal(dailyTarget(dosHoras), 8 * H);
  const media = { ...st, workStart: '08:00', workEnd: '16:00', breakMinutes: 30 };
  assert.equal(dailyTarget(media), 7.5 * H);
  // jornada partida 08:00–13:00 y 14:00–17:30 con 1 h de break: 8:30 trabajadas → 0:30 extra
  const d = day([
    sess('a', at(2026, 10, 1, 8), at(2026, 10, 1, 13)),
    sess('b', at(2026, 10, 1, 14), at(2026, 10, 1, 17, 30)),
  ], '2026-10-01', partida);
  assert.equal(d.expected, 8 * H);
  assert.equal(d.overtime, 30 * M);
});

test('horario personalizado por día', () => {
  const custom = {
    ...st,
    customSchedule: true,
    days: {
      0: { work: false, start: '07:00', end: '15:00', breakMinutes: 0 },
      1: { work: true, start: '08:00', end: '18:00', breakMinutes: 120 }, // 8 h
      2: { work: true, start: '08:00', end: '17:00', breakMinutes: 60 }, // 8 h
      3: { work: true, start: '08:00', end: '17:00', breakMinutes: 60 },
      4: { work: true, start: '08:00', end: '17:00', breakMinutes: 60 },
      5: { work: true, start: '08:00', end: '14:00', breakMinutes: 0 }, // viernes intensivo 6 h
      6: { work: true, start: '10:00', end: '14:00', breakMinutes: 0 }, // sábado 4 h
    },
  };
  assert.equal(dailyTarget(custom, 5), 6 * H);
  assert.equal(weeklyTarget(custom), 42 * H);
  // viernes 2/10/2026: 08:00–14:30 → 0:30 extra
  const fri = day([sess('a', at(2026, 10, 2, 8), at(2026, 10, 2, 14, 30))], '2026-10-02', custom);
  assert.equal(fri.expected, 6 * H);
  assert.equal(fri.overtime, 30 * M);
  // sábado laborable en este horario: no todo es extra
  const sat = day([sess('a', at(2026, 10, 3, 10), at(2026, 10, 3, 13))], '2026-10-03', custom);
  assert.equal(sat.kind, 'Laborable');
  assert.equal(sat.pending, 1 * H);
  // domingo libre
  assert.equal(day([sess('a', at(2026, 10, 4, 10), at(2026, 10, 4, 11))], '2026-10-04', custom).overtime, 1 * H);
  // al desactivarlo se vuelve al horario general sin perder el personalizado
  assert.equal(dailyTarget({ ...custom, customSchedule: false }, 5), 8 * H);
});

test('validación del horario', () => {
  assert.equal(validateSchedule({ start: '08:00', end: '17:00', breakMinutes: 60 }), null);
  assert.match(validateSchedule({ start: '15:00', end: '07:00', breakMinutes: 0 }), /posterior/);
  assert.match(validateSchedule({ start: '08:00', end: '09:00', breakMinutes: 60 }), /break/);
});
