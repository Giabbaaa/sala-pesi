import { EX, EXERCISES, MUSCLES, MUSCLE_ORDER, TYPE_RULES, EQUIP_GROUPS, imgs } from './catalog.js';
import * as E from './engine.js';

// La chiave resta questa per sempre: la versione del formato è dentro i dati (state.v, vedi engine.SCHEMA)
const KEY = 'salapesi.v1';
const SNAPS = 'salapesi.snaps';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kg = E.fmtKg;
const thousands = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---------- Copie automatiche sul telefono ----------
// Fino a 5 copie: una al giorno, più una prima di ogni aggiornamento del formato, ripristino, import o cancellazione.
const snapList = () => { try { return JSON.parse(localStorage.getItem(SNAPS)) || []; } catch { return []; } };
function snapshot(raw, why) {
  if (!raw) return;
  const list = snapList();
  const k = `salapesi.snap.${Date.now()}`;
  let n = 0; try { n = (JSON.parse(raw).sessions || []).length; } catch {}
  const drop = () => { let i = list.findIndex(x => x.why === 'automatica'); if (i < 0) i = 0; const [x] = list.splice(i, 1); if (x) localStorage.removeItem(x.k); return !!x; };
  for (;;) { try { localStorage.setItem(k, raw); break; } catch { if (!drop()) return; } }
  list.push({ k, at: Date.now(), why, n });
  while (list.length > 5) drop();
  try { localStorage.setItem(SNAPS, JSON.stringify(list)); } catch {}
}

// ---------- Stato ----------
let state, loadNotice = null;
const rawAtStart = localStorage.getItem(KEY);
try {
  const data = rawAtStart ? JSON.parse(rawAtStart) : null;
  const v = data?.v || 1;
  if (data && v !== E.SCHEMA) snapshot(rawAtStart, v < E.SCHEMA ? 'prima dell’aggiornamento' : 'da una versione più nuova');
  state = E.migrate(data);
} catch {
  // dati illeggibili: se ne tiene una copia (ripristinabile da Impostazioni) e si riparte
  snapshot(rawAtStart, 'dati non letti');
  state = E.initialState();
  loadNotice = 'Non sono riuscito a leggere i dati salvati: ne ho tenuto una copia in Impostazioni → Dati e backup.';
}
if (loadNotice) state.notice = loadNotice;
state.meta = state.meta || {};
let ui = { tab: 'oggi', day: null, editSet: null, confirmReset: false, flash: null, flashEx: null, flashSeg: null, flashDone: false };
function save() {
  const txt = JSON.stringify(state);
  try { localStorage.setItem(KEY, txt); return; } catch {}
  // memoria piena: si liberano le copie automatiche, dalla più vecchia
  const list = snapList();
  while (list.length) {
    localStorage.removeItem(list.shift().k);
    try { localStorage.setItem(SNAPS, JSON.stringify(list)); localStorage.setItem(KEY, txt); return; } catch {}
  }
  toast('Memoria piena: esporta un backup');
}
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

const today = () => E.dayKey();
const toTop = () => { const v = document.getElementById('view'); if (v) v.scrollTop = 0; };

// ---------- Audio e schermo acceso ----------
// Due modi: "sì" usa l'audio web (si mescola alla musica, ma l'iPhone in silenzioso lo zittisce);
// "anche in silenzioso" usa un file audio vero, che suona sempre ma può mettere in pausa la musica.
const soundMode = () => state.settings.sound === false ? 'off' : state.settings.sound === 'loud' ? 'loud' : 'on';
let actx = null, bell = null, bellReady = false;
function unlockAudio() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createBufferSource(); src.buffer = actx.createBuffer(1, 1, 22050); src.connect(actx.destination); src.start(0);
    }
    if (actx.state !== 'running') actx.resume().catch(() => {});
  } catch { actx = null; }
  // il file audio va "sbloccato" con un tocco, poi può suonare anche da solo a fine recupero
  if (soundMode() === 'loud' && !bellReady) {
    const a = bellAudio(); a.muted = true;
    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; bellReady = true; }).catch(() => { a.muted = false; });
  }
}
// La stessa sveglia scritta come file WAV (do-mi-sol-do, 1,5 s)
function bellAudio() {
  if (bell) return bell;
  const rate = 22050, n = Math.floor(rate * 1.5), pcm = new Int16Array(n);
  const notes = [[1046.5, 0, 7], [1318.5, 0.16, 7], [1568, 0.32, 7], [2093, 0.52, 4.5]];
  for (let i = 0; i < n; i++) {
    const t = i / rate; let v = 0;
    for (const [f, d, decay] of notes) {
      const x = t - d; if (x < 0) continue;
      const env = Math.min(1, x / 0.012) * Math.exp(-x * decay) * (decay < 5 ? 0.8 : 1);
      v += env * (0.5 * Math.sin(2 * Math.PI * f * x) + 0.08 * Math.sin(4 * Math.PI * f * x) + 0.03 * Math.sin(6 * Math.PI * f * x));
    }
    pcm[i] = Math.max(-1, Math.min(1, v * 0.6)) * 32767;
  }
  const buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const str = (o, s) => { for (let j = 0; j < s.length; j++) dv.setUint8(o + j, s.charCodeAt(j)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).set(pcm);
  bell = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  bell.preload = 'auto';
  return bell;
}
// Fine recupero: breve sveglia a tre note (do-mi-sol), morbida, con un'eco leggera
function chime() {
  const mode = soundMode();
  if (mode === 'off') return;
  if (mode === 'loud') { const a = bellAudio(); try { a.currentTime = 0; } catch {} a.play().catch(() => webChime()); return; }
  webChime();
}
function webChime() {
  if (!actx) return;
  if (actx.state !== 'running') actx.resume().catch(() => {});
  const t0 = actx.currentTime + 0.02;
  const master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination);
  [[1046.5, 0], [1318.5, 0.16], [1568, 0.32], [2093, 0.52]].forEach(([f, d], k) => {
    for (const [mult, vol] of [[1, 0.5], [2, 0.08], [3, 0.03]]) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f * mult; o.connect(g); g.connect(master);
      const t = t0 + d, peak = vol * (k === 3 ? 0.8 : 1);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + (k === 3 ? 1.3 : 0.8));
      o.start(t); o.stop(t + 1.4);
    }
  });
  navigator.vibrate?.([120, 80, 120]);
}
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.current?.view === 'ex') keepAwake(true); tickTimer(); });

// ---------- Timer di recupero ----------
function startRest(sec, label) {
  if (state.current && state.current.date !== today()) return;     // giornata passata: niente recupero
  state.rest = { end: Date.now() + sec * 1000, label, rings: 0 };
  save(); tickTimer();
}
function tickTimer() {
  const el = $('#timer'); const r = state.rest;
  document.body.classList.toggle('has-timer', !!r);
  if (!r) { el.hidden = true; return; }
  const left = Math.ceil((r.end - Date.now()) / 1000);
  if (left <= -20) { state.rest = null; save(); el.hidden = true; document.body.classList.remove('has-timer'); return; }
  el.hidden = false;
  el.classList.toggle('end', left <= 0);
  const t = Math.max(0, left);
  const html = left > 0
    ? `<span class="t">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span><span class="l">Recupero<br>${esc(r.label)}</span><button data-act="rest+">+15 s</button><button data-act="rest-skip">Salta</button>`
    : `<span class="t">Vai!</span><span class="l">Recupero finito</span><button data-act="rest-skip">OK</button>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }   // si ridisegna solo quando cambia
  // la sveglia suona alla fine e si ripete due volte (ogni 4 s) finché non tocchi OK
  const rings = left > 0 ? 0 : Math.min(3, 1 + Math.floor(-left / 4));
  if ((r.rings || 0) < rings) { r.rings = rings; save(); chime(); }
}
setInterval(tickTimer, 250);

// ---------- Notifica con Annulla ----------
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

// ---------- Helper di visualizzazione ----------
const repsLabel = (id, r) => EX[id].type === 'time' ? `${r} s` : `${r}`;
const rangeLabel = id => { const r = TYPE_RULES[EX[id].type]; return `${r.min}–${r.max}${r.unit ? ' s' : ''}`; };
const loadLabel = (id, k) => ['time', 'bw'].includes(EX[id].type) ? 'corpo libero' : k == null ? 'carico da provare' : `${kg(k)} kg`;
// Testo di una serie: "55 kg × 10", "12 ripetizioni" (corpo libero) o "40 s" (a tempo)
const setTxt = (id, x) => EX[id].type === 'time' ? `${x.reps} s` : EX[id].type === 'bw' ? `${x.reps} ripetizioni` : `${kg(x.kg)} kg × ${x.reps}`;
const EFFS = [['facile', 'Facile', '4+ in riserva', 'lv1'], ['giusto', 'Giusto', '1–3 in riserva', 'lv2'], ['limite', 'Al limite', '0 in riserva', 'lv3']];
// Muscoli coinvolti, coi tre colori: arancio principale, giallo secondario, verde aiuta
function musclesHtml(e) {
  const prim = Object.entries(e.work || {}).filter(([, w]) => w >= 1).map(([m]) => MUSCLES[m].name);
  const sec = Object.entries(e.work || {}).filter(([, w]) => w < 1).map(([m]) => MUSCLES[m].name.toLowerCase());
  return `<div class="muscles">${prim.map(x => `<span class="lv3">${esc(x)}</span>`).join('')}${sec.map(x => `<span class="lv2">${esc(x)}</span>`).join('')}${(e.also || []).map(x => `<span class="lv1">${esc(x)}</span>`).join('')}</div>`;
}
const howHtml = e => ['Posizione', 'Movimento', 'Ritorno', 'Attenzione'].map((t, k) => e.how?.[k] ? `<div><b>${t}</b>${esc(e.how[k])}</div>` : '').join('');
const flipHtml = id => EX[id]?.unknown ? '' : `<div class="flip"><img src="${imgs(id)[0]}" alt="Posizione iniziale"><img class="b" src="${imgs(id)[1]}" alt="Posizione finale"></div>`;
const exName = it => EX[it.id]?.name || it.name || it.id;
const visible = e => !e.hidden;
const musclesLine = id => Object.entries(EX[id].work).map(([m, w]) => w >= 1 ? MUSCLES[m].name : `${MUSCLES[m].name.toLowerCase()} (in parte)`).join(' · ');

// Calendario: 15 giorni indietro e 15 avanti, scorrevole; un tocco su un giorno lo apre
function calendarCard() {
  const t = today(), sel = ui.day || t;
  const days = E.strip(state, t, -15, 15);
  const lbl = E.nextLabel(state, t);
  const doneToday = state.sessions.some(s => s.date === t && !s.mini);
  const m = E.parseDay(sel);
  return `<section class="card cal">
    <div class="row between" style="align-items:flex-end"><div class="next">Prossimo allenamento<b>${doneToday && lbl === 'oggi' ? '—' : esc(lbl)}</b></div>
      <span class="month" id="month">${E.MONTHS[m.getMonth()]} ${m.getFullYear()}</span></div>
    <div class="strip" id="strip">${days.map(x => {
      const st = x.frac != null ? lvOf(x.frac) : x.extra ? 'extra' : '';
      return `<button class="day ${st} ${x.rec ? 'rec' : ''} ${x.today ? 'today' : ''} ${x.key === sel ? 'sel' : ''}" data-act="day" data-k="${x.key}" data-m="${x.month}" data-y="${x.year}" aria-label="${dayLabel(x.key)}">${x.label}<i>${x.num}</i></button>`;
    }).join('')}</div>
  </section>`;
}
// dopo ogni disegno: il calendario resta dov'era (la prima volta, centrato sul giorno scelto)
function placeStrip() {
  const st = document.getElementById('strip'); if (!st) return;
  if (ui.stripX != null) st.scrollLeft = ui.stripX;
  else { const el = st.querySelector('.sel') || st.querySelector('.today'); if (el) st.scrollLeft = el.offsetLeft - (st.clientWidth - el.offsetWidth) / 2; }
  const month = () => {
    const mid = st.scrollLeft + st.clientWidth / 2;
    const b = [...st.children].find(x => x.offsetLeft + x.offsetWidth >= mid) || st.lastElementChild;
    const lab = document.getElementById('month'); if (b && lab) lab.textContent = `${E.MONTHS[+b.dataset.m]} ${b.dataset.y}`;
  };
  month();
  st.addEventListener('scroll', () => { ui.stripX = st.scrollLeft; month(); }, { passive: true });
}

function spark(values, h = 48) {
  if (values.length < 2) return '';
  const w = 300, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [i / (values.length - 1) * (w - 8) + 4, h - 6 - (v - min) / span * (h - 12)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const l = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}"/><circle cx="${l[0]}" cy="${l[1]}" r="4"/></svg>`;
}

