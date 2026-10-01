// Cálculos de jornada. Todas las horas se interpretan en Europe/Madrid (CET/CEST),
// independientemente de la zona horaria configurada en el dispositivo.

export const TZ = 'Europe/Madrid';
export const DAY_MS = 86400000;

export const DEFAULT_SETTINGS = {
  workStart: '07:00',
  workEnd: '15:00',
  workDays: [1, 2, 3, 4, 5], // 0 = domingo ... 6 = sábado
  holidays: [], // ['YYYY-MM-DD', ...]
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

export function isWorkday(y, m, d, settings) {
  return settings.workDays.includes(weekdayOf(y, m, d)) && !settings.holidays.includes(keyOf(y, m, d));
}

/** Ventana de jornada [inicio, fin] en ms UTC para un día laborable. */
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

/** Partes de un segmento que quedan fuera del horario (horas extra). */
export function outsidePieces(seg, settings) {
  const { y, m, d } = parseKey(seg.key);
  if (!isWorkday(y, m, d, settings)) return [{ start: seg.start, end: seg.end }];
  const [ws, we] = workWindow(y, m, d, settings);
  const pieces = [];
  if (seg.start < ws) pieces.push({ start: seg.start, end: Math.min(seg.end, ws) });
  if (seg.end > we) pieces.push({ start: Math.max(seg.start, we), end: seg.end });
  return pieces;
}

function emptyDay(key, settings) {
  const { y, m, d } = parseKey(key);
  const workday = isWorkday(y, m, d, settings);
  let kind = 'Laborable';
  if (settings.holidays.includes(key)) kind = 'Festivo';
  else if (!settings.workDays.includes(weekdayOf(y, m, d))) kind = 'Fin de semana';
  let expected = 0;
  if (workday) {
    const [ws, we] = workWindow(y, m, d, settings);
    expected = we - ws;
  }
  return { key, y, m, d, weekday: weekdayOf(y, m, d), kind, workday, expected,
    segments: [], extra: [], worked: 0, outside: 0, inSchedule: 0 };
}

/**
 * Agrupa los fichajes por día y calcula, para cada día:
 *  worked     – tiempo total fichado
 *  outside    – tiempo fuera del horario laboral (horas extra)
 *  inSchedule – tiempo dentro del horario
 *  expected   – duración de la jornada teórica
 * Los fichajes abiertos (sin salida) se cuentan hasta `now`.
 */
export function computeDays(sessions, settings, now = Date.now()) {
  const days = new Map();
  const get = (key) => {
    if (!days.has(key)) days.set(key, emptyDay(key, settings));
    return days.get(key);
  };
  for (const s of sessions) {
    const end = s.end ?? now;
    if (end <= s.start) continue;
    for (const seg of splitByDay(s.start, end)) {
      const day = get(seg.key);
      const len = seg.end - seg.start;
      const extra = outsidePieces(seg, settings);
      const out = extra.reduce((a, p) => a + (p.end - p.start), 0);
      day.segments.push({ ...seg, session: s, open: s.end == null });
      day.extra.push(...extra.map((p) => ({ ...p, session: s })));
      day.worked += len;
      day.outside += out;
      day.inSchedule += len - out;
    }
  }
  for (const day of days.values()) {
    day.segments.sort((a, b) => a.start - b.start);
    day.extra.sort((a, b) => a.start - b.start);
  }
  return days;
}

/** Todos los días de un mes (hasta hoy si es el mes en curso) con sus cálculos. */
export function monthDays(y, m, sessions, settings, now = Date.now()) {
  const days = computeDays(sessions, settings, now);
  const todayKey = dayKey(now);
  const out = [];
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = keyOf(y, m, d);
    const day = days.get(key) || emptyDay(key, settings);
    if (key > todayKey && day.segments.length === 0) continue;
    out.push(day);
  }
  return out;
}

export function sumDays(days) {
  const t = { worked: 0, outside: 0, inSchedule: 0, expected: 0 };
  for (const d of days) {
    t.worked += d.worked;
    t.outside += d.outside;
    t.inSchedule += d.inSchedule;
    t.expected += d.expected;
  }
  t.balance = t.worked - t.expected;
  return t;
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
