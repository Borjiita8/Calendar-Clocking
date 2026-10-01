import * as db from './db.js';
import {
  DEFAULT_SETTINGS, WEEKDAYS, MONTHS, computeDays, monthDays, sumDays, dayKey, zonedParts,
  isWorkday, workWindow, fmtTime, fmtDur, fmtKey, toLocalInput, fromLocalInput,
  spanishNationalHolidays,
} from './calc.js';
import { monthWorkbook, monthIcs, monthFileName } from './report.js';

const $ = (sel) => document.querySelector(sel);
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
  toast.t = setTimeout(() => el.classList.remove('show'), 2500);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function currentMonthValue() {
  const p = zonedParts(Date.now());
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
}

function parseMonth(value) {
  const [y, m] = (value || currentMonthValue()).split('-').map(Number);
  return { y, m };
}

async function reload() {
  state.sessions = await db.allSessions();
  render();
}

// ---------- Fichar ----------

async function clockIn() {
  if (openSession()) return;
  const s = { id: newId(), start: Date.now(), end: null, note: '', source: 'button', createdAt: Date.now() };
  await db.putSession(s);
  navigator.vibrate?.(60);
  toast(`Clock in a las ${fmtTime(s.start)}`);
  await reload();
}

async function clockOut() {
  const s = openSession();
  if (!s) return;
  s.end = Date.now();
  s.updatedAt = s.end;
  await db.putSession(s);
  navigator.vibrate?.([40, 60, 40]);
  toast(`Clock out a las ${fmtTime(s.end)} · ${fmtDur(s.end - s.start)}`);
  await reload();
}

function scheduleHint(now) {
  const p = zonedParts(now);
  const st = state.settings;
  if (!isWorkday(p.y, p.m, p.d, st)) return 'Hoy no es laborable: todo lo que fiches contará como horas extra.';
  const [ws, we] = workWindow(p.y, p.m, p.d, st);
  if (now < ws) return `Tu jornada empieza a las ${st.workStart}. Lo fichado antes contará como horas extra.`;
  if (now >= we) return `Tu jornada terminó a las ${st.workEnd}. Lo fichado ahora contará como horas extra.`;
  return `Jornada de hoy: ${st.workStart}–${st.workEnd}.`;
}

function sessionItem(seg, { showDate = false } = {}) {
  const s = seg.session;
  const end = seg.open ? '<em>en curso</em>' : fmtTime(seg.end);
  const tag = s.source === 'manual' ? '<span class="tag">manual</span>' : '';
  const note = s.note ? `<div class="note">${esc(s.note)}</div>` : '';
  return `<li data-id="${s.id}">
    <div class="sess-main">
      <span>${showDate ? fmtKey(seg.key) + ' · ' : ''}${fmtTime(seg.start)} → ${end}</span>
      <strong>${fmtDur(seg.end - seg.start)}</strong>
    </div>${tag}${note}</li>`;
}

function renderFichar() {
  const now = Date.now();
  const p = zonedParts(now);
  $('#clock-time').textContent = `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}:${String(p.s).padStart(2, '0')}`;
  $('#clock-date').textContent = `${WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]}, ${p.d} de ${MONTHS[p.m - 1].toLowerCase()} de ${p.y}`;

  const open = openSession();
  $('#btn-in').disabled = !!open;
  $('#btn-out').disabled = !open;
  $('#status-card').classList.toggle('working', !!open);
  $('#status-text').textContent = open ? `Trabajando desde las ${fmtTime(open.start)}` : 'Fuera de turno';
  $('#status-timer').textContent = open ? fmtDur(now - open.start) : '';
  $('#schedule-hint').textContent = scheduleHint(now);

  const today = computeDays(state.sessions, state.settings, now).get(dayKey(now));
  $('#today-worked').textContent = fmtDur(today?.worked || 0);
  $('#today-in').textContent = fmtDur(today?.inSchedule || 0);
  $('#today-extra').textContent = fmtDur(today?.outside || 0);
  const list = today?.segments || [];
  $('#today-list').innerHTML = list.length
    ? list.map((seg) => sessionItem(seg)).join('')
    : '<li class="empty">Sin fichajes hoy</li>';
}

// ---------- Historial ----------

function renderHistorial() {
  const { y, m } = parseMonth($('#hist-month').value);
  const days = monthDays(y, m, state.sessions, state.settings).filter((d) => d.segments.length);
  const all = monthDays(y, m, state.sessions, state.settings);
  const tot = sumDays(all);
  $('#hist-worked').textContent = fmtDur(tot.worked);
  $('#hist-expected').textContent = fmtDur(tot.expected);
  $('#hist-extra').textContent = fmtDur(tot.outside);
  $('#hist-list').innerHTML = days.length ? days.reverse().map((d) => `
    <div class="card day">
      <div class="day-head">
        <div><strong>${WEEKDAYS[d.weekday]} ${d.d}</strong> <span class="muted">${d.kind !== 'Laborable' ? d.kind : ''}</span></div>
        <div class="day-tot">${fmtDur(d.worked)}${d.outside ? ` <span class="extra">+${fmtDur(d.outside)} extra</span>` : ''}</div>
      </div>
      <ul class="sessions">${d.segments.map((seg) => sessionItem(seg)).join('')}</ul>
    </div>`).join('') : '<p class="empty">No hay fichajes este mes.</p>';
}

// ---------- Informes ----------