const TRASH = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7zm4 2v8h1.5v-8zm2.5 0v8H14v-8z"/></svg>';
// Tasto cestino per una seduta salvata: primo tocco chiede conferma, il secondo elimina
function delButton(id) {
  return ui.confirmDel === id
    ? `<span class="row" style="gap:6px"><button class="danger" data-act="del-yes" data-id="${id}">Elimina</button><button data-act="del-no">Annulla</button></span>`
    : `<button class="icon ghost danger" data-act="del" data-id="${id}" aria-label="Elimina allenamento">${TRASH}</button>`;
}
// Livello di colore da una frazione 0..1: completo = 1 (menta), almeno metà = 2 (giallo), meno = 3 (arancio)
const lvOf = f => f >= 1 ? 'lv1' : f >= 0.5 ? 'lv2' : 'lv3';
const PRIO_LABEL = { alta: 'alta', normale: 'media', minima: 'bassa' };
const PRIO_LV = { alta: 'lv3', normale: 'lv2', minima: 'lv1' };
const XP_LV = { 3: 'lv3', 2: 'lv2', 1: 'lv1' };
const noKg = id => ['time', 'bw'].includes(EX[id].type);
const dayLabel = k => { const n = E.DAY_NAMES[E.weekday(k)]; return `${n[0].toUpperCase()}${n.slice(1)} ${k.split('-').reverse().slice(0, 2).join('/')}`; };

// ---------- OGGI ----------
const logged = it => (it.sets || []).filter(Boolean);
const hasLogs = c => !!c && c.items.some(i => logged(i).length);
const isDone = it => it.id === 'cardio' ? logged(it).length > 0 : logged(it).length >= it.planSets;
const todaySession = () => state.sessions.find(s => s.date === today());
// Lo storico senza la giornata in corso: per "ultima volta" e per i carichi consigliati
const pastState = () => { const d = state.current?.date || today(); return { ...state, sessions: state.sessions.filter(s => s.date !== d) }; };
const newItem = id => { const sg = E.suggestion(pastState(), id); return { id, planSets: 3, kg: sg.kg, reps: sg.reps, note: sg.note, ss: null, sets: [], skipped: false }; };

// Una giornata salvata riaperta per continuare o modificare
const fromSession = (s, date) => ({ date, reason: 'Allenamento di oggi', deload: s.deload, seed: s.seed, free: !!s.free, forced: true, cur: 0, view: 'list',
  items: s.items.map(i => {
    if (i.id === 'cardio') return { id: 'cardio', minutes: i.minutes, planSets: 0, ss: null, skipped: !!i.skipped, sets: [...i.sets] };
    const x = newItem(i.id); const l = i.sets[i.sets.length - 1];
    return { ...x, ss: i.ss, planSets: i.planSets, skipped: i.skipped, minutes: i.minutes, sets: [...i.sets], kg: l ? l.kg : x.kg };
  }) });

function ensureCurrent() {
  const c = state.current, t = today();
  if (c && c.date === t) return;
  const s = todaySession();
  state.current = s ? fromSession(s, t) : E.compose(state, t);
  state.current.minutes = E.itemMinutes(state.current.items);
  save();
}

// Giornate passate: si aprono al posto di quella di oggi, che resta da parte (stash) e torna dopo
function leavePast() {
  const c = state.current;
  if (c && c.date !== today()) { state.current = state.stash?.date === today() ? state.stash : null; state.stash = null; }
}
function openPast(k, addId) {
  if (state.current?.date === today()) state.stash = state.current;
  else if (state.current) leavePast();
  const s = state.sessions.find(x => x.date === k);
  state.current = s ? fromSession(s, k) : { date: k, items: [], reason: '', free: false, forced: true, deload: false, seed: null, cur: 0, view: 'list' };
  if (addId) state.current.items.push(newItem(addId));
  state.current.minutes = E.itemMinutes(state.current.items);
}
function setDay(k) {
  const t = today();
  if (state.current && state.current.date !== t && state.current.date !== k) leavePast();
  ui.day = k === t ? null : k;
  save(); render();
}

// Salva la giornata a ogni modifica (niente "Termina" da ricordarsi)
function sync() {
  const c = state.current; if (!c) return;
  if (!hasLogs(c) && !state.sessions.some(s => s.date === c.date)) return;
  const r = E.recordDay(state, c);
  if (r?.newCycle) state.cycleBanner = `Inizia il ciclo ${state.cycle.n}`;
}

function viewOggi() {
  const t = today(), day = ui.day && ui.day !== t ? ui.day : t;
  const c = state.current?.date === day ? state.current : null;
  if (c?.view === 'ex' && c.items.length) return viewSession();
  let html = '';
  if (!state.seenIntro) html += `<section class="alert"><b>Prima di iniziare</b>
    <p class="small">Se un esercizio fa male in modo acuto o il dolore aumenta serie dopo serie, fermati e usa <b>Cambia</b>. Ginocchio: sulla leg press piedi alti e scendi solo fin dove non fa male.</p>
    ${!matchMedia('(display-mode: standalone)').matches && !navigator.standalone ? '<p class="small">Per averla come app: in Safari tocca Condividi → Aggiungi alla schermata Home.</p>' : ''}
    <button class="ghost" data-act="intro-ok">Ho capito</button></section>`;
  if (state.notice) html += `<section class="alert small">${esc(state.notice)} <button class="ghost" data-act="notice-ok">OK</button></section>`;
  html += day === t ? `<h1>Oggi</h1>` : `<div class="row between"><h1>${dayLabel(day)}</h1><button class="ghost" data-act="day" data-k="${t}">Torna a oggi</button></div>`;
  html += calendarCard();
  if (day < t) return html + pastDay(day, c);
  if (day > t) return html + futureDay(day);

  if (E.checkpointDue(state)) {
    html += `<section class="alert"><b>Punto di controllo del ciclo</b><p class="small">Peso di stamattina e circonferenza vita all’altezza dell’ombelico.</p>
      <div class="row" style="margin-top:8px"><input type="text" inputmode="decimal" placeholder="Peso kg" data-in="cp-weight"><input type="text" inputmode="decimal" placeholder="Vita cm" data-in="cp-waist"></div></section>`;
  }
  if (state.cycleBanner) html += `<section class="alert"><b>${esc(state.cycleBanner)}</b><p class="small">Se vuoi, in Piano puoi cambiare gli esercizi àncora con una variante.</p><button class="ghost" data-act="cycle-ok">OK</button></section>`;

  const rec = E.recommendedDays(state, t);
  const show = (c && (c.forced || hasLogs(c))) || rec[0] === t || todaySession();
  if (!show) {
    html += `<section class="card"><h3>Oggi riposo</h3>
      <p class="muted">Il recupero fa crescere il muscolo quanto l’allenamento.</p>
      <button style="margin-top:10px" data-act="force">Allenati comunque</button>
      <p class="small muted" style="margin-top:14px">Hai fatto un esercizio fuori programma, anche a casa?</p>
      <select data-in="free-add" style="margin-top:6px">${addOptions('+ Segna un esercizio')}</select></section>`;
    return html;
  }
  ensureCurrent();
  return html + dayCard(state.current) + overview(state.current) + backupReminder();
}

// Giorno passato: quello che è stato fatto (con cestino e modifica), oppure la giornata vuota per segnare qualcosa
function pastDay(k, c) {
  if (c) return dayCard(c) + overview(c);
  const s = state.sessions.find(x => x.date === k);
  if (!s) return `<section class="card"><h3>Nessun allenamento segnato</h3>
    <p class="small muted">Hai fatto qualcosa quel giorno e non l’hai segnato?</p>
    <select data-in="past-add" data-k="${k}" style="margin-top:8px">${addOptions('+ Segna un esercizio')}</select></section>`;
  return sessionSummary(s) + `<button class="big" data-act="past-open" data-k="${k}">Modifica o aggiungi esercizi</button>`;
}

