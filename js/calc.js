// Cálculos de jornada. Jornada diaria de 8 h: lo que pase de 8 h es extra y lo que
// falte queda pendiente de compensar. Todas las horas se interpretan en Europe/Madrid (CET/CEST),
// independientemente de la zona horaria configurada en el dispositivo.

export const TZ = 'Europe/Madrid';
export const DAY_MS = 86400000;

export const DEFAULT_SETTINGS = {
  workStart: '07:00',
  workEnd: '15:00',
  workDays: [1, 2, 3, 4, 5], // 0 = domingo ... 6 = sábado
  holidays: [], // ['YYYY-MM-DD', ...]
  vacations: [], // [{ id, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }]
};

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const dtf = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Fecha/hora de pared en Madrid para un instante (ms UTC). */
export function zonedParts(ms) {
  const p = {};
  for (const { type, value } of dtf.formatToParts(new Date(ms))) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

function offsetAt(ms) {
  const t = ms - (((ms % 1000) + 1000) % 1000);
  const p = zonedParts(t);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - t;
}

/** Instante (ms UTC) de una hora de pared en Madrid. Admite desbordes (d + 1, etc.). */
export function zonedToUtc(y, m, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetAt(guess);
  const o2 = offsetAt(t);
  if (guess - o2 !== t) t = guess - o2;
  return t;
}

const pad = (n) => String(n).padStart(2, '0');

export function keyOf(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function dayKey(ms) {
  const p = zonedParts(ms);
  return keyOf(p.y, p.m, p.d);
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

export function weekdayOf(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const hm = (s) => s.split(':').map(Number);

export function fmtTime(ms) {
  const p = zonedParts(ms);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

export function fmtDate(ms) {
  const p = zonedParts(ms);
  return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

export function fmtKey(key) {
  const { y, m, d } = parseKey(key);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** Duración en formato H:MM (con signo si negativa). */
export function fmtDur(ms) {
  const sign = ms < 0 ? '-' : '';
  const totalMin = Math.round(Math.abs(ms) / 60000);
  return `${sign}${Math.floor(totalMin / 60)}:${pad(totalMin % 60)}`;
}

/** 'YYYY-MM-DDTHH:MM' (hora Madrid) para inputs datetime-local. */
export function toLocalInput(ms) {
  const p = zonedParts(ms);
  return `${keyOf(p.y, p.m, p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

export function fromLocalInput(value) {
  const [date, time] = value.split('T');
  const { y, m, d } = parseKey(date);
  const [h, mi] = hm(time);
  return zonedToUtc(y, m, d, h, mi);
}

/** ¿La fecha cae dentro de algún periodo de vacaciones? */
export function inVacation(key, settings) {
  return (settings.vacations || []).some((v) => key >= v.from && key <= v.to);
}

/** Tipo de día: Laborable, Festivo, Vacaciones, Fin de semana o No laborable. */
export function dayKind(y, m, d, settings) {
  const key = keyOf(y, m, d);
  const wd = weekdayOf(y, m, d);
  if (settings.holidays.includes(key)) return 'Festivo';
  if (!settings.workDays.includes(wd)) return wd === 0 || wd === 6 ? 'Fin de semana' : 'No laborable';
  if (inVacation(key, settings)) return 'Vacaciones';
  return 'Laborable';
}

/** Día en el que se espera fichar la jornada completa. */
export function isWorkday(y, m, d, settings) {
  return dayKind(y, m, d, settings) === 'Laborable';
}

/** Duración de la jornada diaria (por defecto 07:00–15:00 = 8 h). */
export function dailyTarget(settings) {
  const [sh, sm] = hm(settings.workStart);
  const [eh, em] = hm(settings.workEnd);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) * 60000);
}

/** Ventana del horario habitual [inicio, fin] en ms UTC (solo orientativa). */
export function workWindow(y, m, d, settings) {
  const [sh, sm] = hm(settings.workStart);
  const [eh, em] = hm(settings.workEnd);
  return [zonedToUtc(y, m, d, sh, sm), zonedToUtc(y, m, d, eh, em)];
}

/** Trocea un fichaje en segmentos por día natural (Madrid). */
export function splitByDay(start, end) {
  const out = [];
  let cur = start;
  while (cur < end) {
    const p = zonedParts(cur);
    const nextMidnight = zonedToUtc(p.y, p.m, p.d + 1);
    const segEnd = Math.min(end, nextMidnight);
    out.push({ key: keyOf(p.y, p.m, p.d), start: cur, end: segEnd });
    cur = segEnd;
  }
  return out;
}

function emptyDay(key, settings) {
  const { y, m, d } = parseKey(key);
  const kind = dayKind(y, m, d, settings);
  const workday = kind === 'Laborable';
  return { key, y, m, d, weekday: weekdayOf(y, m, d), kind, workday,
    expected: workday ? dailyTarget(settings) : 0,
    segments: [], extra: [], worked: 0, overtime: 0, pending: 0, balance: 0 };
}

/**
 * Cálculo de un día:
 *  worked   – tiempo total fichado (suma de todos los tramos, da igual el horario)
 *  expected – jornada que se espera ese día (8 h en laborables, 0 en festivos/vacaciones/fines de semana)
 *  overtime – horas extra: lo trabajado por encima de la jornada
 *  pending  – horas pendientes de compensar: lo que falta para llegar a la jornada
 *  extra    – tramos concretos de horas extra: lo trabajado a partir de completar
 *             la jornada (o todo, si el día no es laborable)
 */
function finishDay(day) {
  day.segments.sort((a, b) => a.start - b.start);
  let acc = 0;
  for (const seg of day.segments) {
    const len = seg.end - seg.start;
    const remaining = Math.max(0, day.expected - acc);
    if (len > remaining) {
      day.extra.push({ start: seg.start + remaining, end: seg.end, session: seg.session });
    }
    acc += len;
  }
  day.worked = acc;
  day.overtime = Math.max(0, acc - day.expected);
  day.pending = Math.max(0, day.expected - acc);
  day.balance = acc - day.expected;
  return day;
}

/** Redondea un instante al minuto (los fichajes se contabilizan por minutos completos). */
export const floorMinute = (ms) => Math.floor(ms / 60000) * 60000;

/** Agrupa los fichajes por día. Los fichajes abiertos se cuentan hasta `now`. */
export function computeDays(sessions, settings, now = Date.now()) {
  const days = new Map();
  for (const s of sessions) {
    const start = floorMinute(s.start);
    const end = floorMinute(s.end ?? now);
    if (end <= start) continue;
    for (const seg of splitByDay(start, end)) {
      if (!days.has(seg.key)) days.set(seg.key, emptyDay(seg.key, settings));
      days.get(seg.key).segments.push({ ...seg, session: s, open: s.end == null });
    }
  }
  for (const day of days.values()) finishDay(day);
  return days;
}

/** Cálculo de un único día (el de `now` por defecto). */
export function dayStats(key, sessions, settings, now = Date.now()) {
  const { y, m, d } = parseKey(key);
  const from = zonedToUtc(y, m, d);
  const to = zonedToUtc(y, m, d + 1);
  const relevant = sessions.filter((s) => s.start < to && (s.end ?? now) > from);
  return computeDays(relevant, settings, now).get(key) || emptyDay(key, settings);
}

/** Todos los días de un mes (hasta hoy si es el mes en curso) con sus cálculos. */
export function monthDays(y, m, sessions, settings, now = Date.now()) {
  const days = computeDays(sessions, settings, now);
  const todayKey = dayKey(now);
  const out = [];
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = keyOf(y, m, d);
    const day = days.get(key) || finishDay(emptyDay(key, settings));
    if (key > todayKey && day.segments.length === 0) continue;
    out.push(day);
  }
  return out;
}

export function sumDays(days) {
  const t = { worked: 0, expected: 0, overtime: 0, pending: 0, vacationDays: 0, workedDays: 0 };
  for (const d of days) {
    t.worked += d.worked;
    t.expected += d.expected;
    t.overtime += d.overtime;
    t.pending += d.pending;
    if (d.kind === 'Vacaciones') t.vacationDays++;
    if (d.segments.length) t.workedDays++;
  }
  t.balance = t.worked - t.expected;
  return t;
}

/** Días laborables (según el horario y festivos) dentro de un rango de fechas. */
export function workingDaysBetween(from, to, settings) {
  const a = parseKey(from);
  let count = 0;
  const base = { ...settings, vacations: [] };
  for (let i = 0; ; i++) {
    const dt = new Date(Date.UTC(a.y, a.m - 1, a.d + i));
    const key = keyOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    if (key > to) break;
    if (isWorkday(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), base)) count++;
  }
  return count;
}

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Festivos nacionales comunes en España (sin autonómicos ni locales). */
export function spanishNationalHolidays(y) {
  const e = easter(y);
  const goodFriday = new Date(Date.UTC(y, e.month - 1, e.day - 2));
  return [
    keyOf(y, 1, 1), keyOf(y, 1, 6),
    keyOf(y, goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate()),
    keyOf(y, 5, 1), keyOf(y, 8, 15), keyOf(y, 10, 12), keyOf(y, 11, 1),
    keyOf(y, 12, 6), keyOf(y, 12, 8), keyOf(y, 12, 25),
  ];
}

/** Número de serie de Excel para una hora de pared en Madrid. */
export function excelSerial(ms) {
  const p = zonedParts(ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) / DAY_MS + 25569;
}

export function excelDateSerial(key) {
  const { y, m, d } = parseKey(key);
  return Date.UTC(y, m - 1, d) / DAY_MS + 25569;
}
