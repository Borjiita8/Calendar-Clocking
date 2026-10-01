// Generación de informes mensuales (.xlsx y .ics) a partir de los fichajes.
import {
  DAY_MS, MONTHS, WEEKDAYS, monthDays, sumDays, excelSerial, excelDateSerial,
  fmtDur, fmtKey, dailyTarget,
} from './calc.js';
import { buildXlsx, colName } from './xlsx.js';

const dur = (ms) => ({ v: ms / DAY_MS, s: 'dur' });
const hours = (ms) => ({ v: Math.round((ms / 3600000) * 100) / 100, s: 'num' });
const clock = (ms) => ({ v: excelSerial(ms) % 1, s: 'time' });
// Una salida a medianoche se muestra como 24:00 (fracción 1 con formato [h]:mm)
const clockEnd = (ms) => (excelSerial(ms) % 1 ? clock(ms) : { v: 1, s: 'dur' });

function extraReason(day) {
  return day.kind === 'Laborable' ? 'Exceso sobre la jornada' : day.kind;
}

export function monthFileName(y, m, ext) {
  return `fichajes_${y}-${String(m).padStart(2, '0')}.${ext}`;
}

/** Libro Excel con resumen, detalle diario, fichajes y horas extra del mes. */
export function monthWorkbook(y, m, sessions, settings, now = Date.now()) {
  const days = monthDays(y, m, sessions, settings, now);
  const tot = sumDays(days);
  const title = `${MONTHS[m - 1]} ${y}`;

  // Diario
  const daily = [[
    'Fecha', 'Día', 'Tipo', 'Nº fichajes', 'Primera entrada', 'Última salida',
    'Trabajado', 'Jornada', 'Horas extra', 'Pendiente', 'Balance (h)',
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
      first ? clock(first.start) : null,
      last ? (last.open ? 'En curso' : clockEnd(last.end)) : null,
      dur(day.worked), dur(day.expected), dur(day.overtime), dur(day.pending),
      hours(day.balance),
    ]);
  }
  const n = daily.length;
  const sum = (c) => `SUM(${colName(c)}2:${colName(c)}${n})`;
  daily.push([
    { v: 'TOTAL', s: 'bold' }, null, null, null, null, null,
    { v: tot.worked / DAY_MS, s: 'boldDur', f: sum(6) },
    { v: tot.expected / DAY_MS, s: 'boldDur', f: sum(7) },
    { v: tot.overtime / DAY_MS, s: 'boldDur', f: sum(8) },
    { v: tot.pending / DAY_MS, s: 'boldDur', f: sum(9) },
    { v: Math.round((tot.balance / 3600000) * 100) / 100, s: 'num', f: sum(10) },
  ]);

  // Fichajes (un tramo por día natural)
  const punches = [['Fecha', 'Día', 'Entrada', 'Salida', 'Duración', 'De ello extra', 'Origen', 'Nota']
    .map((v) => ({ v, s: 'header' }))];
  for (const day of days) {
    for (const seg of day.segments) {
      const extra = day.extra
        .filter((p) => p.session === seg.session && p.start >= seg.start && p.end <= seg.end)
        .reduce((a, p) => a + (p.end - p.start), 0);
      punches.push([
        { v: excelDateSerial(day.key), s: 'date' },
        WEEKDAYS[day.weekday],
        clock(seg.start),
        seg.open ? 'En curso' : clockEnd(seg.end),
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
        clock(p.start),
        p.session.end == null ? 'En curso' : clockEnd(p.end),
        dur(p.end - p.start),
        extraReason(day),
      ]);
    }
  }
  const en = extras.length;
  extras.push([{ v: 'TOTAL', s: 'bold' }, null, null, null,
    { v: tot.overtime / DAY_MS, s: 'boldDur', f: `SUM(E2:E${en})` }, null]);

  const vacations = (settings.vacations || [])
    .filter((v) => v.to >= `${y}-${String(m).padStart(2, '0')}-01` && v.from <= `${y}-${String(m).padStart(2, '0')}-31`)
    .map((v) => (v.from === v.to ? fmtKey(v.from) : `${fmtKey(v.from)} – ${fmtKey(v.to)}`));

  const summary = [
    [{ v: `Registro de jornada – ${title}`, s: 'bold' }, null],
    ['Jornada diaria', `${fmtDur(dailyTarget(settings))} h (habitual ${settings.workStart}–${settings.workEnd}, Europe/Madrid)`],
    ['Días laborables', settings.workDays.map((d) => WEEKDAYS[d]).join(', ')],
    ['Criterio', 'Horas extra = lo trabajado por encima de la jornada diaria; en fines de semana, festivos y vacaciones todo es extra. Pendiente = lo que falta para completar la jornada.'],
    [],
    [{ v: 'Concepto', s: 'header' }, { v: 'Horas', s: 'header' }],
    ['Horas trabajadas', dur(tot.worked)],
    ['Jornada teórica', dur(tot.expected)],
    [{ v: 'Horas extra', s: 'bold' }, { v: tot.overtime / DAY_MS, s: 'boldDur' }],
    [{ v: 'Horas pendientes de compensar', s: 'bold' }, { v: tot.pending / DAY_MS, s: 'boldDur' }],
    ['Balance neto (extra − pendiente)', `${tot.balance > 0 ? '+' : ''}${fmtDur(tot.balance)} h`],
    ['Días con fichajes', tot.workedDays],
    ['Días de vacaciones', tot.vacationDays],
    ['Periodos de vacaciones', vacations.join(', ') || '—'],
    [],
    ['Generado', { v: excelSerial(now), s: 'datetime' }],
  ];

  return buildXlsx([
    { name: 'Resumen', rows: summary, cols: [32, 60] },
    { name: 'Diario', rows: daily, cols: [12, 11, 14, 11, 15, 13, 11, 10, 12, 11, 12], freeze: true },
    { name: 'Fichajes', rows: punches, cols: [12, 11, 9, 10, 10, 13, 9, 40], freeze: true },
    { name: 'Horas extra', rows: extras, cols: [12, 11, 9, 9, 10, 24], freeze: true },
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
        `DESCRIPTION:${extraReason(day)}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