const EFF_LV = { facile: 'lv1', giusto: 'lv2', limite: 'lv3' };
function sessionSummary(s) {
  const nSets = s.items.reduce((a, i) => a + (i.id === 'cardio' ? 0 : i.sets.length), 0);
  const title = s.free || s.mini ? 'Esercizi extra' : (s.frac ?? 1) < 1 ? 'Fatto in parte' : 'Fatto!';
  return `<section class="card"><div class="del-corner">${delButton(s.id)}</div>
    <h3>${title}${s.deload ? ' · scarico' : ''}</h3>
    <div class="summary" style="margin-top:8px"><span><b>${s.minutes || '?'}</b> min</span><span><b>${s.kcal ? `${s.kcal[0]}–${s.kcal[1]}` : '–'}</b> kcal</span><span><b>${nSets}</b> serie</span></div>
    ${s.items.filter(it => it.sets.length).map(it => it.id === 'cardio'
      ? `<div class="hist-row"><b><span class="cardio-ico">🚴</span>Cardio</b><span class="small muted">${it.minutes} min</span></div>`
      : `<div class="hist-row"><b>${esc(exName(it))}</b><div class="pills">${it.sets.map(x => `<span class="${EFF_LV[x.eff] || ''}">${esc(setTxt(it.id, x))}</span>`).join('')}</div></div>`).join('')}
  </section>`;
}

// Giorno futuro: l'allenamento previsto (una stima), oppure riposo
function futureDay(k) {
  const t = today();
  const plan = state.current?.date === t && !hasLogs(state.current) ? state.current : null;
  let f = null; try { f = E.forecast(state, k, plan, t); } catch { f = null; }
  if (!f) return `<section class="card"><h3>Riposo</h3><p class="muted">${(state.settings.days || []).length ? 'Non è tra i giorni in cui pensi di andare (li scegli in Piano → Ritmo).' : 'Non è tra i giorni consigliati.'}</p></section>`;
  const work = f.items.filter(i => i.id !== 'cardio');
  return `<section class="card"><h3>Allenamento previsto${f.deload ? ' · scarico' : ''}</h3>
    <p class="reason">${esc(f.reason)}</p>
    <div class="summary"><span><b>${f.minutes}</b> min</span><span><b>${work.length}</b> esercizi</span><span><b>${work.reduce((a, i) => a + i.planSets, 0)}</b> serie</span></div>
    ${f.items.map(it => it.id === 'cardio'
      ? `<div class="hist-row"><b><span class="cardio-ico">🚴</span>Cardio extra</b><span class="small muted">${it.minutes} min</span></div>`
      : `<div class="hist-row"><b>${esc(EX[it.id].name)}</b><span class="small muted">${it.planSets} × ${rangeLabel(it.id)} · ${loadLabel(it.id, it.kg)}</span></div>`).join('')}
    <p class="small muted" style="margin-top:10px">È una previsione: l’app la ricalcola in base a quello che farai prima.</p></section>`;
}

// Promemoria discreto: una copia dei dati fuori dal telefono ogni mese circa
function backupReminder() {
  const m = state.meta, t = today();
  if (state.sessions.filter(E.counts).length < 6) return '';
  if (m.exported && E.diffDays(t, m.exported) < 30) return '';
  if (m.remindAt && E.diffDays(t, m.remindAt) < 14) return '';
  return `<section class="alert small"><b>Salva una copia dei tuoi allenamenti</b>
    <p>Se cancelli l’app o cambi iPhone, con la copia ritrovi tutto. ${m.exported ? `Ultima: ${dayLabel(m.exported)}.` : ''}</p>
    <div class="row" style="margin-top:8px"><button class="primary" data-act="export">Salva copia</button><button class="ghost" data-act="backup-later">Più tardi</button></div></section>`;
}

function addOptions(first) {
  return `<option value="">${first}</option>` + MUSCLE_ORDER.map(m => `<optgroup label="${MUSCLES[m].name}">${EXERCISES.filter(e => e.muscle === m && visible(e)).map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</optgroup>`).join('');
}

// Riepilogo della giornata: "Fatto!" se è tutto fatto, altrimenti "Fatto in parte"
function dayCard(c) {
  const s = state.sessions.find(x => x.date === c.date); if (!s || !hasLogs(c)) return '';
  const work = c.items.filter(i => i.id !== 'cardio' && (!i.skipped || logged(i).length));
  const doneN = work.filter(isDone).length;
  const complete = work.length > 0 && doneN === work.length;
  const nSets = s.items.reduce((a, i) => a + (i.id === 'cardio' ? 0 : i.sets.length), 0);
  const html = `<section class="card done-card ${complete ? 'complete' : ''} ${ui.flashDone ? 'pop' : ''}"><div class="del-corner">${delButton(s.id)}</div>
    <div class="big-num">${complete ? 'Fatto!' : 'Fatto in parte'}</div>
    ${complete ? '' : `<p class="muted">${doneN} di ${work.length} esercizi</p><div class="bar ${lvOf(work.length ? doneN / work.length : 0)}"><i style="width:${work.length ? Math.max(4, doneN / work.length * 100) : 0}%"></i></div>`}
    <div class="summary" style="justify-content:center;margin-bottom:4px"><span><b>${s.minutes}</b> min</span><span><b>${s.kcal[0]}–${s.kcal[1]}</b> kcal</span><span><b>${nSets}</b> serie</span></div>
    ${s.records?.length ? `<p><b>Record battuti</b></p>${s.records.map(r => `<p>${esc(EX[r.id].name)} · ${kg(Math.round(r.e1rm))} kg stimati</p>`).join('')}` : ''}
  </section>`;
  ui.flashDone = false;
  return html;
}

function overview(c) {
  const logs = hasLogs(c);
  const work = c.items.filter(i => i.id !== 'cardio');
  const all = work.reduce((a, i) => a + i.planSets, 0);
  const kc = E.kcalRange(state, c.minutes, { superset: c.items.some(i => i.ss), hard: true });
  let rows = '';
  const groups = E.groupItems(c.items);
  groups.forEach((g, gi) => {
    let inner = '';
    g.items.forEach(it => {
      const idx = c.items.indexOf(it);
      const n = logged(it).length, done = isDone(it);
      const st = done ? 'ex-done' : n ? 'ex-part' : it.skipped ? 'ex-skip' : '';
      const pop = ui.flashEx === idx ? 'pop' : '';
      if (it.id === 'cardio') {
        inner += `<div class="ex-row ${st} ${pop}"><div data-act="open" data-g="${gi}"><div class="name"><span class="cardio-ico">🚴</span>Cardio extra${n ? ' <span class="check">✓</span>' : ''}</div><div class="meta">${it.minutes} min · ellittica o tapis roulant in salita</div></div>
          <div>${n ? '' : `<button class="icon" data-act="ov-del" data-i="${idx}" aria-label="Togli">✕</button>`}</div></div>`;
        return;
      }
      const e = EX[it.id];
      const best = n ? logged(it).reduce((b, x) => (x.kg > b.kg || (x.kg === b.kg && x.reps > b.reps)) ? x : b) : null;
      const meta = done ? `${n} serie · ${setTxt(it.id, best)}`
        : n ? `${n} di ${it.planSets} serie fatte` : it.skipped ? 'saltato' : `${it.planSets} × ${rangeLabel(it.id)} · ${loadLabel(it.id, it.kg)}`;
      inner += `<div class="ex-row ${st} ${pop}">
        <div><div data-act="open" data-g="${gi}"><div class="name">${esc(e.name)}${done ? ' <span class="check">✓</span>' : ''}</div>
          <div class="meta">${meta}</div>
          ${!n && it.note ? `<div class="tip ${/−|ridotto|Fermo|pausa/.test(it.note) ? 'down' : ''}">${esc(it.note)}</div>` : ''}</div>
          <div class="ctrls">
            <button data-act="ov-sets" data-i="${idx}" data-d="-1" aria-label="Una serie in meno" ${it.planSets <= Math.max(1, n) ? 'disabled' : ''}>−</button>
            <button data-act="ov-sets" data-i="${idx}" data-d="1" aria-label="Una serie in più">+</button>
            ${n ? '' : `<button data-act="ov-del" data-i="${idx}" aria-label="Togli">✕</button>`}
          </div></div>
        <div class="updown"><button class="icon" data-act="ov-move" data-i="${idx}" data-d="-1" aria-label="Sposta su" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon" data-act="ov-move" data-i="${idx}" data-d="1" aria-label="Sposta giù" ${idx === c.items.length - 1 ? 'disabled' : ''}>↓</button></div>
      </div>`;
    });
    rows += g.items.length > 1 ? `<div class="ss-box"><span class="tag">Superserie · recupero dopo la coppia</span>${inner}</div>` : inner;
    const next = groups[gi + 1];
    if (next && !g.cardio && !next.cardio) {
      rows += g.items.length > 1
        ? `<div class="join"><button data-act="ov-split" data-i="${g.start}">Separa la superserie</button></div>`
        : next.items.length === 1 && EX[g.items[0].id].type !== 'multi' && EX[next.items[0].id].type !== 'multi' && E.setupOf(g.items[0].id) === E.setupOf(next.items[0].id) ? `<div class="join"><button data-act="ov-join" data-i="${g.start}">Unisci in superserie ↕</button></div>` : '';
    }
  });
  ui.flashEx = null;
  const nextG = groups.findIndex(gr => !gr.items.every(i => isDone(i) || i.skipped));
  const nextName = nextG >= 0 ? (groups[nextG].items[0].id === 'cardio' ? 'Cardio extra' : EX[groups[nextG].items[0].id].name) : '';
  const isToday = c.date === today();
  return `<section class="card">
    ${isToday ? '' : `<div class="row between" style="margin-bottom:6px"><span class="small muted">Stai modificando un giorno passato</span><button class="ghost" data-act="past-close">Fine</button></div>`}
    <h3>${!isToday ? `Allenamento di ${dayLabel(c.date).toLowerCase()}` : c.free ? 'Esercizi di oggi' : 'Seduta di oggi'}${c.deload ? ' · scarico' : ''}</h3>
    ${c.free || !isToday ? '' : `<p class="reason">${esc(c.reason)}</p>`}
    ${logs || !isToday ? '' : `<div class="summary"><span><b>${c.minutes}</b> min</span><span><b>${work.length}</b> esercizi</span><span><b>${all}</b> serie</span><span><b>${kc[0]}–${kc[1]}</b> kcal</span></div>
    <p class="small muted">Prima 5–10 min di cardio leggero. Tocca il nome di un esercizio per aprirlo.</p>`}
    ${rows}
    <select data-in="ov-add" style="margin-top:12px">${addOptions('+ Aggiungi esercizio')}</select>
  </section>
  ${nextG >= 0 ? `<button class="primary big" data-act="open" data-g="${nextG}">${logs ? `Continua · ${esc(nextName)}` : 'Inizia'}</button>` : ''}
  ${!isToday ? '' : c.free ? `<div class="row" style="justify-content:center;margin-top:6px"><button class="ghost" data-act="full">Aggiungi la seduta completa di oggi</button></div>`
    : logs ? '' : `<div class="row" style="justify-content:center;margin-top:6px"><button class="ghost" data-act="recompose">Ricomponi la seduta</button></div>`}`;
}