function renderInformes() {
  const { y, m } = parseMonth($('#rep-month').value);
  const days = monthDays(y, m, state.sessions, state.settings);
  const tot = sumDays(days);
  $('#rep-title').textContent = `${MONTHS[m - 1]} ${y}`;
  $('#rep-worked').textContent = fmtDur(tot.worked);
  $('#rep-expected').textContent = fmtDur(tot.expected);
  $('#rep-in').textContent = fmtDur(tot.inSchedule);
  $('#rep-extra').textContent = fmtDur(tot.outside);
  $('#rep-balance').textContent = (tot.balance > 0 ? '+' : '') + fmtDur(tot.balance);
  $('#rep-days').textContent = days.filter((d) => d.segments.length).length;
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

function renderAjustes() {
  const st = state.settings;
  $('#set-start').value = st.workStart;
  $('#set-end').value = st.workEnd;
  const order = [1, 2, 3, 4, 5, 6, 0];
  $('#set-days').innerHTML = order.map((d) => `
    <label class="day-toggle"><input type="checkbox" value="${d}" ${st.workDays.includes(d) ? 'checked' : ''}>
    <span>${WEEKDAYS[d].slice(0, 3)}</span></label>`).join('');
  const hol = [...st.holidays].sort();
  $('#hol-list').innerHTML = hol.length
    ? hol.map((k) => `<li>${fmtKey(k)} <button data-hol="${k}" aria-label="Quitar">✕</button></li>`).join('')
    : '<li class="empty">Sin festivos</li>';
}

async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.setMeta('settings', state.settings);
  render();
}

async function storageStatus() {
  const el = $('#storage-status');
  const persisted = await navigator.storage?.persisted?.();
  const count = state.sessions.length;
  el.textContent = `${count} fichaje${count === 1 ? '' : 's'} guardado${count === 1 ? '' : 's'}. `
    + (persisted ? 'Almacenamiento persistente activado ✔' : 'Almacenamiento persistente no confirmado (instala la app para activarlo).');
}

// ---------- Edición ----------

function openEditor(session) {
  state.editing = session || null;
  const now = Date.now();
  $('#edit-title').textContent = session ? 'Editar fichaje' : 'Añadir fichaje manual';
  $('#edit-start').value = toLocalInput(session ? session.start : now - 3600000);
  $('#edit-end').value = session ? (session.end ? toLocalInput(session.end) : '') : toLocalInput(now);
  $('#edit-note').value = session?.note || '';
  $('#edit-delete').hidden = !session;
  $('#edit-error').textContent = '';
  $('#edit-dialog').showModal();
}

async function saveEdit(ev) {
  ev.preventDefault();
  const start = fromLocalInput($('#edit-start').value);
  const endVal = $('#edit-end').value;
  const end = endVal ? fromLocalInput(endVal) : null;
  const id = state.editing?.id;
  const err = (msg) => { $('#edit-error').textContent = msg; };
  if (end != null && end <= start) return err('La salida debe ser posterior a la entrada.');
  if (end == null && state.sessions.some((s) => s.end == null && s.id !== id)) {
    return err('Ya hay un fichaje abierto. Indica la hora de salida.');
  }
  const overlap = state.sessions.find((s) => s.id !== id
    && start < (s.end ?? Date.now()) && (end ?? Date.now()) > s.start);
  if (overlap) return err(`Se solapa con otro fichaje (${fmtKey(dayKey(overlap.start))} ${fmtTime(overlap.start)}).`);
  const s = state.editing
    ? { ...state.editing, start, end, note: $('#edit-note').value.trim(), updatedAt: Date.now() }
    : { id: newId(), start, end, note: $('#edit-note').value.trim(), source: 'manual', createdAt: Date.now() };
  await db.putSession(s);
  $('#edit-dialog').close();
  toast('Fichaje guardado');
  await reload();
}

async function deleteEdit() {
  if (!state.editing || !confirm('¿Eliminar este fichaje?')) return;
  await db.deleteSession(state.editing.id);
  $('#edit-dialog').close();
  toast('Fichaje eliminado');
  await reload();
}

// ---------- Copia de seguridad ----------

function exportBackup() {
  const data = { app: 'fichajes', version: 1, exportedAt: new Date().toISOString(),
    settings: state.settings, sessions: state.sessions };
  const p = zonedParts(Date.now());
  download(JSON.stringify(data, null, 2), `fichajes_backup_${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}.json`, 'application/json');
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.sessions)) throw new Error('formato');
    const valid = data.sessions.filter((s) => s && s.id && Number.isFinite(s.start)
      && (s.end == null || (Number.isFinite(s.end) && s.end > s.start)));
    const existing = new Set(state.sessions.map((s) => s.id));
    const added = valid.filter((s) => !existing.has(s.id)).length;
    if (!confirm(`Importar ${valid.length} fichajes (${added} nuevos)? Los que ya existan se sobrescribirán.`)) return;
    await db.putSessions(valid);
    if (data.settings) await db.setMeta('settings', { ...DEFAULT_SETTINGS, ...data.settings });
    await init(false);
    toast(`Importados ${valid.length} fichajes`);
  } catch {
    toast('El fichero no es una copia válida');
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
  $('#add-manual').addEventListener('click', () => openEditor(null));
  $('#hist-month').addEventListener('change', renderHistorial);
  $('#rep-month').addEventListener('change', renderInformes);

  $('#edit-form').addEventListener('submit', saveEdit);
  $('#edit-cancel').addEventListener('click', () => $('#edit-dialog').close());
  $('#edit-delete').addEventListener('click', deleteEdit);

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

  $('#set-start').addEventListener('change', (e) => e.target.value && saveSettings({ workStart: e.target.value }));
  $('#set-end').addEventListener('change', (e) => e.target.value && saveSettings({ workEnd: e.target.value }));
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
