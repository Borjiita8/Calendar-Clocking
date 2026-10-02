import * as db from './db.js';
import * as cloud from './cloud.js';
import {
  DEFAULT_SETTINGS, WEEKDAYS, MONTHS, monthDays, sumDays, dayStats, dayKey, zonedParts,
  zonedToUtc, dailyTarget, floorMinute, scheduleFor, scheduleTarget, describeSchedule,
  validateSchedule, generalDays, weeklyTarget, weekdayOf, workingDaysBetween, fmtTime, fmtDur, fmtKey, toLocalInput,
  fromLocalInput, spanishNationalHolidays,
} from './calc.js';
import { monthWorkbook, monthIcs, monthFileName } from './report.js';

const $ = (sel) => document.querySelector(sel);
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const pad = (n) => String(n).padStart(2, '0');

const state = {
  sessions: [],
  settings: { ...DEFAULT_SETTINGS },
  view: 'fichar',
  editing: null,
};

const openSession = () => state.sessions.find((s) => s.end == null);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2800);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function todayKey() {
  return dayKey(Date.now());
}

function currentMonthValue() {
  const p = zonedParts(Date.now());
  return `${p.y}-${pad(p.m)}`;
}

function parseMonth(value) {
  const [y, m] = (value || currentMonthValue()).split('-').map(Number);
  return { y, m };
}

/** Fichajes que se solapan con el intervalo [a, b). */
function overlapping(a, b, exceptId) {
  const now = Date.now();
  return state.sessions.find((s) => s.id !== exceptId && a < (s.end ?? now) && b > s.start);
}

async function reload() {
  state.sessions = await db.allSessions();
  render();
}

// ---------- Fichar ----------

async function clockIn() {
  if (openSession()) return;
  cloud.touch();
  const s = { id: newId(), start: floorMinute(Date.now()), end: null, note: '', source: 'button', createdAt: Date.now() };
  await db.putSession(s);
  navigator.vibrate?.(60);
  toast(`Clock in a las ${fmtTime(s.start)}`);
  await reload();
}

async function clockOut() {
  const s = openSession();
  if (!s) return;
  cloud.touch();
  s.end = floorMinute(Date.now());
  s.updatedAt = Date.now();
  if (s.end <= floorMinute(s.start)) {
    // Entrada y salida en el mismo minuto: se descarta el fichaje vacío
    await db.deleteSession(s.id);
    toast('Fichaje de menos de un minuto descartado');
  } else {
    await db.putSession(s);
    toast(`Clock out a las ${fmtTime(s.end)} · ${fmtDur(s.end - s.start)}`);
  }
  navigator.vibrate?.([40, 60, 40]);
  await reload();
}

function scheduleHint(now, today, open) {
  const st = state.settings;
  const sched = scheduleFor(st, weekdayOf(today.y, today.m, today.d));
  const target = fmtDur(today.expected);
  if (!today.workday) {
    return `Hoy: ${today.kind.toLowerCase()}. No se espera jornada; todo lo que fiches cuenta como horas extra.`;
  }
  if (today.worked === 0) return `Jornada de hoy: ${target} h (horario habitual ${describeSchedule(sched)}).`;
  if (today.pending > 0) {
    return open
      ? `Completas tus ${target} h a las ${fmtTime(now + today.pending)}. A partir de ahí, horas extra.`
      : `Te faltan ${fmtDur(today.pending)} para completar la jornada de ${target} h.`;
  }
  return `Jornada de ${target} h completada${today.overtime ? ` · +${fmtDur(today.overtime)} extra` : ''}.`
    + (open ? ' Todo lo que sigas trabajando es extra.' : '');
}

function sessionItem(seg) {
  const s = seg.session;
  const end = seg.open ? '<em>en curso</em>' : fmtTime(seg.end);
  const tag = s.source === 'manual' ? '<span class="tag">manual</span>' : '';
  const note = s.note ? `<div class="note">${esc(s.note)}</div>` : '';
  return `<li data-id="${s.id}">
    <div class="sess-main">
      <span>${fmtTime(seg.start)} → ${end}</span>
      <strong>${fmtDur(seg.end - seg.start)}</strong>
    </div>${tag}${note}</li>`;
}