// Una superserie vale solo se i suoi esercizi sono uno dopo l'altro: altrimenti si scioglie
function tidySupersets(c) {
  const items = c.items;
  items.forEach((x, k) => {
    if (!x.ss) return;
    const near = items[k - 1]?.ss === x.ss || items[k + 1]?.ss === x.ss;
    if (!near || x.id === 'cardio') x.ss = null;
  });
}

// ---------- Esercizio aperto ----------
function curGroup(c) {
  const groups = E.groupItems(c.items);
  return { groups, g: groups[Math.min(c.cur, groups.length - 1)] || groups[0] };
}

function setDefaults(c, it, i) {
  const l = logged(it);
  const prev = l[l.length - 1];
  return { kg: it.adjKg ?? (prev ? prev.kg : it.kg), reps: it.reps };
}

const INFO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM13.5 17h-3v-1.5h.8V11h-.8V9.5h2.2V15.5h.8z"/></svg>';
// "Come si fa": chiuso, si apre con un tocco
const infoOpen = id => !!ui.info?.[id];

function viewSession() {
  const c = state.current;
  const { groups, g } = curGroup(c);
  c.cur = Math.min(c.cur || 0, groups.length - 1);
  const doneG = groups.filter(gr => gr.items.every(isDone)).length;
  const segs = groups.map((gr, gi) => {
    const done = gr.items.every(isDone), skip = gr.items.every(i => i.skipped), part = gr.items.some(i => logged(i).length);
    const cls = gi === c.cur ? 'cur' : done ? 'done' : part ? 'part' : skip ? 'skip' : '';
    return `<span class="${cls} ${ui.flashSeg === gi ? 'pop' : ''}" data-act="goto" data-g="${gi}"></span>`;
  }).join('');
  ui.flashSeg = null;
  let html = `<div class="topbar"><div class="row between" style="margin-bottom:8px"><button class="ghost back" data-act="list">‹ Elenco</button>
    <span class="muted small">esercizio ${c.cur + 1} di ${groups.length} · ${doneG} fatti</span></div><div class="progress">${segs}</div></div>`;

  const sm = g.items.length > 1;
  const usedIds = new Set(c.items.map(x => x.id));
  const pairNext = sm && g.items.length === 2 && g.items.every(x => !logged(x).length) ? E.nextSetupPair(state, g.items[0].id, g.items[1].id, usedIds) : null;
  html += `<section class="card">${sm ? `<span class="tag">Superserie: alterna i due esercizi, recupero dopo la coppia</span>
    ${pairNext ? `<div class="ctrls" style="margin:2px 0 14px"><button data-act="swap-pair" data-g="${c.cur}">Cambia attrezzo a tutti e due</button></div>` : ''}` : ''}`;
  // turno nella superserie: l'esercizio con meno serie fatte
  const turn = g.items.filter(i => !isDone(i) && !i.skipped).sort((a, b) => logged(a).length - logged(b).length)[0];
  for (const it of g.items) {
    const idx = c.items.indexOf(it);
    if (it.id === 'cardio') {
      html += `<h3>Cardio extra · ${it.minutes} min</h3><p class="muted">Ellittica o tapis roulant in salita, a un ritmo in cui riesci ancora a parlare.</p>
        <button class="${it.sets.length ? '' : 'primary'} big" style="margin-top:12px" data-act="cardio-done" data-i="${idx}">${it.sets.length ? 'Fatto ✓ (tocca per togliere)' : 'Segna come fatto'}</button>`;
      continue;
    }
    const e = EX[it.id]; const st = E.exSettings(state, it.id);
    const last = E.suggestion(pastState(), it.id).last;
    const open = infoOpen(it.id);
    html += `<div class="${ui.swapped === idx ? 'pop' : ''}" style="${sm && it !== g.items[0] ? 'margin-top:18px;padding-top:16px;border-top:2px solid var(--line)' : ''}">
      <div class="row between" style="align-items:flex-start"><h3>${esc(e.name)}${isDone(it) ? ' <span class="check">✓</span>' : ''}</h3><span class="muted small" style="white-space:nowrap;margin-top:4px">${it.planSets} × ${rangeLabel(it.id)}</span></div>
      ${musclesHtml(e)}
      ${flipHtml(it.id)}
      <button class="info-btn" data-act="info" data-id="${it.id}" aria-expanded="${open}">${INFO_ICON}${open ? 'Nascondi istruzioni' : `Come si fa${st.note ? ' e nota' : ''}`}</button>
      ${open ? `<div class="how ${ui.infoAnim === it.id ? 'open' : ''}">${howHtml(e)}
        <div class="note"><b>Nota personale</b><input type="text" placeholder="es. sedile al 4" value="${esc(st.note)}" data-in="note" data-id="${it.id}"></div></div>` : ''}
      ${(() => { const sw = swapButtons(c, g, it, idx, usedIds); return sw ? `<div class="ctrls">${sw}</div>` : ''; })()}`;
    if (!st.incSet && !noKg(it.id)) {
      html += `<div style="margin-top:10px"><p class="small"><b>Di quanto sale il carico su questo attrezzo?</b> Lo chiedo una volta sola.</p>
        <div class="chips" style="margin-top:6px">${[1, 1.25, 2, 2.5, 5].map(v => `<button class="${v === st.inc ? 'on' : ''}" data-act="inc" data-id="${it.id}" data-v="${v}">${kg(v)} kg</button>`).join('')}</div></div>`;
    }
    const wu = !logged(it).length ? E.warmups(state, it.id, it.kg) : [];
    const firstForMuscle = c.items.findIndex(x => x.id !== 'cardio' && EX[x.id].muscle === e.muscle) === idx;
    if (wu.length && firstForMuscle) html += `<p class="small" style="margin-top:10px"><b>Riscaldamento:</b> ${wu.map(w => `1×${w.reps} a ${kg(w.kg)} kg`).join(', poi ')}</p>`;
    if (it.note && !logged(it).length) html += `<p class="small" style="margin-top:6px;color:var(--ok)">${esc(it.note)}</p>`;

    // Serie: tinta per numero di serie; sulle serie fatte si tocca lo sforzo per cambiarlo, di nuovo per toglierla
    html += `<div class="sets">`;
    const n = Math.max(it.planSets, it.sets.length);
    let activeShown = false;
    for (let i = 0; i < n; i++) {
      const s = it.sets[i];
      const lastSet = last?.sets[i] || last?.sets[last.sets.length - 1];
      const lastTxt = lastSet ? `ultima volta ${setTxt(it.id, lastSet)}` : 'prima volta';
      const editing = ui.editSet && ui.editSet.i === idx && ui.editSet.s === i;
      const isActive = editing || (!s && !activeShown && !it.skipped && (!sm || it === turn));
      const lv = `lv${Math.min(3, i + 1)}`;
      const fl = ui.flash && ui.flash.i === idx;
      if (s && !editing) {
        html += `<div class="set logged ${lv} ${fl && ui.flash.s === i ? 'pop' : ''}"><span class="n">${i + 1}</span>
          <span class="val" data-act="edit-set" data-i="${idx}" data-s="${i}">${setTxt(it.id, s)}</span>
          <span class="effs">${EFFS.map(([k, label, , elv]) => `<button class="${elv} ${s.eff === k ? 'on' : ''}" data-act="eff" data-i="${idx}" data-s="${i}" data-eff="${k}" aria-pressed="${s.eff === k}">${k === 'limite' ? 'Limite' : label}</button>`).join('')}</span></div>`;
      } else if (isActive) {
        activeShown = true;
        const d = s ? { kg: s.kg, reps: s.reps } : (ui.draft?.i === idx && ui.draft?.s === i ? ui.draft : setDefaults(c, it, i));
        ui.draft = { i: idx, s: i, kg: d.kg, reps: d.reps };
        const plates = E.platesPerSide(state, it.id, d.kg);
        html += `<div class="set active ${lv} ${fl || editing ? 'slide' : ''}"><div class="row between"><b>Serie ${i + 1}${editing ? ' · modifica' : ''}</b><span class="lastline">${esc(lastTxt)}</span></div>
          <div class="steppers ${noKg(it.id) ? 'one' : ''}">
            ${noKg(it.id) ? '' : `<div class="stepper"><button data-act="kg" data-d="-1" aria-label="Meno peso">−</button><b><input class="kgin" type="text" inputmode="decimal" value="${d.kg == null ? '' : kg(d.kg)}" placeholder="?" data-in="draft-kg" aria-label="Carico in kg"><small>kg</small></b><button data-act="kg" data-d="1" aria-label="Più peso">+</button></div>`}
            <div class="stepper"><button data-act="reps" data-d="-1" aria-label="Meno">−</button><b>${d.reps}<small>${e.type === 'time' ? 'secondi' : 'ripetizioni'}</small></b><button data-act="reps" data-d="1" aria-label="Più">+</button></div>
          </div>
          ${plates ? `<p class="small muted" style="margin:-2px 0 8px">Per lato: ${plates.plates.length ? plates.plates.map(kg).join(' + ') : 'nessun disco'}${plates.rest > 0 ? ` (mancano ${kg(plates.rest)} kg per lato con i tuoi dischi)` : ''}</p>` : ''}
          <div class="effort">${EFFS.map(([k, label, hint, elv]) => `<button class="${elv} ${editing && s?.eff === k ? 'on' : ''}" data-act="log" data-eff="${k}">${label}<small>${hint}</small></button>`).join('')}</div>
          ${editing ? `<div class="row" style="justify-content:center;margin-top:6px"><button class="ghost" data-act="edit-cancel">Annulla modifica</button></div>` : ''}</div>`;
      } else {
        const d = setDefaults(c, it, i);
        html += `<div class="set future"><span class="n">${i + 1}</span><span class="val">${d.kg == null && !noKg(it.id) ? '—' : setTxt(it.id, d)}</span><span></span></div>`;
      }
    }
    html += `</div>
      <div class="ctrls" style="margin-top:8px"><button data-act="add-set" data-i="${idx}">+ serie</button>
      ${!isDone(it) ? `<button data-act="skip" data-i="${idx}">${it.skipped ? 'Riprendi' : 'Salta'}</button>` : ''}</div>
    </div>`;
  }
  ui.flash = null; ui.infoAnim = null; ui.swapped = null;
  html += `</section>`;
  const lastG = c.cur >= groups.length - 1;
  const gDone = g.items.every(i => isDone(i) || i.skipped);
  html += `<div class="row" style="gap:8px">
    <button class="grow" data-act="goto" data-g="${Math.max(0, c.cur - 1)}" ${c.cur === 0 ? 'disabled' : ''}>← Indietro</button>
    ${lastG ? `<button class="grow primary" data-act="list">Elenco ✓</button>` : `<button class="grow primary" data-act="goto" data-g="${c.cur + 1}">${gDone ? 'Prossimo esercizio →' : 'Avanti →'}</button>`}
  </div>`;
  return html;
}

