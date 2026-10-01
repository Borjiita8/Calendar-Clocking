// Generación de informes mensuales (.xlsx y .ics) a partir de los fichajes.
import {
  DAY_MS, MONTHS, WEEKDAYS, monthDays, sumDays, excelSerial, excelDateSerial,
  parseKey, isWorkday, workWindow, fmtDur,
} from './calc.js';
import { buildXlsx, colName } from './xlsx.js';

const dur = (ms) => ({ v: ms / DAY_MS, s: 'dur' });
const hours = (ms) => ({ v: Math.round((ms / 3600000) * 100) / 100, s: 'num' });

function extraReason(piece, day, settings) {
  if (day.kind === 'Festivo') return 'Festivo';
  if (day.kind === 'Fin de semana') return 'Fin de semana';
  const { y, m, d } = parseKey(day.key);
  if (!isWorkday(y, m, d, settings)) return 'No laborable';
  const [ws] = workWindow(y, m, d, settings);
  return piece.end <= ws ? 'Antes de jornada' : 'Después de jornada';
}

export function monthFileName(y, m, ext) {
  return `fichajes_${y}-${String(m).padStart(2, '0')}.${ext}`;
}

/** Libro Excel con resumen, detalle diario, fichajes y horas extra del mes. */
export function monthWorkbook(y, m, sessions, settings, now = Date.now()) {
  const days = monthDays(y, m, sessions, settings, now);
  const tot = sumDays(days);
  const title = `${MONTHS[m - 1]} ${y}`;

  // Resumen diario
  const daily = [[
    'Fecha', 'Día', 'Tipo', 'Nº fichajes', 'Primera entrada', 'Última salida',
    'Trabajado', 'Jornada teórica', 'Dentro de horario', 'Horas extra', 'Balance (h)',
  ].map((v) => ({ v, s: 'header' }))];
  for (const day of days) {
    const first = day.segments[0];
    const last = day.segments[day.segments.length - 1];
    const sessionsCount = new Set(day.segments.map((s) => s.session.id)).size;
    daily.push([
      { v: excelDateSerial(day.key), s: 'date' },
      WEEKDAYS[day.weekday],
      day.kind,
      sessionsCount || null,
      first ? { v: excelSerial(first.start) % 1, s: 'time' } : null,
      last ? (last.open ? 'En curso' : { v: excelSerial(last.end) % 1 || 1, s: 'time' }) : null,
      dur(day.worked), dur(day.expected), dur(day.inSchedule), dur(day.outside),
      hours(day.worked - day.expected),
    ]);
  }
  const n = daily.length;
  const sum = (c) => `SUM(${colName(c)}2:${colName(c)}${n})`;
  daily.push([
    { v: 'TOTAL', s: 'bold' }, null, null, null, null, null,
    { v: tot.worked / DAY_MS, s: 'boldDur', f: sum(6) },
    { v: tot.expected / DAY_MS, s: 'boldDur', f: sum(7) },
    { v: tot.inSchedule / DAY_MS, s: 'boldDur', f: sum(8) },
    { v: tot.outside / DAY_MS, s: 'boldDur', f: sum(9) },
    { v: Math.round((tot.balance / 3600000) * 100) / 100, s: 'num', f: sum(10) },
  ]);

  // Fichajes (un tramo por día natural)
  const punches = [['Fecha', 'Día', 'Entrada', 'Salida', 'Duración', 'Horas extra', 'Origen', 'Nota']
    .map((v) => ({ v, s: 'header' }))];
  for (const day of days) {
    for (const seg of day.segments) {
      const extra = day.extra
        .filter((p) => p.session === seg.session && p.start >= seg.start && p.end <= seg.end)
        .reduce((a, p) => a + (p.end - p.start), 0);
      punches.push([
        { v: excelDateSerial(day.key), s: 'date' },
        WEEKDAYS[day.weekday],
        { v: excelSerial(seg.start) % 1, s: 'time' },
        seg.open ? 'En curso' : { v: excelSerial(seg.end) % 1 || 1, s: 'time' },
        dur(seg.end - seg.start),
        dur(extra),
        seg.session.source === 'manual' ? 'Manual' : 'Botón',
        seg.session.note || null,
      ]);
    }
  }

  // Horas extra: tramos listos para pasar al calendario de la empresa
  const extras = [['Fecha', 'Día', 'Desde', 'Hasta', 'Duración', 'Motivo']
    .map((v) => ({ v, s: 'header' }))];
  for (const day of days) {
    for (const p of day.extra) {
      extras.push([
        { v: excelDateSerial(day.key), s: 'date' },
        WEEKDAYS[day.weekday],
        { v: excelSerial(p.start) % 1, s: 'time' },
        { v: excelSerial(p.end) % 1 || 1, s: 'time' },
        dur(p.end - p.start),
        extraReason(p, day, settings),
      ]);
    }
  }
  const en = extras.length;
  extras.push([{ v: 'TOTAL', s: 'bold' }, null, null, null,
    { v: tot.outside / DAY_MS, s: 'boldDur', f: `SUM(E2:E${en})` }, null]);

  const summary = [
    [{ v: `Registro de jornada – ${title}`, s: 'bold' }, null],
    ['Horario', `${settings.workStart}–${settings.workEnd} (Europe/Madrid)`],
    ['Días laborables', settings.workDays.map((d) => WEEKDAYS[d]).join(', ')],
    [],
    [{ v: 'Concepto', s: 'header' }, { v: 'Horas', s: 'header' }],
    ['Horas trabajadas', dur(tot.worked)],
    ['Jornada teórica', dur(tot.expected)],
    ['Dentro de horario', dur(tot.inSchedule)],
    [{ v: 'Horas extra (fuera de horario)', s: 'bold' }, { v: tot.outside / DAY_MS, s: 'boldDur' }],
    ['Balance trabajado − teórico', `${fmtDur(tot.balance)} h`],
    [],
    ['Generado', { v: excelSerial(now), s: 'datetime' }],
  ];

  return buildXlsx([
    { name: 'Resumen', rows: summary, cols: [32, 28] },
    { name: 'Diario', rows: daily, cols: [12, 11, 14, 11, 15, 13, 11, 15, 17, 12, 12], freeze: true },
    { name: 'Fichajes', rows: punches, cols: [12, 11, 9, 10, 10, 12, 9, 40], freeze: true },
    { name: 'Horas extra', rows: extras, cols: [12, 11, 9, 9, 10, 20], freeze: true },
  ]);
}

const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Calendario .ics con un evento por cada tramo de horas extra del mes. */
export function monthIcs(y, m, sessions, settings, now = Date.now()) {
  const days = monthDays(y, m, sessions, settings, now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fichajes//ES', 'CALSCALE:GREGORIAN'];
  for (const day of days) {
    for (const p of day.extra) {
      if (p.session.end == null) continue;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${p.session.id}-${p.start}@fichajes`,
        `DTSTAMP:${icsDate(now)}`,
        `DTSTART:${icsDate(p.start)}`,
        `DTEND:${icsDate(p.end)}`,
        `SUMMARY:Horas extra (${fmtDur(p.end - p.start)})`,
        `DESCRIPTION:${extraReason(p, day, settings)}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