function renderFichar() {
  const now = Date.now();
  const p = zonedParts(now);
  $('#clock-time').textContent = `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
  $('#clock-date').textContent = `${WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]}, ${p.d} de ${MONTHS[p.m - 1].toLowerCase()} de ${p.y}`;

  const key = dayKey(now);
  const today = dayStats(key, state.sessions, state.settings, now);
  const open = openSession();
  $('#btn-in').disabled = !!open;
  $('#btn-out').disabled = !open;
  $('#status-card').classList.toggle('working', !!open);
  $('#status-card').classList.toggle('vacation', !open && today.kind === 'Vacaciones');
  const openOtherDay = open && dayKey(open.start) !== key;
  $('#status-text').textContent = open
    ? `Trabajando desde las ${fmtTime(open.start)}${openOtherDay ? ` del ${fmtKey(dayKey(open.start))}` : ''}`
    : (today.kind === 'Vacaciones' ? 'De vacaciones 🏖' : 'Fuera de turno');
  $('#status-timer').textContent = open ? fmtDur(floorMinute(now) - floorMinute(open.start)) : '';
  const warn = $('#status-warn');
  warn.hidden = !openOtherDay;
  if (openOtherDay) {
    warn.textContent = '⚠ Este fichaje sigue abierto desde otro día. Si olvidaste hacer clock out, toca aquí para corregir la hora de salida.';
  }
  $('#schedule-hint').textContent = scheduleHint(now, today, open);
  $('#late-btn').textContent = open ? '🕘 Clock out con otra hora' : '🕘 Clock in con otra hora';

  $('#today-worked').textContent = fmtDur(today.worked);
  $('#today-pending').textContent = fmtDur(today.pending);
  $('#today-extra').textContent = fmtDur(today.overtime);
  $('#today-list').innerHTML = today.segments.length
    ? today.segments.map((seg) => sessionItem(seg)).join('')
    : '<li class="empty">Sin fichajes hoy</li>';
}

// ---------- Fichar con otra hora (hoy) ----------

function openLate() {
  const open = openSession();
  const now = Date.now();
  const p = zonedParts(now);
  $('#late-title').textContent = open ? 'Clock out con otra hora' : 'Clock in con otra hora';
  $('#late-text').textContent = open
    ? `Indica a qué hora dejaste de trabajar hoy (entrada a las ${fmtTime(open.start)}).`
    : 'Indica a qué hora empezaste a trabajar hoy (por ejemplo 07:56). Quedarás fichado como trabajando desde esa hora.';
  $('#late-label').textContent = open ? 'Hora de salida' : 'Hora de entrada';
  $('#late-time').value = !open && dayStats(dayKey(now), state.sessions, state.settings, now).segments.length === 0
    ? (scheduleFor(state.settings, weekdayOf(p.y, p.m, p.d))?.start || state.settings.workStart)
    : `${pad(p.h)}:${pad(p.mi)}`;
  $('#late-error').textContent = '';
  $('#late-dialog').showModal();
}

async function saveLate(ev) {
  ev.preventDefault();
  cloud.touch();
  const err = (msg) => { $('#late-error').textContent = msg; };
  const now = Date.now();
  const p = zonedParts(now);
  const [h, mi] = $('#late-time').value.split(':').map(Number);
  if (!Number.isFinite(h)) return err('Indica una hora.');
  const t = zonedToUtc(p.y, p.m, p.d, h, mi);
  if (t > now) return err('La hora no puede ser posterior a la actual.');
  const open = openSession();
  if (open) {
    if (t <= open.start) return err(`La salida debe ser posterior a la entrada (${fmtTime(open.start)}).`);
    await db.putSession({ ...open, end: t, updatedAt: now });
    toast(`Clock out a las ${fmtTime(t)} · ${fmtDur(t - open.start)}`);
  } else {
    const clash = overlapping(t, now);
    if (clash) {
      return err(`Se solapa con el fichaje ${fmtTime(clash.start)}–${fmtTime(clash.end)}. Elige una hora posterior a las ${fmtTime(clash.end)}.`);
    }
    await db.putSession({ id: newId(), start: t, end: null, note: '', source: 'manual', createdAt: now });
    toast(`Clock in a las ${fmtTime(t)}`);
  }
  navigator.vibrate?.(60);
  $('#late-dialog').close();
  await reload();
}

// ---------- Vacaciones ----------

function renderVacations() {
  const list = [...(state.settings.vacations || [])].sort((a, b) => b.from.localeCompare(a.from));
  const today = todayKey();
  $('#vac-list').innerHTML = list.length ? list.map((v) => {
    const n = workingDaysBetween(v.from, v.to, state.settings);
    const range = v.from === v.to ? fmtKey(v.from) : `${fmtKey(v.from)} – ${fmtKey(v.to)}`;
    return `<li class="${v.to < today ? 'past' : ''}"><div>${range}
      <small>${n} día${n === 1 ? '' : 's'} laborable${n === 1 ? '' : 's'}</small></div>
      <button type="button" data-vac="${v.id}" aria-label="Eliminar">✕</button></li>`;
  }).join('') : '<li class="empty">No hay vacaciones registradas</li>';
}

function openVacations() {
  const t = todayKey();
  $('#vac-from').value = t;
  $('#vac-to').value = t;
  $('#vac-error').textContent = '';
  renderVacations();
  $('#vac-dialog').showModal();
}

async function addVacation(ev) {
  ev.preventDefault();
  const from = $('#vac-from').value;
  const to = $('#vac-to').value || from;
  const err = (msg) => { $('#vac-error').textContent = msg; };
  if (!from) return err('Indica la fecha de inicio.');
  if (to < from) return err('La fecha de fin no puede ser anterior a la de inicio.');
  const clash = (state.settings.vacations || []).find((v) => from <= v.to && to >= v.from);
  if (clash) return err(`Se solapa con las vacaciones del ${fmtKey(clash.from)} al ${fmtKey(clash.to)}.`);
  const n = workingDaysBetween(from, to, state.settings);
  await saveSettings({ vacations: [...(state.settings.vacations || []), { id: newId(), from, to }] });
  err('');
  renderVacations();
  toast(`Vacaciones añadidas: ${n} día${n === 1 ? '' : 's'} laborable${n === 1 ? '' : 's'}`);
}

async function removeVacation(id) {
  const v = state.settings.vacations.find((x) => x.id === id);
  if (!v || !confirm(`¿Eliminar las vacaciones ${v.from === v.to ? `del ${fmtKey(v.from)}` : `del ${fmtKey(v.from)} al ${fmtKey(v.to)}`}?`)) return;
  await saveSettings({ vacations: state.settings.vacations.filter((x) => x.id !== id) });
  renderVacations();
}

// ---------- Historial ----------

function renderHistorial() {
  const { y, m } = parseMonth($('#hist-month').value);
  const all = monthDays(y, m, state.sessions, state.settings);
  const tot = sumDays(all);
  $('#hist-worked').textContent = fmtDur(tot.worked);
  $('#hist-extra').textContent = fmtDur(tot.overtime);
  $('#hist-pending').textContent = fmtDur(tot.pending);
  const days = all.filter((d) => d.segments.length).reverse();
  $('#hist-list').innerHTML = days.length ? days.map((d) => `
    <div class="card day">
      <div class="day-head">
        <div><strong>${WEEKDAYS[d.weekday]} ${d.d}</strong> <span class="muted">${d.kind !== 'Laborable' ? d.kind : ''}</span></div>
        <div class="day-tot">${fmtDur(d.worked)}${d.overtime ? ` <span class="extra">+${fmtDur(d.overtime)}</span>` : ''}${d.pending ? ` <span class="pending">−${fmtDur(d.pending)}</span>` : ''}</div>
      </div>
      <ul class="sessions">${d.segments.map((seg) => sessionItem(seg)).join('')}</ul>
    </div>`).join('') : '<p class="empty">No hay fichajes este mes.</p>';
}

// ---------- Informes ----------

function renderInformes() {
  const { y, m } = parseMonth($('#rep-month').value);
  const tot = sumDays(monthDays(y, m, state.sessions, state.settings));
  $('#rep-title').textContent = `${MONTHS[m - 1]} ${y}`;
  $('#rep-worked').textContent = fmtDur(tot.worked);
  $('#rep-expected').textContent = fmtDur(tot.expected);
  $('#rep-extra').textContent = fmtDur(tot.overtime);
  $('#rep-pending').textContent = fmtDur(tot.pending);
  $('#rep-balance').textContent = (tot.balance > 0 ? '+' : '') + fmtDur(tot.balance);
  $('#rep-days').textContent = tot.workedDays;
  $('#rep-vac').textContent = tot.vacationDays;
}

function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function reportXlsx() {
  const { y, m } = parseMonth($('#rep-month').value);
  return { name: monthFileName(y, m, 'xlsx'), data: monthWorkbook(y, m, state.sessions, state.settings) };
}

// ---------- Ajustes ----------

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const breakValue = (v) => (v === '' || v == null ? 0 : Math.round(Number(v)));

function targetText(sched) {
  const t = fmtDur(scheduleTarget(sched));
  if (!sched.breakMinutes) return `${t} h al día (jornada continua)`;
  return `${t} h al día (${sched.start}–${sched.end} menos ${fmtDur(sched.breakMinutes * 60000)} de break)`;
}

function renderAjustes() {
  const st = state.settings;
  const custom = !!st.customSchedule;
  $('#set-custom').checked = custom;
  $('#general-schedule').hidden = custom;
  $('#custom-schedule').hidden = !custom;
  $('#set-start').value = st.workStart;
  $('#set-end').value = st.workEnd;
  $('#set-break').value = st.breakMinutes ? st.breakMinutes : '';
  $('#set-days').innerHTML = ORDER.map((d) => `
    <label class="day-toggle"><input type="checkbox" value="${d}" ${st.workDays.includes(d) ? 'checked' : ''}>
    <span>${WEEKDAYS[d].slice(0, 3)}</span></label>`).join('');
  if (custom) {
    $('#custom-schedule').innerHTML = ORDER.map((wd) => {
      const d = st.days[wd];
      return `<div class="cday ${d.work ? '' : 'off'}" data-wd="${wd}">
        <div class="cday-head">
          <label class="check"><input type="checkbox" data-f="work" ${d.work ? 'checked' : ''}> ${WEEKDAYS[wd]}</label>
          <span class="cday-hours">${d.work ? `${fmtDur(scheduleTarget(d))} h` : 'Libre'}</span>
        </div>
        <div class="row three" ${d.work ? '' : 'hidden'}>
          <label>Entrada <input type="time" data-f="start" value="${d.start}"></label>
          <label>Salida <input type="time" data-f="end" value="${d.end}"></label>
          <label>Break (min) <input type="number" data-f="breakMinutes" min="0" max="720" step="5" inputmode="numeric" placeholder="—" value="${d.breakMinutes || ''}"></label>
        </div>
      </div>`;
    }).join('');
  }
  const weekly = `Jornada semanal: ${fmtDur(weeklyTarget(st))} h.`;
  $('#target-hint').textContent = custom
    ? `${weekly} Lo que trabajes por encima de la jornada de cada día son horas extra; lo que falte queda pendiente de compensar.`
    : `Jornada: ${targetText({ start: st.workStart, end: st.workEnd, breakMinutes: st.breakMinutes || 0 })}. ${weekly}`;
  const hol = [...st.holidays].sort();
  $('#hol-list').innerHTML = hol.length
    ? hol.map((k) => `<li>${fmtKey(k)} <button data-hol="${k}" aria-label="Quitar">✕</button></li>`).join('')
    : '<li class="empty">Sin festivos</li>';
}

async function saveSettings(patch) {
  cloud.touch();
  state.settings = { ...state.settings, ...patch };
  await db.saveSettings(state.settings);
  render();
}

function saveHours() {
  const sched = { start: $('#set-start').value, end: $('#set-end').value, breakMinutes: breakValue($('#set-break').value) };
  const error = validateSchedule(sched);
  if (error) {
    toast(error);
    renderAjustes();
    return;
  }
  saveSettings({ workStart: sched.start, workEnd: sched.end, breakMinutes: sched.breakMinutes });
}

function toggleCustom() {
  const on = $('#set-custom').checked;
  const st = state.settings;
  // Al activarlo por primera vez se parte del horario general
  saveSettings(on ? { customSchedule: true, days: st.days || generalDays(st) } : { customSchedule: false });
  toast(on ? 'Horario personalizado activado: ajusta cada día' : 'Vuelves a usar el horario general');
}

function saveCustomDay(ev) {
  const card = ev.target.closest('.cday');
  if (!card) return;
  const wd = Number(card.dataset.wd);
  const get = (f) => card.querySelector(`[data-f="${f}"]`);
  const day = { work: get('work').checked, start: get('start').value, end: get('end').value,
    breakMinutes: breakValue(get('breakMinutes').value) };
  const error = day.work ? validateSchedule(day) : null;
  if (error) {
    toast(`${WEEKDAYS[wd]}: ${error}`);
    renderAjustes();
    return;
  }
  saveSettings({ days: { ...state.settings.days, [wd]: day } });
}

async function storageStatus() {
  const el = $('#storage-status');
  const persisted = await navigator.storage?.persisted?.();
  const count = state.sessions.length;
  el.textContent = `${count} fichaje${count === 1 ? '' : 's'} guardado${count === 1 ? '' : 's'}. `
    + (persisted ? 'Almacenamiento persistente activado ✔' : 'Almacenamiento persistente no confirmado (instala la app para activarlo).');
}

// ---------- Edición ----------

function syncOpenCheckbox() {
  $('#edit-end').disabled = $('#edit-open').checked;
}

function openEditor(session) {
  state.editing = session || null;
  const now = Date.now();
  $('#edit-title').textContent = session ? 'Editar fichaje' : 'Añadir fichaje manual';
  $('#edit-start').value = toLocalInput(session ? session.start : now - 3600000);
  $('#edit-end').value = toLocalInput(session?.end ?? now);
  $('#edit-open').checked = !!session && session.end == null;
  $('#edit-note').value = session?.note || '';
  $('#edit-delete').hidden = !session;
  $('#edit-error').textContent = '';
  syncOpenCheckbox();
  $('#edit-dialog').showModal();
}

async function saveEdit(ev) {
  ev.preventDefault();
  cloud.touch();
  const err = (msg) => { $('#edit-error').textContent = msg; };
  const now = Date.now();
  if (!$('#edit-start').value) return err('Indica la hora de entrada.');
  const start = fromLocalInput($('#edit-start').value);
  const stillOpen = $('#edit-open').checked;
  if (!stillOpen && !$('#edit-end').value) return err('Indica la hora de salida o marca «Sigo trabajando».');
  const end = stillOpen ? null : fromLocalInput($('#edit-end').value);
  const id = state.editing?.id;
  if (start > now) return err('La entrada no puede ser posterior a la hora actual.');
  if (end != null && end <= start) return err('La salida debe ser posterior a la entrada.');
  if (end == null && state.sessions.some((s) => s.end == null && s.id !== id)) {
    return err('Ya hay otro fichaje abierto. Ciérralo antes o indica la hora de salida.');
  }
  const clash = overlapping(start, end ?? now, id);
  if (clash) {
    return err(`Se solapa con otro fichaje (${fmtKey(dayKey(clash.start))} ${fmtTime(clash.start)}–${clash.end ? fmtTime(clash.end) : 'en curso'}).`);
  }
  const s = state.editing
    ? { ...state.editing, start, end, note: $('#edit-note').value.trim(), updatedAt: now }
    : { id: newId(), start, end, note: $('#edit-note').value.trim(), source: 'manual', createdAt: now };
  await db.putSession(s);
  $('#edit-dialog').close();
  toast('Fichaje guardado');
  await reload();
}

async function deleteEdit() {
  if (!state.editing || !confirm('¿Eliminar este fichaje?')) return;
  cloud.touch();
  await db.deleteSession(state.editing.id);
  $('#edit-dialog').close();
  toast('Fichaje eliminado');
  await reload();
}

// ---------- Copia de seguridad ----------

function exportBackup() {
  const data = { app: 'fichajes', version: 2, exportedAt: new Date().toISOString(),
    settings: state.settings, sessions: state.sessions };
  download(JSON.stringify(data, null, 2), `fichajes_backup_${todayKey()}.json`, 'application/json');
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.sessions)) throw new Error('formato');
    const valid = data.sessions.filter((s) => s && s.id && Number.isFinite(s.start)
      && (s.end == null || (Number.isFinite(s.end) && s.end > s.start)));
    const existing = new Set(state.sessions.map((s) => s.id));
    const added = valid.filter((s) => !existing.has(s.id)).length;
    if (!confirm(`¿Importar ${valid.length} fichajes (${added} nuevos)? Los que ya existan se sobrescribirán.`)) return;
    await db.putSessions(valid);
    cloud.touch();
    if (data.settings) await db.saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    await init(false);
    toast(`Importados ${valid.length} fichajes`);
  } catch {
    toast('El fichero no es una copia válida');
  }
}

// ---------- Cuenta de Google ----------

function fmtStamp(ms) {
  const p = zonedParts(ms);
  return dayKey(ms) === todayKey() ? `hoy a las ${fmtTime(ms)}` : `el ${pad(p.d)}/${pad(p.m)} a las ${fmtTime(ms)}`;
}

function renderCloud() {
  const c = cloud.getState();
  const signedIn = !!c.email;
  $('#cloud-card').hidden = !cloud.enabled;
  $('#cloud-out').hidden = signedIn;
  $('#cloud-in').hidden = !signedIn;
  $('#cloud-email').textContent = c.email || '';
  const last = c.lastSync ? `Última sincronización ${fmtStamp(c.lastSync)}.` : 'Aún no se ha sincronizado.';
  const statusText = {
    syncing: 'Sincronizando…',
    ok: last,
    pending: `${last} Pulsa «Sincronizar ahora» para renovar la sesión de Google.`,
    offline: `${last} Sin conexión: se sincronizará al recuperarla.`,
    error: last,
  }[c.status] || last;
  $('#cloud-status').textContent = statusText;
  $('#cloud-error').textContent = c.status === 'error' || (!signedIn && c.message) ? c.message : '';

  const chip = $('#sync-chip');
  chip.hidden = !signedIn;
  chip.classList.toggle('warn-chip', c.status === 'error' || c.status === 'pending');
  chip.textContent = {
    syncing: '☁ Sincronizando…',
    ok: '☁ Sincronizado',
    pending: '☁ Toca para sincronizar',
    offline: '☁ Sin conexión',
    error: '⚠ Error al sincronizar',
  }[c.status] || '☁';
}

async function confirmDeleteRemote() {
  if (!confirm('¿Borrar la copia de tus fichajes guardada en Google Drive y cerrar sesión? '
    + 'Los fichajes de este dispositivo no se borran.')) return;
  try {
    await cloud.deleteRemote();
    toast('Copia de Google Drive borrada');
  } catch (e) {
    toast(e.message);
  }
}

// ---------- Navegación y render ----------

function render() {
  renderFichar();
  if (state.view === 'historial') renderHistorial();
  if (state.view === 'informes') renderInformes();
  if (state.view === 'ajustes') { renderAjustes(); storageStatus(); }
}

function showView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  render();
  window.scrollTo(0, 0);
}

function bind() {
  $('#btn-in').addEventListener('click', clockIn);
  $('#btn-out').addEventListener('click', clockOut);
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  const onSessionClick = (ev) => {
    const li = ev.target.closest('li[data-id]');
    if (li) openEditor(state.sessions.find((s) => s.id === li.dataset.id));
  };
  $('#today-list').addEventListener('click', onSessionClick);
  $('#hist-list').addEventListener('click', onSessionClick);
  $('#status-warn').addEventListener('click', () => openSession() && openEditor(openSession()));
  $('#add-manual').addEventListener('click', () => openEditor(null));
  $('#hist-month').addEventListener('change', renderHistorial);
  $('#rep-month').addEventListener('change', renderInformes);

  $('#edit-form').addEventListener('submit', saveEdit);
  $('#edit-open').addEventListener('change', syncOpenCheckbox);
  $('#edit-cancel').addEventListener('click', () => $('#edit-dialog').close());
  $('#edit-delete').addEventListener('click', deleteEdit);

  $('#late-btn').addEventListener('click', openLate);
  $('#late-form').addEventListener('submit', saveLate);
  $('#late-cancel').addEventListener('click', () => $('#late-dialog').close());

  $('#vac-btn').addEventListener('click', openVacations);
  $('#vac-form').addEventListener('submit', addVacation);
  $('#vac-close').addEventListener('click', () => $('#vac-dialog').close());
  $('#vac-from').addEventListener('change', () => {
    const from = $('#vac-from').value;
    if (from && (!$('#vac-to').value || $('#vac-to').value < from)) $('#vac-to').value = from;
  });
  $('#vac-list').addEventListener('click', (e) => {
    const id = e.target.closest('button[data-vac]')?.dataset.vac;
    if (id) removeVacation(id);
  });

  $('#rep-xlsx').addEventListener('click', () => {
    const { name, data } = reportXlsx();
    download(data, name, XLSX_MIME);
  });
  if (navigator.canShare?.({ files: [new File([''], 'x.xlsx', { type: XLSX_MIME })] })) {
    $('#rep-share').hidden = false;
    $('#rep-share').addEventListener('click', async () => {
      const { name, data } = reportXlsx();
      try {
        await navigator.share({ files: [new File([data], name, { type: XLSX_MIME })], title: name });
      } catch (e) {
        if (e.name !== 'AbortError') toast('No se pudo compartir');
      }
    });
  }
  $('#rep-ics').addEventListener('click', () => {
    const { y, m } = parseMonth($('#rep-month').value);
    download(monthIcs(y, m, state.sessions, state.settings), monthFileName(y, m, 'ics'), 'text/calendar');
  });

  $('#set-start').addEventListener('change', saveHours);
  $('#set-end').addEventListener('change', saveHours);
  $('#set-break').addEventListener('change', saveHours);
  $('#set-custom').addEventListener('change', toggleCustom);
  $('#custom-schedule').addEventListener('change', saveCustomDay);
  $('#set-days').addEventListener('change', () => {
    const days = [...document.querySelectorAll('#set-days input:checked')].map((i) => Number(i.value));
    saveSettings({ workDays: days });
  });
  $('#hol-add').addEventListener('click', () => {
    const v = $('#hol-date').value;
    if (!v || state.settings.holidays.includes(v)) return;
    saveSettings({ holidays: [...state.settings.holidays, v] });
    $('#hol-date').value = '';
  });
  $('#hol-national').addEventListener('click', () => {
    const y = zonedParts(Date.now()).y;
    const set = new Set([...state.settings.holidays, ...spanishNationalHolidays(y)]);
    saveSettings({ holidays: [...set] });
    toast(`Festivos nacionales ${y} añadidos. Añade los de tu comunidad y localidad.`);
  });
  $('#hol-list').addEventListener('click', (e) => {
    const k = e.target.dataset?.hol;
    if (k) saveSettings({ holidays: state.settings.holidays.filter((h) => h !== k) });
  });

  $('#cloud-signin').addEventListener('click', () => cloud.signIn());
  $('#cloud-sync').addEventListener('click', () => cloud.syncNow());
  $('#sync-chip').addEventListener('click', () => cloud.syncNow());
  $('#cloud-signout').addEventListener('click', async () => {
    if (!confirm('¿Cerrar sesión de Google? Los fichajes de este dispositivo se conservan.')) return;
    await cloud.signOut();
    toast('Sesión de Google cerrada');
  });
  $('#cloud-delete').addEventListener('click', confirmDeleteRemote);

  $('#backup-export').addEventListener('click', exportBackup);
  $('#backup-import').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importBackup(f);
  });

  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#install-btn').hidden = false;
  });
  $('#install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#install-btn').hidden = true;
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
  setInterval(() => { if (!document.hidden) renderFichar(); }, 1000);
}

async function init(first = true) {
  const saved = await db.getMeta('settings');
  state.settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  if (first) {
    $('#hist-month').value = currentMonthValue();
    $('#rep-month').value = currentMonthValue();
    bind();
    db.requestPersistence();
    cloud.subscribe(renderCloud);
    renderCloud();
    await cloud.init({ onData: () => init(false) });
  }
  await reload();
}

init().catch((e) => {
  console.error(e);
  $('#status-text').textContent = 'Error al abrir la base de datos local.';
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
}