// Cambi dentro la scheda: "Cambia attrezzo" (macchina occupata → cavo → manubri → ...) e
// "Cambia esercizio" (un altro con lo stesso attrezzo; in superserie, alla stessa postazione del compagno)
function swapButtons(c, g, it, idx, used) {
  if (logged(it).length) return '';
  const partner = g.items.length > 1 ? g.items.find(x => x !== it) : null;
  const sameNext = E.nextSameSetup(state, it.id, used, partner?.id);
  const setupNext = partner ? null : E.nextSetup(state, it.id, used);
  return `${setupNext ? `<button data-act="swap-setup" data-i="${idx}">Cambia attrezzo</button>` : ''}${sameNext ? `<button data-act="swap-ex" data-i="${idx}">Cambia esercizio</button>` : ''}`;
}
function replaceEx(it, nid) {
  const sg = E.suggestion(pastState(), nid);
  Object.assign(it, { id: nid, kg: sg.kg, reps: sg.reps, note: sg.note, sets: [] }); delete it.adjKg; delete it.orig;
  ui.draft = null; ui.editSet = null; ui.swapped = state.current.items.indexOf(it);
}

function logSet(eff) {
  const c = state.current; const d = ui.draft; if (!d) return;
  const it = c.items[d.i]; const e = EX[it.id];
  if (!noKg(it.id) && d.kg == null) { toast('Scegli prima il carico'); return; }
  const set = { kg: noKg(it.id) ? 0 : d.kg, reps: d.reps, eff, t: Date.now() };
  const wasEdit = !!it.sets[d.s];
  if (wasEdit) set.t = it.sets[d.s].t || set.t;
  if (!noKg(it.id) && !E.exSettings(state, it.id).incSet) state.settings.ex[it.id] = { ...(state.settings.ex[it.id] || {}), inc: E.exSettings(state, it.id).inc };
  const wasDone = isDone(it);
  it.sets[d.s] = set; it.skipped = false;
  // Al limite già alla prima serie sotto il minimo: le serie seguenti si alleggeriscono
  const r = TYPE_RULES[e.type];
  if (d.s === 0 && eff === 'limite' && d.reps < r.min && !noKg(it.id)) {
    it.adjKg = Math.max(E.exSettings(state, it.id).inc, E.roundTo(d.kg * 0.925, E.exSettings(state, it.id).inc));
  } else if (d.s === 0) delete it.adjKg;
  ui.editSet = null; ui.draft = null; ui.flash = { i: d.i, s: d.s };
  if (!wasDone && isDone(it)) ui.flashEx = d.i;
  if (!wasEdit) {
    const { groups, g } = curGroup(c);
    const counts = g.items.filter(i => !i.skipped).map(i => logged(i).length);
    const pairDone = counts.every(x => x === counts[0]);
    if (pairDone) {
      const rest = g.items.length > 1 ? 90 : TYPE_RULES[e.type].rest;
      const allDone = g.items.every(i => isDone(i) || i.skipped);
      if (allDone) {
        ui.flashSeg = c.cur;
        const nextG = groups.findIndex((gr, gi) => gi > c.cur && !gr.items.every(i => isDone(i) || i.skipped));
        const anyG = nextG >= 0 ? nextG : groups.findIndex(gr => !gr.items.every(i => isDone(i) || i.skipped));
        if (anyG >= 0) startRest(rest, 'poi il prossimo esercizio'); else state.rest = null;
        // passa da solo all'esercizio dopo (se nel frattempo non hai già cambiato schermata o tolto la serie)
        const from = c.cur, still = () => state.current === c && c.view === 'ex' && c.cur === from && g.items.every(i => isDone(i) || i.skipped);
        clearTimeout(ui.advance);
        if (anyG >= 0 && anyG !== c.cur) ui.advance = setTimeout(() => { if (still()) go(anyG); }, 700);
        else if (anyG < 0) ui.advance = setTimeout(() => { if (still()) { ui.flashDone = true; showList(); } }, 700);
      } else startRest(rest, `poi serie ${counts[0] + 1}`);
    }
  }
  sync(); save(); render();
  // la serie successiva resta a metà schermo, sopra il timer
  requestAnimationFrame(() => $('.set.active')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
}

// Tocco sullo sforzo di una serie già fatta: un altro sforzo lo cambia, lo stesso la toglie
function toggleEff(i, si, eff) {
  const c = state.current; const it = c.items[i]; const s = it.sets[si]; if (!s) return;
  if (s.eff === eff) {
    it.sets.splice(si, 1);
    if (si === 0) delete it.adjKg;
    if (state.rest && !logged(it).length) state.rest = null;
  } else s.eff = eff;
  ui.draft = null; ui.editSet = null;
  sync(); save(); render();
}

// Navigazione tra elenco ed esercizi (il ritorno all'elenco non interrompe niente)
function go(g) { const c = state.current; c.cur = g; c.view = 'ex'; ui.editSet = null; ui.draft = null; save(); keepAwake(true); toTop(); render(); }
function showList() { const c = state.current; if (c) c.view = 'list'; ui.editSet = null; ui.draft = null; save(); toTop(); render(); }

// ---------- PIANO ----------
// Traguardo del ciclo: carichi degli esercizi a priorità alta e peso medio, con la strada già fatta
function goalsHtml() {
  const g = E.cycleGoals(state, today());
  const row = (name, goal, sub, p) => `<div class="goal"><div class="row between" style="align-items:baseline"><span>${name}</span><span class="nowrap">${goal}</span></div>
    <div class="bar ${lvOf(p)}"><i style="width:${Math.max(3, Math.min(100, p * 100))}%"></i></div><div class="small muted">${sub}</div></div>`;
  let html = g.lifts.map(x => {
    const p = x.now == null ? 0 : Math.max(0, (x.now - x.from) / (x.to - x.from));
    return row(esc(EX[x.id].name), `<b>${kg(x.to)} kg</b> × ${x.reps}`, `partenza ${kg(x.from)} kg${x.now != null ? ` · ora ${kg(x.now)} kg` : ''}`, p);
  }).join('');
  if (g.weight) {
    const w = g.weight, p = w.from > w.to ? Math.max(0, (w.from - w.now) / (w.from - w.to)) : 0;
    html += row('Peso medio', `<b>${kg(w.to)} kg</b>`, `partenza ${kg(w.from)} kg · ora ${kg(w.now)} kg`, p);
  }
  return html || '<p class="small muted">Compare dopo le prime sedute.</p>';
}

function viewPiano() {
  const ci = E.cycleInfo(state); const s = state.settings;
  const done7 = E.setsByMuscle(state, E.addDays(today(), -6), today());
  let html = `<h1>Piano</h1>
  <section class="card"><div class="row between"><h3>Ciclo ${ci.n}</h3><span class="muted">${ci.deloadLeft ? `scarico: ${ci.deloadLeft} sedute` : `seduta ${ci.session} di ${ci.length}`}</span></div>
    <div class="bar" style="margin:10px 0"><i style="width:${Math.min(100, ci.done / ci.length * 100)}%"></i></div>
    <p class="small muted" style="margin-bottom:6px">Traguardo del ciclo · lo calcola l’app</p>
    ${goalsHtml()}
    <p class="small muted" style="margin-top:10px">Dopo 12 sedute punto di controllo (peso e vita), dopo ${ci.length} (o prima, se 3 esercizi sono fermi) 3 sedute di scarico, poi ciclo nuovo. Obiettivi di serie: livello ${E.levelOf(state) + 1} di 3.</p></section>

  <h2>Serie per muscolo · ultimi 7 giorni</h2><section class="card">
  ${MUSCLE_ORDER.map(m => { const t = E.targetFor(state, m); const v = Math.round(done7[m] * 2) / 2; const p = Math.min(100, v / t * 100);
    return `<div class="mrow"><span>${MUSCLES[m].name}</span><span class="muted">${kg(v)} / ${t}</span><div class="bar ${lvOf(v / t)}"><i style="width:${p}%"></i></div></div>`; }).join('')}
  </section>

  <h2>Ritmo</h2><section class="card stack">
    <p class="small muted">Giorni in cui pensi di andare</p>
    <div class="chips week">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button class="${s.days.includes(d) ? 'on' : ''}" data-act="pday" data-v="${d}">${E.DAY_NAMES[d].slice(0, 3)}</button>`).join('')}</div>
    ${s.days.length ? `<p class="small muted">${s.days.length} ${s.days.length === 1 ? 'giorno' : 'giorni'} a settimana. Se ne salti uno, la seduta dopo recupera quello che manca.</p>`
      : `<div class="row between"><span>Sedute ogni 7 giorni</span><span class="seg">${[2, 3, 4].map(n => `<button class="${s.freq === n ? 'on' : ''}" data-act="freq" data-v="${n}">${n}</button>`).join('')}</span></div>
    <p class="small muted">Nessun giorno scelto: i giorni li propone l’app.</p>`}
  </section>

  <h2>Priorità ed esercizi</h2><section class="card">
  <p class="small muted">Accanto al muscolo: quante serie fargli fare. Sotto, tocca un esercizio per cambiarne la priorità, tienilo premuto per vedere com’è.</p>
  <div class="legend"><span><i class="dot lv3"></i>alta: sempre, misura i progressi</span><span><i class="dot lv2"></i>media: a rotazione</span><span><i class="dot lv1"></i>bassa: ogni tanto</span><span>senza colore: mai</span></div>
  ${MUSCLE_ORDER.map(m => {
    const groups = EQUIP_GROUPS.map(g => ({ ...g, list: EXERCISES.filter(e => e.muscle === m && visible(e) && g.eq.includes(e.equip)) })).filter(g => g.list.length);
    return `<div class="pm"><div class="head"><b>${MUSCLES[m].name}</b>
      <span class="seg lv">${['alta', 'normale', 'minima'].map(v => `<button class="${s.priority[m] === v ? 'on ' + PRIO_LV[v] : ''}" data-act="prio" data-m="${m}" data-v="${v}">${PRIO_LABEL[v]}</button>`).join('')}</span></div>
      ${groups.map(g => `<div class="eqlabel">${g.label}</div><div class="pchips">${g.list.map(e => { const lv = E.exPrio(state, e.id);
        return `<button class="${XP_LV[lv] || ''}" data-act="xp" data-id="${e.id}" aria-label="${esc(e.name)}: priorità ${['nessuna', 'bassa', 'media', 'alta'][lv]}">${esc(e.name)}</button>`; }).join('')}</div>`).join('')}
    </div>`; }).join('')}
  </section>`;
  return html;
}

// ---------- PROGRESSI ----------
function viewProgressi() {
  const t = today();
  const ss = state.sessions;
  let html = `<h1>Progressi</h1>`;
  if (!ss.length) html += `<section class="card"><p>Qui vedrai massimali stimati, record e costanza.</p><p class="muted">Compare tutto dopo la prima seduta.</p></section>`;
  const ci = E.cycleInfo(state);
  if (ss.length) html += `<section class="card"><div class="row between"><h3>Ciclo ${ci.n}</h3><span class="muted">seduta ${ci.session} di ${ci.length}</span></div>
    ${goalsHtml()}
    ${state.cycle.history.map(h => `<p class="small">Ciclo ${h.n}: ${h.sessions} sedute · ${h.levelUp ? 'obiettivi saliti' : 'stesso livello'}</p>`).join('')}</section>`;

  // Massimale stimato sulle àncore
  if (ss.length) {
  html += `<h2>Massimale stimato · esercizi a priorità alta</h2><section class="card">`;
  let any = false;
  for (const id of MUSCLE_ORDER.flatMap(m => E.anchorsOf(state, m))) {
    if (noKg(id)) continue;
    const h = E.history(state, id).filter(p => !p.deload).reverse();
    if (!h.length) continue;
    any = true;
    const vals = h.map(p => E.bestE1rm(p.sets));
    const cur = vals[vals.length - 1], first = vals[0];
    const diff = cur - first;
    html += `<div class="mrow"><span><b>${esc(EX[id].name)}</b></span><span>${kg(Math.round(cur))} kg ${h.length > 1 ? `<span class="small" style="color:${diff >= 0 ? 'var(--ok)' : 'var(--warn)'}">${diff >= 0 ? '+' : ''}${kg(Math.round(diff))}</span>` : ''}</span>
      <div style="grid-column:1/-1">${spark(vals)}</div></div>`;
  }
  html += any ? '' : '<p class="muted">Ancora nessun dato sugli esercizi a priorità alta.</p>';
  html += `</section>`;

  // Record personali
  const best = {};
  for (const s of ss) for (const it of s.items) for (const st of (it.sets || [])) {
    if (!EX[it.id] || noKg(it.id) || !st) continue;
    const v = E.epley(st.kg, st.reps);
    if (!best[it.id] || v > best[it.id].v) best[it.id] = { v, st, date: s.date };
  }
  const recs = Object.entries(best).sort((a, b) => b[1].v - a[1].v);
  if (recs.length) html += `<h2>Record personali</h2><section class="card">${recs.map(([id, b]) => `<div class="mrow"><span>${esc(EX[id].name)}</span><span><b>${kg(b.st.kg)} × ${b.st.reps}</b> <span class="muted small">${kg(Math.round(b.v))} kg stim.</span></span></div>`).join('')}</section>`;

  // Costanza: 12 settimane
  const days = new Set(ss.map(s => s.date));
  const startMon = E.addDays(t, -((E.weekday(t) + 6) % 7) - 7 * 11);
  let cells = '';
  for (let i = 0; i < 84; i++) { const k = E.addDays(startMon, i); cells += `<i class="${k > t ? 'out' : days.has(k) ? 'on' : ''}"></i>`; }
  const last30 = ss.filter(s => E.diffDays(t, s.date) < 30).length;
  html += `<h2>Costanza</h2><section class="card"><div class="row between"><div class="grid-days">${cells}</div>
    <div style="text-align:right"><div class="big-num">${last30}</div><div class="small muted">sedute<br>ultimi 30 giorni</div><p class="small muted" style="margin-top:6px">${ss.length} in totale</p></div></div></section>`;

  }
  // Peso e vita
  const w = state.body.weights;
  const avgs = [];
  for (let i = 0; i < w.length; i++) avgs.push(E.weightAvg(state, w[i].date));
  const waist = state.body.waist;
  html += `<h2>Peso e vita</h2><section class="card">
    <div class="row"><span class="grow">Peso di stamattina (kg)</span><input style="width:110px" type="text" inputmode="decimal" placeholder="${w.find(x => x.date === t) ? kg(w.find(x => x.date === t).kg) : 'kg'}" data-in="weight"></div>
    ${w.length ? `<div class="row between" style="margin-top:10px"><span>Media 7 giorni</span><b>${kg(Math.round(E.weightAvg(state, w[w.length - 1].date) * 10) / 10)} kg</b></div>${spark(avgs)}` : ''}
    <div class="row" style="margin-top:10px"><span class="grow">Vita (cm)</span><input style="width:110px" type="text" inputmode="decimal" placeholder="${waist.length ? kg(waist[waist.length - 1].cm) : 'cm'}" data-in="waist"></div>
    ${waist.slice(-4).reverse().map(x => `<p class="small muted">${x.date.split('-').reverse().slice(0, 2).join('/')}: ${kg(x.cm)} cm</p>`).join('')}
  </section>`;

  // Elenco allenamenti, con cestino
  if (ss.length) html += `<h2>Allenamenti</h2><section class="card">${[...ss].reverse().map(s => {
    const n = s.items.reduce((a, i) => a + (i.id === 'cardio' ? 0 : (i.sets || []).length), 0);
    return `<div class="mrow" style="align-items:center"><span><b>${dayLabel(s.date)}</b>${s.deload ? ' <span class="small muted">scarico</span>' : ''}${s.free ? ' <span class="small muted">extra</span>' : s.frac < 1 ? ' <span class="small muted">parziale</span>' : ''}<br><span class="small muted">${s.minutes || '?'} min · ${n} serie${s.kcal ? ` · ${s.kcal[0]}–${s.kcal[1]} kcal` : ''}</span></span>${delButton(s.id)}</div>`;
  }).join('')}</section>`;
  return html;
}

// ---------- ALIMENTAZIONE ----------
function viewCibo() {
  const n = state.nutrition; const w = state.body.weights; const t = today();
  const avg = w.length ? E.weightAvg(state, w[w.length - 1].date) : null;
  const avgOld = w.length ? E.weightAvg(state, E.addDays(w[w.length - 1].date, -7)) : null;
  const todayW = w.find(x => x.date === t);
  return `<h1>Alimentazione</h1>
  <p class="muted">Livelli da tenere ogni giorno, allenamento o riposo. I pasti si registrano in Yazio.</p>
  <section class="card">
    <div class="kv"><span>Calorie</span><b>${thousands(n.kcal)} kcal</b></div>
    <div class="kv"><span>Proteine</span><b>${n.protein} g</b><span class="small muted" style="grid-column:1/-1">circa ${Math.round(n.protein / 4 / 5) * 5} g in 4 pasti</span></div>
    <div class="kv"><span>Grassi</span><b>almeno ${n.fat} g</b></div>
    <div class="kv"><span>Carboidrati</span><b>circa ${E.carbs(n)} g</b></div>
  </section>
  ${n.last ? `<section class="alert small"><b>Ultima modifica:</b> ${esc(n.last)}</section>` : ''}
  <h2>Peso</h2><section class="card">
    <div class="row"><span class="grow">Peso di stamattina, a digiuno</span><input style="width:110px" type="text" inputmode="decimal" placeholder="${todayW ? kg(todayW.kg) : 'kg'}" data-in="weight"></div>
    ${avg != null ? `<div class="kv" style="margin-top:8px"><span>Media 7 giorni</span><b>${kg(Math.round(avg * 10) / 10)} kg</b>
      ${avgOld != null ? `<span class="small muted" style="grid-column:1/-1">${avg - avgOld <= 0 ? '' : '+'}${kg(Math.round((avg - avgOld) * 10) / 10)} kg rispetto a 7 giorni prima</span>` : ''}</div>` : ''}
    <p class="small muted">Pesati 2–3 volte ogni 7 giorni. Ogni 14 giorni l’app corregge le calorie se il calo è troppo lento (meno di 0,4 kg a settimana) o troppo veloce (più di 1 kg).</p>
  </section>`;
}

// ---------- IMPOSTAZIONI ----------
function viewImpostazioni() {
  const s = state.settings;
  const planIds = MUSCLE_ORDER.flatMap(m => E.poolOf(state, m)).filter(id => !noKg(id));
  return `<h1>Impostazioni</h1>
  <h2>Allenamento</h2><section class="card stack">
    <div class="row between"><span>Durata seduta</span><span class="seg">${[55, 65, 75].map(v => `<button class="${s.sessionMinutes === v ? 'on' : ''}" data-act="dur" data-v="${v}">${v}′</button>`).join('')}</span></div>
    <div><span>Suono a fine recupero</span>
      <div class="seg" style="margin-top:8px">${[['off', 'no'], ['on', 'sì'], ['loud', 'anche in silenzioso']].map(([v, l]) => `<button class="${soundMode() === v ? 'on' : ''}" data-act="sound" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="small muted" style="margin-top:6px">${soundMode() === 'loud' ? 'Suona anche con l’iPhone in silenzioso, ma può mettere in pausa la musica.' : soundMode() === 'on' ? 'Si sente sopra la musica, ma non con l’iPhone in silenzioso.' : 'A fine recupero il timer diventa verde, senza suono.'} Con lo schermo spento non suona.</p></div>
    ${soundMode() === 'off' ? '' : '<button class="ghost" style="align-self:flex-start" data-act="sound-test">▶︎ Prova il suono</button>'}
  </section>
  <h2>Dischi disponibili</h2><section class="card"><div class="chips">${[25, 20, 15, 10, 5, 2.5, 1.25].map(p => `<button class="${s.plates.includes(p) ? 'on' : ''}" data-act="plate" data-v="${p}">${kg(p)} kg</button>`).join('')}</div>
    <p class="small muted" style="margin-top:8px">Per gli attrezzi a dischi l’app ti dice cosa mettere per lato.</p></section>
  <h2>Attrezzi</h2><section class="card">
    <p class="small muted">Salto di carico, se si carica con i dischi e il peso a vuoto (slitta o bilanciere).</p>
    ${planIds.map(id => { const x = E.exSettings(state, id); return `<div class="exset"><span>${esc(EX[id].name)}</span>
      <select data-in="ex-inc" data-id="${id}">${[1, 1.25, 2, 2.5, 5].map(v => `<option value="${v}" ${v === x.inc ? 'selected' : ''}>+${kg(v)}</option>`).join('')}</select>
      <button class="${x.plates ? 'primary' : ''}" style="min-height:36px;padding:4px 10px;font-size:13px" data-act="ex-plates" data-id="${id}">dischi</button>
      ${x.plates ? `<span class="small muted" style="grid-column:1/2">peso a vuoto</span><input type="text" inputmode="decimal" value="${kg(x.base)}" data-in="ex-base" data-id="${id}">` : ''}</div>`; }).join('')}
  </section>
  <h2>Dati e backup</h2><section class="card stack">
    <p class="small muted">I dati restano su questo telefono anche quando l’app si aggiorna. Se cancelli l’app o cambi iPhone servono una copia su file (per esempio su iCloud Drive). Ultima copia su file: <b>${state.meta.exported ? dayLabel(state.meta.exported) : 'mai'}</b>.</p>
    <div class="row"><button class="grow" data-act="export">Salva copia</button><label class="grow" style="display:block"><input type="file" accept="application/json,.json" data-in="import" hidden><span class="row filebtn">Carica copia</span></label></div>
    ${snapList().length ? `<p class="small muted" style="margin-top:12px">Copie automatiche su questo telefono</p>
      ${[...snapList()].reverse().map(x => { const d = new Date(x.at); return `<div class="row between snap"><span class="small">${dayLabel(E.dayKey(d))} ${E.pad(d.getHours())}:${E.pad(d.getMinutes())} · ${x.n} ${x.n === 1 ? 'allenamento' : 'allenamenti'}${x.why !== 'automatica' ? `<br><span class="muted">${esc(x.why)}</span>` : ''}</span>
        <button class="ghost" data-act="snap" data-k="${x.k}">${ui.confirmSnap === x.k ? 'Conferma' : 'Ripristina'}</button></div>`; }).join('')}` : ''}
    <button class="danger" style="margin-top:14px" data-act="reset">${ui.confirmReset ? 'Tocca di nuovo per cancellare tutto' : 'Cancella tutti i dati'}</button>
  </section>
  <p class="small muted" style="text-align:center;margin-top:16px">Sala Pesi · versione 1.4 · dati formato ${E.SCHEMA}<br>Immagini esercizi: Free Exercise DB (pubblico dominio)</p>`;
}

// ---------- Render ----------
const VIEWS = { oggi: viewOggi, piano: viewPiano, progressi: viewProgressi, cibo: viewCibo, impostazioni: viewImpostazioni };
// Transizione leggera solo quando cambia schermata (non a ogni tocco)
let lastKey = null;
function screenKey() { const c = state.current; return ui.tab === 'oggi' && c?.view === 'ex' && c.date === (ui.day || today()) ? `ex:${c.cur}` : ui.tab + (ui.tab === 'oggi' ? ':' + (ui.day || '') : ''); }
function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const key = screenKey();
  let cls = '';
  if (lastKey && key !== lastKey) {
    const a = lastKey.startsWith('ex:') ? +lastKey.slice(3) : null, b = key.startsWith('ex:') ? +key.slice(3) : null;
    cls = a == null && b != null ? 'enter-fwd' : a != null && b == null ? (key === 'oggi' ? 'enter-back' : 'enter-fade') : a != null && b != null ? (b > a ? 'enter-fwd' : 'enter-back') : 'enter-fade';
  }
  lastKey = key;
  $('#view').innerHTML = `<div class="screen ${cls}">${VIEWS[ui.tab]()}</div>`;
  placeStrip();
  renderSheet();
  if (state.current?.view !== 'ex' && !state.rest) keepAwake(false);
  tickTimer();
}

// ---------- Scheda esercizio a comparsa (tenendo premuto in Piano) ----------
function renderSheet() {
  const el = $('#sheet'); const e = ui.sheet && EX[ui.sheet];
  if (!e) { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; } return; }
  if (el.dataset.id === e.id && !el.hidden) return;
  el.dataset.id = e.id;
  el.innerHTML = `<div class="sheet-bg" data-act="sheet-close"></div>
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="${esc(e.name)}">
      <div class="row between" style="align-items:flex-start"><h3>${esc(e.name)}</h3><button class="icon ghost" data-act="sheet-close" aria-label="Chiudi">✕</button></div>
      ${musclesHtml(e)}${flipHtml(e.id)}<div class="how">${howHtml(e)}</div>
    </div>`;
  el.hidden = false;
}
function closeSheet() { ui.sheet = null; $('#sheet').dataset.id = ''; renderSheet(); }

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) { navigator.share({ files: [file] }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------- Azioni ----------
document.addEventListener('click', ev => {
  unlockAudio();
  const tab = ev.target.closest('[data-tab]');
  if (tab) {
    if (tab.dataset.tab === 'oggi' && ui.tab === 'oggi' && ui.day) { ui.stripX = null; return setDay(today()); }   // secondo tocco su Oggi: torna a oggi
    ui.tab = tab.dataset.tab; ui.confirmReset = false; ui.confirmDel = null; ui.confirmSnap = null; toTop(); render(); return;
  }
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act; const c = state.current;
  const i = +el.dataset.i; const d = +el.dataset.d;
  const rerender = () => { if (c) { tidySupersets(c); c.minutes = E.itemMinutes(c.items); sync(); } save(); render(); };
  const replan = () => { if (c && !hasLogs(c)) state.current = null; };
  switch (a) {
    case 'intro-ok': state.seenIntro = true; return rerender();
    case 'cycle-ok': state.cycleBanner = null; return rerender();
    case 'notice-ok': state.notice = null; return rerender();
    case 'force': state.current = E.compose(state, today()); state.current.forced = true; save(); return render();
    case 'recompose': { if (hasLogs(c)) return; const f = c?.forced; state.current = E.compose(state, today()); state.current.forced = f; toast('Seduta ricomposta'); save(); return render(); }
    case 'open': return go(+el.dataset.g);
    case 'day': { const k = el.dataset.k; if (!el.closest('#strip')) ui.stripX = null; return setDay(k); }
    case 'past-open': openPast(el.dataset.k); save(); return render();
    case 'past-close': leavePast(); save(); toTop(); return render();
    case 'backup-later': state.meta.remindAt = today(); return rerender();
    case 'sheet-close': return closeSheet();
    case 'snap': {
      const k = el.dataset.k;
      if (ui.confirmSnap !== k) { ui.confirmSnap = k; return render(); }
      ui.confirmSnap = null;
      try {
        const raw = localStorage.getItem(k); const data = JSON.parse(raw);
        snapshot(JSON.stringify(state), 'prima del ripristino');
        state = E.migrate(data); state.meta = state.meta || {}; ui.day = null; save(); toast('Dati ripristinati');
      } catch { toast('Copia non leggibile'); }
      return render();
    }
    case 'full': {   // dagli esercizi liberi alla seduta completa, tenendo quelli già segnati
      const n = E.compose(state, today());
      const keep = c.items.filter(x => logged(x).length);
      n.items = [...keep, ...n.items.filter(x => !keep.some(k => k.id === x.id))];
      Object.assign(n, { forced: true, view: 'list', cur: 0 }); n.minutes = E.itemMinutes(n.items);
      state.current = n; sync(); save(); return render();
    }
    case 'list': return showList();
    case 'ov-sets': c.items[i].planSets = Math.max(1, logged(c.items[i]).length, Math.min(8, c.items[i].planSets + d)); return rerender();
    case 'ov-del': if (logged(c.items[i]).length) return; c.items.splice(i, 1); c.cur = Math.min(c.cur, Math.max(0, E.groupItems(c.items).length - 1)); return rerender();
    case 'ov-move': {
      const j = i + d; if (j < 0 || j >= c.items.length) return;
      [c.items[i], c.items[j]] = [c.items[j], c.items[i]];
      return rerender();
    }
    case 'swap-ex': case 'swap-setup': {
      const it = c.items[i]; if (!it || logged(it).length) return;
      const used = new Set(c.items.map(x => x.id));
      const partner = it.ss ? c.items.find(x => x !== it && x.ss === it.ss) : null;
      const nid = a === 'swap-ex' ? E.nextSameSetup(state, it.id, used, partner?.id) : E.nextSetup(state, it.id, used);
      if (!nid) return;
      replaceEx(it, nid); return rerender();
    }
    case 'swap-pair': {
      const { groups } = curGroup(c); const g = groups[+el.dataset.g]; if (!g || g.items.length !== 2 || g.items.some(x => logged(x).length)) return;
      const nx = E.nextSetupPair(state, g.items[0].id, g.items[1].id, new Set(c.items.map(x => x.id)));
      if (!nx) return;
      replaceEx(g.items[0], nx[0]); replaceEx(g.items[1], nx[1]); ui.swapped = null; ui.flash = null;
      return rerender();
    }
    case 'ov-join': { const tag = 'u' + Date.now(); c.items[i].ss = tag; c.items[i + 1].ss = tag; const m = Math.max(c.items[i].planSets, c.items[i + 1].planSets); c.items[i].planSets = c.items[i + 1].planSets = m; return rerender(); }
    case 'ov-split': { const tag = c.items[i].ss; c.items.forEach(x => { if (x.ss === tag) x.ss = null; }); return rerender(); }
    case 'goto': return go(+el.dataset.g);
    case 'kg': { if (!ui.draft) return; const it = c.items[ui.draft.i]; const inc = E.exSettings(state, it.id).inc; ui.draft.kg = Math.max(0, Math.round(((ui.draft.kg ?? 0) + d * inc) * 100) / 100); return render(); }
    case 'reps': { const it = c.items[ui.draft.i]; const step = EX[it.id].type === 'time' ? 5 : 1; ui.draft.reps = Math.max(1, ui.draft.reps + d * step); return render(); }
    case 'log': return logSet(el.dataset.eff);
    case 'edit-set': ui.editSet = { i, s: +el.dataset.s }; ui.draft = null; return render();
    case 'edit-cancel': ui.editSet = null; ui.draft = null; return render();
    case 'eff': return toggleEff(i, +el.dataset.s, el.dataset.eff);
    case 'info': { const id = el.dataset.id; ui.info = { ...(ui.info || {}), [id]: !infoOpen(id) }; if (ui.info[id]) ui.infoAnim = id; return render(); }
    case 'add-set': c.items[i].planSets++; ui.draft = null; return rerender();
    case 'skip': c.items[i].skipped = !c.items[i].skipped; ui.draft = null; {
      const { groups } = curGroup(c); const g = groups[c.cur];
      if (c.items[i].skipped && g.items.every(x => isDone(x) || x.skipped)) { const n = groups.findIndex((gr, gi) => gi > c.cur && !gr.items.every(x => isDone(x) || x.skipped)); if (n >= 0) { sync(); return go(n); } }
    } return rerender();
    case 'cardio-done': { const it = c.items[i]; it.sets = it.sets.length ? [] : [{ kg: 0, reps: it.minutes, eff: 'giusto', t: Date.now() }]; if (it.sets.length) ui.flashEx = i; return rerender(); }
    case 'inc': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), inc: +el.dataset.v }; return rerender();
    case 'rest+': state.rest.end += 15000; save(); return tickTimer();
    case 'rest-skip': state.rest = null; save(); return tickTimer();
    case 'freq': state.settings.freq = +el.dataset.v; replan(); return rerender();
    case 'pday': { const v = +el.dataset.v; const d = state.settings.days; state.settings.days = d.includes(v) ? d.filter(x => x !== v) : [...d, v].sort(); replan(); ui.stripX = null; return rerender(); }
    case 'prio': state.settings.priority[el.dataset.m] = el.dataset.v; replan(); return rerender();
    case 'xp': {   // spento → alta → media → bassa → spento
      if (Date.now() - (ui.longAt || 0) < 800) return;      // era una pressione lunga: si è aperta la scheda
      const id = el.dataset.id; const m = EX[id].muscle; const p = state.settings.plan[m] = state.settings.plan[m] || {};
      const next = { 0: 3, 3: 2, 2: 1, 1: 0 }[p[id] || 0];
      if (next) p[id] = next; else delete p[id];
      replan(); return rerender();
    }
    case 'sound': state.settings.sound = el.dataset.v === 'off' ? false : el.dataset.v === 'loud' ? 'loud' : true; unlockAudio(); return rerender();
    case 'sound-test': unlockAudio(); chime(); return;
    case 'dur': state.settings.sessionMinutes = +el.dataset.v; replan(); return rerender();
    case 'plate': { const v = +el.dataset.v; const p = state.settings.plates; state.settings.plates = p.includes(v) ? p.filter(x => x !== v) : [...p, v]; return rerender(); }
    case 'ex-plates': { const id = el.dataset.id; const x = state.settings.ex[id] || {}; state.settings.ex[id] = { ...x, plates: !E.exSettings(state, id).plates }; return rerender(); }
    case 'export': state.meta.exported = today(); save(); download(`sala-pesi-${today()}.json`, JSON.stringify(state), 'application/json'); return render();
    case 'del': ui.confirmDel = +el.dataset.id; return render();
    case 'del-no': ui.confirmDel = null; return render();
    case 'del-yes': {
      const id = +el.dataset.id; const s0 = state.sessions.find(s => s.id === id);
      if (!s0 || !E.deleteSession(state, id)) { ui.confirmDel = null; return render(); }
      // eliminata la giornata aperta: si torna a oggi; oggi si ricompone solo se non c'è niente di segnato
      if (state.current && state.current.date === s0.date && s0.date !== today()) leavePast();
      if (state.current && (state.current.date === s0.date || !hasLogs(state.current))) state.current = null;
      if (state.stash && !hasLogs(state.stash)) state.stash = null;
      state.rest = null;
      state.cycleBanner = null; ui.confirmDel = null;
      save(); toast('Allenamento eliminato'); return render();
    }
    case 'reset':
      if (!ui.confirmReset) { ui.confirmReset = true; return render(); }
      snapshot(JSON.stringify(state), 'prima di cancellare tutto');
      state = E.initialState(); state.meta = {}; ui.confirmReset = false; ui.day = null; save(); toast('Dati cancellati (ne resta una copia qui sotto)'); return render();
  }
});

document.addEventListener('change', ev => {
  const el = ev.target; const k = el.dataset.in; if (!k) return;
  const num = () => parseFloat(String(el.value).replace(',', '.'));
  const c = state.current;
  switch (k) {
    case 'ov-add': if (el.value) {
      c.items.push(newItem(el.value)); c.minutes = E.itemMinutes(c.items);
      if (hasLogs(c) || c.free || c.date !== today()) return go(E.groupItems(c.items).length - 1);   // durante l'allenamento si apre subito
    } break;
    case 'past-add': if (el.value) { openPast(el.dataset.k, el.value); save(); return go(E.groupItems(state.current.items).length - 1); } break;
    case 'free-add': if (el.value) {
      state.current = { date: today(), items: [newItem(el.value)], reason: '', free: true, forced: true, deload: false, seed: null, cur: 0, view: 'list', minutes: 0 };
      state.current.minutes = E.itemMinutes(state.current.items);
      return go(0);
    } break;
    case 'draft-kg': return; // gestito dall'evento input, senza ridisegnare (non perde il tocco sui bottoni)
    case 'note': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), note: el.value.trim() }; save(); return;
    case 'weight': case 'cp-weight': { const v = num(); if (!(v > 30 && v < 300)) return; const w = state.body.weights.filter(x => x.date !== today()); w.push({ date: today(), kg: v }); w.sort((a, b) => a.date.localeCompare(b.date)); state.body.weights = w; E.nutritionCheck(state); toast('Peso salvato'); break; }
    case 'waist': case 'cp-waist': { const v = num(); if (!(v > 40 && v < 200)) return; const w = state.body.waist.filter(x => x.date !== today()); w.push({ date: today(), cm: v }); state.body.waist = w; toast('Vita salvata'); break; }
    case 'ex-inc': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), inc: +el.value }; break;
    case 'ex-base': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), base: num() || 0 }; break;
    case 'import': {
      const f = el.files[0]; if (!f) return;
      f.text().then(t => {
        try {
          const data = JSON.parse(t);
          if (!data || !Array.isArray(data.sessions) || !data.settings) throw new Error('formato');
          snapshot(JSON.stringify(state), 'prima di caricare una copia');
          state = E.migrate(data); state.meta = state.meta || {}; ui.day = null; save(); toast('Copia caricata'); render();
        } catch { toast('File non valido'); }
      });
      return;
    }
  }
  save(); render();
});

document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.dataset.in === 'draft-kg' && ui.draft) {
    const v = parseFloat(String(el.value).replace(',', '.'));
    ui.draft.kg = !isNaN(v) && v >= 0 ? v : null;
  }
});

// Pressione lunga su un esercizio in Piano: scheda con immagine e istruzioni
let press = null;
document.addEventListener('touchstart', ev => {
  const b = ev.target.closest?.('[data-act=xp]'); if (!b || ev.touches.length !== 1) return;
  const t = ev.touches[0];
  press = { x: t.clientX, y: t.clientY, timer: setTimeout(() => { ui.longAt = Date.now(); ui.sheet = b.dataset.id; renderSheet(); press = null; }, 450) };
}, { passive: true });
document.addEventListener('touchmove', ev => {
  if (!press) return; const t = ev.touches[0];
  if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; }
}, { passive: true });
document.addEventListener('touchend', () => { unlockAudio(); if (press) { clearTimeout(press.timer); press = null; } }, { passive: true });
document.addEventListener('contextmenu', ev => {
  const b = ev.target.closest?.('[data-act=xp]'); if (!b) return;
  ev.preventDefault(); ui.longAt = Date.now(); ui.sheet = b.dataset.id; renderSheet();
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && ui.sheet) closeSheet(); });

// Scorrimento orizzontale tra un esercizio e l'altro
let touch = null;
document.addEventListener('touchstart', ev => {
  const c = state.current;
  touch = ui.tab === 'oggi' && c?.view === 'ex' && !ev.target.closest?.('input,select,.flip') && ev.touches.length === 1
    ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() } : null;
}, { passive: true });
document.addEventListener('touchend', ev => {
  if (!touch) return; const t = ev.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y, fast = Date.now() - touch.t < 600; touch = null;
  if (!fast || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
  const c = state.current; const n = E.groupItems(c.items).length;
  if (dx < 0 && c.cur < n - 1) go(c.cur + 1); else if (dx > 0 && c.cur > 0) go(c.cur - 1); else if (dx > 0 && c.cur === 0) showList();
}, { passive: true });

// ---------- Avvio ----------
{
  const c = state.current;
  if (c && c.start && !c.view) c.view = 'ex';                       // dati della versione precedente
  if (c && hasLogs(c)) E.recordDay(state, c);                       // tutto ciò che è segnato è salvato
  if (c && c.date !== today()) { state.current = state.stash?.date === today() ? state.stash : null; state.stash = null; state.rest = null; }
  delete state.lastSummary;
  // copia automatica del giorno (dei dati come erano all'apertura)
  const t = today();
  if (rawAtStart && state.sessions.length && !snapList().some(x => x.why === 'automatica' && E.dayKey(new Date(x.at)) === t)) snapshot(rawAtStart, 'automatica');
  save();
}
if (state.current?.view === 'ex') keepAwake(true);
render();
// Aggiorna la vista al cambio di giorno o al ritorno nell'app
let lastDay = today();
setInterval(() => {
  if (today() === lastDay) return;
  lastDay = today(); ui.day = null; ui.stripX = null;
  if (state.current && state.current.date !== today()) { state.current = null; state.stash = null; state.rest = null; save(); }
  render();
}, 60000);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Nuova versione: si aggiorna alla prossima apertura'); });
    });
  }).catch(() => {});
}
