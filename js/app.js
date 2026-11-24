import { EX, EXERCISES, MUSCLES, MUSCLE_ORDER, TYPE_RULES, EQUIP_GROUPS, imgs } from './catalog.js';
import * as E from './engine.js';
import * as G from './sync.js';

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
// in cima alla pagina, ma solo al prossimo disegno: prima si copia la schermata vecchia per la transizione
const toTop = () => { ui.toTop = true; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.current?.view === 'ex') keepAwake(true); tickTimer(); ghBackup({ every: document.hidden ? 3 : 10 }); });

// ---------- Timer di recupero ----------
function startRest(sec, label) {
  if (state.current && state.current.date !== today()) return;     // giornata passata: niente recupero
  state.rest = { end: Date.now() + sec * 1000, total: sec, label, rings: 0 };
  save(); tickTimer();
}
// Il timer sparisce scendendo e sfumando (non di colpo)
function hideTimer(el) {
  if (el.hidden || el.classList.contains('out')) return;
  if (reduced()) { el.hidden = true; el.dataset.h = ''; return; }
  el.classList.add('out');
  setTimeout(() => { if (!el.classList.contains('out')) return; el.classList.remove('out'); el.hidden = true; el.dataset.h = ''; }, 200);
}
function tickTimer() {
  const el = $('#timer'); const r = state.rest;
  document.body.classList.toggle('has-timer', !!r);
  if (!r) { hideTimer(el); return; }
  const ms = r.end - Date.now(), left = Math.ceil(ms / 1000);
  if (left <= -20) { state.rest = null; save(); hideTimer(el); document.body.classList.remove('has-timer'); return; }
  if (el.classList.contains('out')) { el.classList.remove('out'); el.hidden = true; }
  el.hidden = false;
  el.classList.toggle('end', left <= 0);
  const t = Math.max(0, left);
  // la struttura si ridisegna solo quando cambia; il numero e la barra si aggiornano al loro posto
  const html = left > 0
    ? `<span class="t"></span><span class="l">Recupero<br>${esc(r.label)}</span><button data-act="rest+">+15 s</button><button data-act="rest-skip">Salta</button>${r.total ? '<i class="tb"><b></b></i>' : ''}`
    : `<span class="t">Vai!</span><span class="l">Recupero finito</span><button data-act="rest-skip">OK</button>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  if (left > 0) {
    el.querySelector('.t').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const b = el.querySelector('.tb b'); if (b) b.style.transform = `scaleX(${Math.max(0, Math.min(1, ms / (r.total * 1000)))})`;
  }
  // la sveglia suona alla fine e si ripete due volte (ogni 4 s) finché non tocchi OK
  const rings = left > 0 ? 0 : Math.min(3, 1 + Math.floor(-left / 4));
  if ((r.rings || 0) < rings) { r.rings = rings; save(); chime(); }
}
setInterval(tickTimer, 250);

// ---------- Notifica con Annulla ----------
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.classList.remove('out');
  if (!el.hidden && !reduced()) el.animate?.([{ transform: 'scale(.97)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.34,1.45,.64,1)' });
  el.innerHTML = `<span>${esc(msg)}</span>`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (reduced()) { el.hidden = true; return; }
    el.classList.add('out');
    toastTimer = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 200);
  }, 2500);
}

// ---------- Helper di visualizzazione ----------
const repsLabel = (id, r) => EX[id].type === 'time' ? `${r} s` : `${r}`;
const rangeLabel = id => { const r = TYPE_RULES[EX[id].type]; return `${r.min}–${r.max}${r.unit ? ' s' : ''}`; };
// Carico come si legge sull'attrezzo: in libbre per le macchine col pacco in libbre
const isLb = id => E.exSettings(state, id).lb;
const load = (id, k) => isLb(id) ? `${E.kgToLb(k)} lb` : `${kg(k)} kg`;
const loadLabel = (id, k) => ['time', 'bw'].includes(EX[id].type) ? 'corpo libero' : k == null ? 'carico da provare' : load(id, k);
// Testo di una serie: "55 kg × 10", "12 ripetizioni" (corpo libero) o "40 s" (a tempo)
const setTxt = (id, x) => EX[id].type === 'time' ? `${x.reps} s` : EX[id].type === 'bw' ? `${x.reps} ripetizioni` : `${load(id, x.kg)} × ${x.reps}`;
const EFFS = [['facile', 'Facile', '4+ in riserva', 'lv1'], ['giusto', 'Giusto', '1–3 in riserva', 'lv2'], ['limite', 'Al limite', '0 in riserva', 'lv3']];
// Muscoli coinvolti, coi tre colori: arancio principale, giallo secondario, verde aiuta
function musclesHtml(e) {
  const prim = Object.entries(e.work || {}).filter(([, w]) => w >= 1).map(([m]) => MUSCLES[m].name);
  const sec = Object.entries(e.work || {}).filter(([, w]) => w < 1).map(([m]) => MUSCLES[m].name.toLowerCase());
  return `<div class="muscles">${prim.map(x => `<span class="lv3">${esc(x)}</span>`).join('')}${sec.map(x => `<span class="lv2">${esc(x)}</span>`).join('')}${(e.also || []).map(x => `<span class="lv1">${esc(x)}</span>`).join('')}</div>`;
}
const howHtml = e => ['Posizione', 'Movimento', 'Ritorno', 'Attenzione'].map((t, k) => e.how?.[k] ? `<div><b>${t}</b>${esc(e.how[k])}</div>` : '').join('');
const flipHtml = id => EX[id]?.unknown ? '' : `<div class="flip" data-id="${esc(id)}"><img src="${imgs(id)[0]}" alt="Posizione iniziale"><img class="b" src="${imgs(id)[1]}" alt="Posizione finale"></div>`;
const exName = it => EX[it.id]?.name || it.name || it.id;
const visible = e => !e.hidden;
const musclesLine = id => Object.entries(EX[id].work).map(([m, w]) => w >= 1 ? MUSCLES[m].name : `${MUSCLES[m].name.toLowerCase()} (in parte)`).join(' · ');

// Calendario: 15 giorni indietro e 15 avanti, scorrevole; un tocco su un giorno lo apre
// Intestazione di Oggi: la data per esteso (l'unico posto dove compare), sopra quanto dista da oggi
function dayHead(day, t) {
  const n = E.diffDays(day, t), d = E.parseDay(day);
  const rel = n === 0 ? 'Oggi' : n === 1 ? 'Domani' : n === -1 ? 'Ieri' : n > 0 ? `Tra ${n} giorni` : `${-n} giorni fa`;
  const wd = E.DAY_NAMES[d.getDay()];
  const year = d.getFullYear() !== E.parseDay(t).getFullYear() ? ` ${d.getFullYear()}` : '';
  return `<div class="dayhead"><div class="row between"><span class="rel">${rel}</span>${n ? `<button class="link" data-act="day" data-k="${t}">Torna a oggi</button>` : ''}</div>
    <h1>${wd[0].toUpperCase()}${wd.slice(1)} ${d.getDate()}/${d.getMonth() + 1}${year ? `/${d.getFullYear()}` : ''}</h1></div>`;
}
function calendarCard() {
  const t = today(), sel = ui.day || t;
  const days = E.strip(state, t, -15, 15);
  return `<section class="card cal">
    <div class="strip" id="strip">${days.map(x => {
      const st = x.frac != null ? lvOf(x.frac) : x.extra ? 'extra' : '';
      return `<button class="day ${st} ${x.rec ? 'rec' : ''} ${x.today ? 'today' : ''} ${x.key === sel ? `sel ${ui.selAnim ? 'sel-in' : ''}` : ''}" data-act="day" data-k="${x.key}" data-m="${x.month}" data-y="${x.year}" aria-label="${dayLabel(x.key)}">${x.label}<i>${x.num}</i></button>`;
    }).join('')}</div>
  </section>`;
}
// dopo ogni disegno: il calendario resta dov'era (la prima volta, centrato sul giorno scelto);
// quando si cambia giorno con lo scorrimento o "Torna a oggi" scivola fino a centrare il giorno nuovo
function placeStrip() {
  ui.selAnim = false;
  const st = document.getElementById('strip'); if (!st) return;
  const el = st.querySelector('.sel') || st.querySelector('.today');
  const target = el ? el.offsetLeft - (st.clientWidth - el.offsetWidth) / 2 : 0;
  if (ui.stripX == null) st.scrollLeft = target;
  else {
    st.scrollLeft = ui.stripX;
    if (ui.stripCenter) { if (reduced()) st.scrollLeft = target; else st.scrollTo({ left: target, behavior: 'smooth' }); }
  }
  ui.stripCenter = false;
  st.addEventListener('scroll', () => { ui.stripX = st.scrollLeft; }, { passive: true });
}

function spark(values, h = 48) {
  if (values.length < 2) return '';
  const w = 300, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [i / (values.length - 1) * (w - 8) + 4, h - 6 - (v - min) / span * (h - 12)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const l = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}"/><circle cx="${l[0]}" cy="${l[1]}" r="4"/></svg>`;
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
const fromSession = (s, date) => ({ date, reason: 'Allenamento di oggi', deload: s.deload, seed: s.seed, free: !!s.free, forced: true, cur: 0, view: 'list', duration: s.duration, want: s.want,
  items: s.items.map(i => {
    if (i.id === 'cardio') return { id: 'cardio', minutes: i.minutes, planSets: 0, ss: null, skipped: !!i.skipped, sets: [...i.sets] };
    const x = newItem(i.id); const l = i.sets[i.sets.length - 1];
    return { ...x, ss: i.ss, planSets: i.planSets, skipped: i.skipped, minutes: i.minutes, sets: [...i.sets], kg: l ? l.kg : x.kg };
  }) });

function ensureCurrent() {
  const c = state.current, t = today();
  if (c && c.date === t) return;
  const s = todaySession();
  state.current = s ? fromSession(s, t) : E.compose(state, t, Date.now(), ui.dur?.date === t ? ui.dur.min : null);
  state.current.minutes = E.planMinutes(state, state.current);
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
  state.current.minutes = E.planMinutes(state, state.current);
}
function setDay(k) {
  const t = today();
  if (state.current && state.current.date !== t && state.current.date !== k) leavePast();
  ui.day = k === t ? null : k;
  ui.selAnim = true;
  save(); render();
}

// Salva la giornata a ogni modifica (niente "Termina" da ricordarsi)
function sync() {
  const c = state.current; if (!c) return;
  if (!hasLogs(c) && !state.sessions.some(s => s.date === c.date)) return;
  const r = E.recordDay(state, c);
  if (r?.newCycle) state.cycleBanner = `Inizia il ciclo ${state.cycle.n}`;
  setTimeout(() => ghBackup(), 0);
}

function viewOggi() {
  const t = today(), day = ui.day && ui.day !== t ? ui.day : t;
  const c = state.current?.date === day ? state.current : null;
  if (c?.view === 'ex' && c.items.length) return viewSession();
  let head = '';
  if (state.notice) head += `<section class="alert small">${esc(state.notice)} <button class="ghost" data-act="notice-ok">OK</button></section>`;
  head += dayHead(day, t);
  head += calendarCard();
  // il contenuto del giorno sta in un blocco a parte: è quello che segue il dito quando si scorre tra i giorni
  return `${head}<div class="daybody">${dayBody(t, day, c)}</div>`;
}
function dayBody(t, day, c) {
  let html = '';
  if (day < t) return pastDay(day, c);
  if (day > t) return futureDay(day);

  if (E.checkpointDue(state)) {
    html += `<section class="alert"><b>Punto di controllo del ciclo</b><p class="small">Peso di stamattina e circonferenza vita all’altezza dell’ombelico.</p>
      <div class="row" style="margin-top:8px"><input type="text" inputmode="decimal" placeholder="Peso kg" data-in="cp-weight"><input type="text" inputmode="decimal" placeholder="Vita cm" data-in="cp-waist"></div></section>`;
  }
  if (state.cycleBanner) html += `<section class="alert"><b>${esc(state.cycleBanner)}</b><p class="small">Se vuoi, in Piano puoi cambiare gli esercizi àncora con una variante.</p><button class="ghost" data-act="cycle-ok">OK</button></section>`;

  const rec = E.recommendedDays(state, t);
  const show = (c && (c.forced || hasLogs(c))) || (rec[0] === t && state.skipDay !== t) || todaySession();
  if (!show) {
    const nx = E.nextLabel(state, t);
    html += `<section class="card"><h3>Oggi riposo</h3>
      <p class="muted">${nx && nx !== 'oggi' ? `Prossimo allenamento ${esc(nx)}. ` : ''}Il recupero fa crescere il muscolo quanto l’allenamento.</p>
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
  return `<section class="card" data-lp="ses" data-id="${s.id}">
    <h3 class="${title === 'Fatto!' ? 't-ok' : ''}">${title}${s.deload ? ' · scarico' : ''}</h3>
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
  return `<section class="card"><h3 class="t-bad">Allenamento previsto${f.deload ? ' · scarico' : ''}</h3>
    <p class="reason">${esc(f.reason)}</p>
    <div class="summary"><span><b>${f.minutes}</b> min</span><span><b>${work.length}</b> esercizi</span><span><b>${work.reduce((a, i) => a + i.planSets, 0)}</b> serie</span></div>
    ${f.items.map(it => it.id === 'cardio'
      ? `<div class="hist-row"><b><span class="cardio-ico">🚴</span>Cardio extra</b><span class="small muted">${it.minutes} min</span></div>`
      : `<div class="hist-row"><b>${esc(EX[it.id].name)}</b><span class="small muted">${it.planSets} × ${rangeLabel(it.id)} · ${loadLabel(it.id, it.kg)}</span></div>`).join('')}
    <p class="small muted" style="margin-top:10px">È una previsione: l’app la ricalcola in base a quello che farai prima.</p></section>`;
}

// ---------- Copia su GitHub ----------
// Automatica dopo le modifiche (al massimo ogni 10 minuti, ogni 3 quando si esce dall'app) e "Salva ora".
// Per sicurezza non sovrascrive mai in automatico una copia con molti più allenamenti di quelli sul telefono.
let ghBusy = false, ghTimer = null;
const sessionsIn = t => { try { return (JSON.parse(t).sessions || []).length; } catch { return 0; } };
function loadData(text, why) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.sessions) || !data.settings) throw new Error('formato');
  snapshot(JSON.stringify(state), why);
  state = E.migrate(data); state.meta = state.meta || {}; ui.day = null; save();
}
async function ghBackup({ force = false, every = 10 } = {}) {
  const c = G.ghConf(); if (!c || ghBusy) return;
  const raw = localStorage.getItem(KEY); if (!raw) return;
  const h = G.hash(raw), n = sessionsIn(raw);
  if (!force && h === c.hash) return;
  if (!force && c.n && n < c.n / 2) { G.ghStore({ ...c, err: 'sul telefono ci sono molti meno allenamenti che su GitHub: non sovrascrivo da solo' }); return; }
  const wait = every * 60000 - (Date.now() - (c.at || 0));
  if (!force && wait > 0) { clearTimeout(ghTimer); ghTimer = setTimeout(() => ghBackup(), Math.min(wait, 10 * 60000) + 1000); return; }
  ghBusy = true; clearTimeout(ghTimer);
  const d = new Date(), msg = `Copia dall'app · ${d.getDate()}/${d.getMonth() + 1} ${E.pad(d.getHours())}:${E.pad(d.getMinutes())} · ${n} ${n === 1 ? "allenamento" : "allenamenti"}`;
  try {
    let sha;
    try { sha = await G.ghWrite(c, raw, c.sha, msg); }
    catch (e) {
      if (![409, 422].includes(e.status)) throw e;
      // la copia su GitHub è cambiata da un'altra parte: si rilegge prima di sostituirla
      const remote = await G.ghRead(c);
      if (!force && remote && sessionsIn(remote.text) > n) throw new Error('su GitHub ci sono più allenamenti che sul telefono: usa "Riprendi da GitHub" o "Salva ora"');
      sha = await G.ghWrite(c, raw, remote?.sha, msg);
    }
    G.ghStore({ ...c, sha, hash: h, n, at: Date.now(), err: null });
    if (force) toast('Copia salvata su GitHub');
  } catch (e) {
    G.ghStore({ ...c, err: e.message });
    if (force) toast(`Copia non riuscita: ${e.message}`);
  } finally { ghBusy = false; if (ui.tab === 'impostazioni') render(); }
}
async function ghConnect(token) {
  const c = { ...G.DEFAULTS, token };
  ui.ghMsg = 'Collegamento in corso…'; render();
  try {
    const remote = await G.ghRead(c);
    if (remote && sessionsIn(remote.text) > state.sessions.length) {
      // telefono nuovo o dati persi: si riprendono quelli su GitHub (quelli di prima restano tra le copie)
      loadData(remote.text, 'prima di riprendere i dati da GitHub');
      toast('Allenamenti ripresi da GitHub');
    }
    G.ghStore({ ...c, sha: remote?.sha || null });
    ui.ghMsg = null;
    await ghBackup({ force: true });
    const now = G.ghConf();
    if (now?.err) { G.ghStore(null); ui.ghMsg = `Non collegato: ${now.err}`; }
  } catch (e) { G.ghStore(null); ui.ghMsg = `Non collegato: ${e.message}`; }
  render();
}
async function ghRestore() {
  const c = G.ghConf(); if (!c) return;
  try {
    const remote = await G.ghRead(c);
    if (!remote) { toast('Su GitHub non c’è ancora una copia'); return; }
    loadData(remote.text, 'prima di riprendere i dati da GitHub');
    G.ghStore({ ...c, sha: remote.sha, hash: G.hash(localStorage.getItem(KEY)), n: state.sessions.length, err: null });
    toast('Allenamenti ripresi da GitHub');
  } catch (e) { toast(e.message === 'formato' ? 'La copia su GitHub non è leggibile' : `Non riuscito: ${e.message}`); }
  render();
}
function ghHtml() {
  const c = G.ghConf();
  if (!c) return `<div class="ghbox"><b>Copia automatica su GitHub</b>
    <p class="small muted">Dopo ogni allenamento l’app salva i dati nel repository sala-pesi (ramo “dati”). La chiave resta solo su questo telefono.</p>
    <a class="link" href="${G.TOKEN_URL}" target="_blank" rel="noopener">1. Crea la chiave su GitHub ↗</a>
    <div class="row"><input type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="2. Incolla qui la chiave" data-in="gh-token"><button data-act="gh-connect">Collega</button></div>
    ${ui.ghMsg ? `<p class="small" style="color:var(--warn)">${esc(ui.ghMsg)}</p>` : ''}</div>`;
  const at = c.at ? new Date(c.at) : null;
  return `<div class="ghbox"><div class="row between"><b>Copia su GitHub</b><span class="small" style="color:var(${c.err ? '--warn' : '--ok'})">${c.err ? 'da controllare' : 'attiva'}</span></div>
    <p class="small muted">Ultima copia: <b>${at ? `${dayLabel(E.dayKey(at))} ${E.pad(at.getHours())}:${E.pad(at.getMinutes())}` : 'mai'}</b>${c.n != null ? ` · ${c.n} ${c.n === 1 ? 'allenamento' : 'allenamenti'}` : ''}</p>
    ${c.err ? `<p class="small" style="color:var(--warn)">${esc(c.err)}</p>` : ''}
    <div class="row"><button class="grow" data-act="gh-now">Salva ora</button><button class="grow" data-act="gh-restore">${ui.confirmGh ? 'Conferma' : 'Riprendi da GitHub'}</button></div>
    <button class="ghost" style="align-self:flex-start" data-act="gh-off">${ui.confirmGhOff ? 'Tocca di nuovo per scollegare' : 'Scollega'}</button></div>`;
}

// Promemoria discreto: una copia dei dati fuori dal telefono ogni mese circa
function backupReminder() {
  const m = state.meta, t = today();
  if (state.sessions.filter(E.counts).length < 6) return '';
  const gh = G.ghConf(); if (gh?.at && !gh.err && Date.now() - gh.at < 30 * 864e5) return '';
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
  const html = `<section class="card done-card ${complete ? 'complete' : ''} ${ui.flashDone ? 'pop' : ''}" data-lp="ses" data-id="${s.id}">
    ${complete && ui.flashDone && !reduced() ? burstHtml() : ''}
    <div class="big-num ${complete ? 't-ok' : ''}">${complete ? 'Fatto!' : 'Fatto in parte'}</div>
    ${complete ? '' : `<p class="muted">${doneN} di ${work.length} esercizi</p><div class="bar ${lvOf(work.length ? doneN / work.length : 0)}"><i style="width:${work.length ? Math.max(4, doneN / work.length * 100) : 0}%"></i></div>`}
    <div class="summary"><span><b>${s.minutes}</b> min</span><span><b>${s.kcal[0]}–${s.kcal[1]}</b> kcal</span><span><b>${nSets}</b> serie</span></div>
    ${s.records?.length ? `<p><b>Record battuti</b></p>${s.records.map(r => `<p>${esc(EX[r.id].name)} · ${kg(Math.round(r.e1rm))} kg stimati</p>`).join('')}` : ''}
  </section>`;
  ui.flashDone = false;
  return html;
}

// Coriandoli nei tre colori dell'app, una volta sola quando la seduta è finita
function burstHtml() {
  const n = 22;
  return `<div class="burst" aria-hidden="true">${Array.from({ length: n }, (_, k) => {
    const a = Math.round(k / n * 360 + Math.random() * 14), d = Math.round(70 + Math.random() * 70), r = Math.round(Math.random() * 540 - 270);
    return `<i style="--a:${a}deg;--d:${d}px;--r:${r}deg;--c:var(--l${k % 3 + 1});--w:${(Math.random() * 0.08).toFixed(2)}s"></i>`;
  }).join('')}</div>`;
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
        inner += `<div class="ex-row ${st} ${pop}" data-lp="ex" data-i="${idx}"><div data-act="open" data-g="${gi}"><div class="name"><span class="cardio-ico">🚴</span>Cardio extra${n ? ' <span class="check">✓</span>' : ''}</div><div class="meta">${it.minutes} min · ellittica o tapis roulant in salita</div></div><div></div></div>`;
        return;
      }
      const e = EX[it.id];
      const best = n ? logged(it).reduce((b, x) => (x.kg > b.kg || (x.kg === b.kg && x.reps > b.reps)) ? x : b) : null;
      // serie previste: − 3 + direttamente nella riga (prima erano su una riga a parte)
      const pill = `<span class="setpill" data-act="none"><button data-act="ov-sets" data-i="${idx}" data-d="-1" aria-label="Una serie in meno" ${it.planSets <= Math.max(1, n) ? 'disabled' : ''}>−</button><b>${it.planSets}</b><button data-act="ov-sets" data-i="${idx}" data-d="1" aria-label="Una serie in più">+</button></span>`;
      const meta = done ? `${n} serie · ${setTxt(it.id, best)}`
        : n ? `${pill}<span>serie · ${n} ${n === 1 ? 'fatta' : 'fatte'}</span>` : it.skipped ? 'saltato' : `${pill}<span>× ${rangeLabel(it.id)} · ${loadLabel(it.id, it.kg)}</span>`;
      inner += `<div class="ex-row ${st} ${pop}" data-lp="ex" data-i="${idx}">
        <div data-act="open" data-g="${gi}"><div class="name">${esc(e.name)}${done ? ' <span class="check">✓</span>' : ''}</div>
          <div class="meta">${meta}</div>
          ${!n && it.note ? `<div class="tip ${/−|ridotto|Fermo|pausa/.test(it.note) ? 'down' : ''}">${esc(it.note)}</div>` : ''}</div>
        ${done ? '<div></div>' : `<div class="updown"><button class="icon" data-act="ov-move" data-i="${idx}" data-d="-1" aria-label="Sposta su" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon" data-act="ov-move" data-i="${idx}" data-d="1" aria-label="Sposta giù" ${idx === c.items.length - 1 ? 'disabled' : ''}>↓</button></div>`}
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
  const dur = c.duration || E.usualMinutes(state);
  return `<section class="card" data-lp="plan">
    ${isToday ? '' : `<div class="row between" style="margin-bottom:6px"><span class="small muted">Stai modificando un giorno passato</span><button class="ghost" data-act="past-close">Fine</button></div>`}
    <h3 class="t-warn">${!isToday ? `Allenamento di ${dayLabel(c.date).toLowerCase()}` : c.free ? 'Esercizi di oggi' : 'Seduta di oggi'}${c.deload ? ' · scarico' : ''}</h3>
    ${c.free || !isToday ? '' : `<p class="reason">${esc(c.reason)}</p>`}
    ${logs || !isToday ? '' : `${c.free ? '' : `<div class="row between durrow"><span class="small muted">Tempo oggi</span><span class="seg">${E.DURATIONS.map(v => `<button class="${dur === v ? 'on' : ''}" data-act="today-dur" data-v="${v}">${v}′</button>`).join('')}</span></div>`}
    <div class="summary"><span><b>${c.minutes}</b> min</span><span><b>${work.length}</b> esercizi</span><span><b>${all}</b> serie</span><span><b>${kc[0]}–${kc[1]}</b> kcal</span></div>
    <p class="small muted">Prima ${E.warmMin(dur)} min di cardio leggero.</p>`}
    ${nextG >= 0 ? `<button class="primary big go" data-act="open" data-g="${nextG}">${logs ? `Continua · ${esc(nextName)}` : 'Inizia'}</button>` : ''}
    <div class="rows">${rows}</div>
    <select data-in="ov-add" style="margin-top:12px">${addOptions('+ Aggiungi esercizio')}</select>
  </section>
  ${!isToday ? '' : c.free ? `<div class="row" style="justify-content:center;margin-top:6px"><button class="ghost" data-act="full">Aggiungi la seduta completa di oggi</button></div>`
    : logs ? (nextG >= 0 ? frettaBtn() : '') : `<div class="row" style="justify-content:center;margin-top:6px"><button class="ghost" data-act="recompose">Ricomponi la seduta</button></div>`}`;
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
  const k = it.adjKg ?? (prev ? prev.kg : it.kg);
  return { kg: k != null && isLb(it.id) ? E.snapLoad(state, it.id, k) : k, reps: it.reps };
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
    // l'esercizio appena finito si colora subito di verde (con il bordo di "sei qui")
    const cls = `${done ? 'done' : part ? 'part' : skip ? 'skip' : ''} ${gi === c.cur ? 'cur' : ''}`;
    return `<span class="${cls} ${ui.flashSeg === gi ? 'pop' : ''}" data-act="goto" data-g="${gi}"></span>`;
  }).join('');
  ui.flashSeg = null;
  let html = `<div class="topbar"><div class="row between" style="margin-bottom:8px"><button class="ghost back" data-act="list">‹ Elenco</button>
    <span class="muted small">esercizio ${c.cur + 1} di ${groups.length} · ${doneG} fatti</span></div><div class="progress">${segs}</div></div>
    <div class="exbody">`;

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
      <div class="row between" style="align-items:flex-start"><h3>${esc(e.name)}${isDone(it) ? ` <span class="check ${ui.flashCheck === idx ? 'pop' : ''}">✓</span>` : ''}</h3><span class="muted small" style="white-space:nowrap;margin-top:4px">${it.planSets} × ${rangeLabel(it.id)}</span></div>
      ${musclesHtml(e)}
      ${flipHtml(it.id)}
      <button class="info-btn" data-act="info" data-id="${it.id}" aria-expanded="${open}">${INFO_ICON}${open ? 'Nascondi istruzioni' : `Come si fa${st.note ? ' e nota' : ''}`}</button>
      ${open ? `<div class="how ${ui.infoAnim === it.id ? 'open' : ''}">${howHtml(e)}
        <div class="note"><b>Nota personale</b><input type="text" placeholder="es. sedile al 4" value="${esc(st.note)}" data-in="note" data-id="${it.id}"></div></div>` : ''}
      ${(() => { const sw = swapButtons(c, g, it, idx, usedIds); return sw ? `<div class="ctrls">${sw}</div>` : ''; })()}`;
    if (!st.incSet && !noKg(it.id)) {
      html += `<div style="margin-top:10px"><p class="small"><b>Di quanto sale il carico su questo attrezzo?</b> Lo chiedo una volta sola.</p>
        <div class="chips" style="margin-top:6px">${[1, 1.25, 2, 2.5, 5].map(v => `<button class="${v === st.inc ? 'on' : ''}" data-act="inc" data-id="${it.id}" data-v="${v}">${kg(v)} kg</button>`).join('')}${E.canLb(it.id) ? `<button data-act="inc" data-id="${it.id}" data-v="lb">pacco in libbre</button>` : ''}</div></div>`;
    }
    const wu = !logged(it).length ? E.warmups(state, it.id, it.kg) : [];
    const firstForMuscle = c.items.findIndex(x => x.id !== 'cardio' && EX[x.id]?.muscle === e.muscle && EX[x.id].type === 'multi') === idx;
    if (wu.length && firstForMuscle) html += `<p class="small" style="margin-top:10px"><b>Riscaldamento:</b> ${wu.map(w => `1×${w.reps} a ${load(it.id, w.kg)}`).join(', poi ')}</p>`;
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
            ${noKg(it.id) ? '' : `<div class="stepper"><button data-act="kg" data-d="-1" aria-label="Meno peso">−</button><b><input class="kgin ${bump('kg')}" type="text" inputmode="decimal" value="${d.kg == null ? '' : st.lb ? E.kgToLb(d.kg) : kg(d.kg)}" placeholder="?" data-in="draft-kg" aria-label="Carico in ${st.lb ? 'libbre' : 'kg'}">${E.canLb(it.id) ? `<small class="unit" data-act="unit" data-id="${it.id}">${st.lb ? `lb${d.kg ? ` · ${kg(d.kg < 9 ? Math.round(d.kg * 10) / 10 : Math.round(d.kg))} kg` : ''}` : 'kg'} ⇄</small>` : '<small>kg</small>'}</b><button data-act="kg" data-d="1" aria-label="Più peso">+</button></div>`}
            <div class="stepper"><button data-act="reps" data-d="-1" aria-label="Meno">−</button><b><span class="num ${bump('reps')}">${d.reps}</span><small>${e.type === 'time' ? 'secondi' : 'ripetizioni'}</small></b><button data-act="reps" data-d="1" aria-label="Più">+</button></div>
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
  ui.flash = null; ui.infoAnim = null; ui.swapped = null; ui.flashCheck = null;
  html += `</section>`;
  const lastG = c.cur >= groups.length - 1;
  const gDone = g.items.every(i => isDone(i) || i.skipped);
  html += `<div class="row" style="gap:8px">
    <button class="grow" data-act="goto" data-g="${Math.max(0, c.cur - 1)}" ${c.cur === 0 ? 'disabled' : ''}>← Indietro</button>
    ${lastG ? `<button class="grow primary" data-act="list">Elenco ✓</button>` : `<button class="grow primary" data-act="goto" data-g="${c.cur + 1}">${gDone ? 'Prossimo esercizio →' : 'Avanti →'}</button>`}
  </div>`;
  if (c.date === today() && !c.free && groups.some(gr => !gr.items.every(i => isDone(i) || i.skipped))) html += frettaBtn();
  ui.bump = null;
  return html + '</div>';
}

const bump = a => ui.bump?.a === a ? (ui.bump.d > 0 ? 'bump-up' : 'bump-down') : '';
const frettaBtn = () => `<div class="row" style="justify-content:center;margin-top:8px"><button class="ghost" data-act="fretta-open">Ho fretta</button></div>`;

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
    const lower = E.snapLoad(state, it.id, d.kg * 0.925);
    it.adjKg = Math.max(E.stepLoad(state, it.id, 0, 1), lower < d.kg ? lower : E.stepLoad(state, it.id, d.kg, -1));
  } else if (d.s === 0) delete it.adjKg;
  ui.editSet = null; ui.draft = null; ui.flash = { i: d.i, s: d.s };
  if (!wasDone && isDone(it)) ui.flashEx = ui.flashCheck = d.i;
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
        // dopo una superserie si resta qui: si va avanti con "Avanti"
        if (anyG >= 0 && anyG !== c.cur && g.items.length === 1) ui.advance = setTimeout(() => { if (still()) go(anyG); }, 700);
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
    return row(esc(EX[x.id].name), `<b>${load(x.id, x.to)}</b> × ${x.reps}`, `partenza ${load(x.id, x.from)}${x.now != null ? ` · ora ${load(x.id, x.now)}` : ''}`, p);
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
  ${MUSCLE_ORDER.map(m => { const t = E.targetFor(state, m); const v = Math.round(done7[m] * 2) / 2; const f = v / t;
    // fascia in cui stare: da una seduta in meno (obiettivo × (sedute − 1) / sedute) al 120%; scala fino al 150%
    // per i muscoli a priorità minima basta il pavimento (2 serie a settimana, contando le indirette)
    const lo = s.priority[m] === 'minima' ? E.FLOOR / t : (E.freqOf(state) - 1) / E.freqOf(state), sc = x => Math.min(100, x / 1.5 * 100);
    return `<div class="mrow"><span>${MUSCLES[m].name}</span><span class="small muted">${kg(v)} / ${t}</span>
      <div class="zbar ${f > 1.3 ? 'lv3' : f >= lo ? 'lv1' : 'lv2'}"><b style="left:${sc(lo)}%;width:${sc(1.2) - sc(lo)}%"></b><i style="width:${Math.max(v ? 2 : 0, sc(f))}%"></i></div></div>`; }).join('')}
  <p class="small muted" style="margin-top:8px">La fascia chiara è la zona in cui stare. Poco prima di allenarti è normale essere all’inizio della fascia.</p>
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
  html += `<h2>Massimale stimato · priorità alta</h2><section class="card">`;
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
  if (recs.length) html += `<h2>Record personali</h2><section class="card">${recs.map(([id, b]) => `<div class="mrow"><span>${esc(EX[id].name)}</span><span><b>${load(id, b.st.kg)} × ${b.st.reps}</b> <span class="muted small">${kg(Math.round(b.v))} kg stim.</span></span></div>`).join('')}</section>`;

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

  // Elenco allenamenti (pressione lunga per eliminarne uno)
  if (ss.length) html += `<h2>Allenamenti</h2><section class="card">${[...ss].reverse().map(s => {
    const n = s.items.reduce((a, i) => a + (i.id === 'cardio' ? 0 : (i.sets || []).length), 0);
    return `<div class="mrow" style="align-items:center" data-lp="ses" data-id="${s.id}"><span><b>${dayLabel(s.date)}</b>${s.deload ? ' <span class="small muted">scarico</span>' : ''}${s.free ? ' <span class="small muted">extra</span>' : s.frac < 1 ? ' <span class="small muted">parziale</span>' : ''}<br><span class="small muted">${s.minutes || '?'} min · ${n} serie${s.kcal ? ` · ${s.kcal[0]}–${s.kcal[1]} kcal` : ''}</span></span></div>`;
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
    <div><span>Durata abituale della seduta</span>
      <div class="seg" style="margin-top:8px">${E.DURATIONS.map(v => `<button class="${s.sessionMinutes === v ? 'on' : ''}" data-act="dur" data-v="${v}">${v}′</button>`).join('')}</div>
      <p class="small muted" style="margin-top:6px">Ogni giorno puoi cambiarla in Oggi, prima di iniziare.</p></div>
    <div><span>Suono a fine recupero</span>
      <div class="seg" style="margin-top:8px">${[['off', 'no'], ['on', 'sì'], ['loud', 'anche in silenzioso']].map(([v, l]) => `<button class="${soundMode() === v ? 'on' : ''}" data-act="sound" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="small muted" style="margin-top:6px">${soundMode() === 'loud' ? 'Suona anche con l’iPhone in silenzioso, ma può mettere in pausa la musica.' : soundMode() === 'on' ? 'Si sente sopra la musica, ma non con l’iPhone in silenzioso.' : 'A fine recupero il timer diventa verde, senza suono.'} Con lo schermo spento non suona.</p></div>
    ${soundMode() === 'off' ? '' : '<button class="ghost" style="align-self:flex-start" data-act="sound-test">▶︎ Prova il suono</button>'}
  </section>
  <h2>Dischi disponibili</h2><section class="card"><div class="chips">${[25, 20, 15, 10, 5, 2.5, 1.25].map(p => `<button class="${s.plates.includes(p) ? 'on' : ''}" data-act="plate" data-v="${p}">${kg(p)} kg</button>`).join('')}</div>
    <p class="small muted" style="margin-top:8px">Per gli attrezzi a dischi l’app ti dice cosa mettere per lato.</p></section>
  <h2>Attrezzi</h2><section class="card">
    <p class="small muted">Salto di carico (o “libbre” per le macchine col pacco in libbre), se si carica con i dischi e il peso a vuoto (slitta o bilanciere).</p>
    ${planIds.map(id => { const x = E.exSettings(state, id); return `<div class="exset"><span>${esc(EX[id].name)}</span>
      <select data-in="ex-inc" data-id="${id}">${[1, 1.25, 2, 2.5, 5].map(v => `<option value="${v}" ${!x.lb && v === x.inc ? 'selected' : ''}>+${kg(v)}</option>`).join('')}${E.canLb(id) ? `<option value="lb" ${x.lb ? 'selected' : ''}>libbre</option>` : ''}</select>
      <button class="${x.plates ? 'primary' : ''}" style="min-height:36px;padding:4px 10px;font-size:13px" data-act="ex-plates" data-id="${id}">dischi</button>
      ${x.plates ? `<span class="small muted" style="grid-column:1/2">peso a vuoto</span><input type="text" inputmode="decimal" value="${kg(x.base)}" data-in="ex-base" data-id="${id}">` : ''}</div>`; }).join('')}
  </section>
  <h2>Dati e backup</h2><section class="card stack">
    ${ghHtml()}
    <p class="small muted">I dati restano su questo telefono anche quando l’app si aggiorna. Se cancelli l’app o cambi iPhone servono una copia su file (per esempio su iCloud Drive). Ultima copia su file: <b>${state.meta.exported ? dayLabel(state.meta.exported) : 'mai'}</b>.</p>
    <div class="row"><button class="grow" data-act="export">Salva copia</button><label class="grow" style="display:block"><input type="file" accept="application/json,.json" data-in="import" hidden><span class="row filebtn">Carica copia</span></label></div>
    ${snapList().length ? `<p class="small muted" style="margin-top:12px">Copie automatiche su questo telefono</p>
      ${[...snapList()].reverse().map(x => { const d = new Date(x.at); return `<div class="row between snap"><span class="small">${dayLabel(E.dayKey(d))} ${E.pad(d.getHours())}:${E.pad(d.getMinutes())} · ${x.n} ${x.n === 1 ? 'allenamento' : 'allenamenti'}${x.why !== 'automatica' ? `<br><span class="muted">${esc(x.why)}</span>` : ''}</span>
        <button class="ghost" data-act="snap" data-k="${x.k}">${ui.confirmSnap === x.k ? 'Conferma' : 'Ripristina'}</button></div>`; }).join('')}` : ''}
    <button class="danger" style="margin-top:14px" data-act="reset">${ui.confirmReset ? 'Tocca di nuovo per cancellare tutto' : 'Cancella tutti i dati'}</button>
  </section>
  <p class="small muted" style="text-align:center;margin-top:16px">Sala Pesi · versione 1.11 · dati formato ${E.SCHEMA}<br>Immagini esercizi: Free Exercise DB (pubblico dominio)</p>`;
}

// ---------- Render ----------
const VIEWS = { oggi: viewOggi, piano: viewPiano, progressi: viewProgressi, cibo: viewCibo, impostazioni: viewImpostazioni };
// Transizione solo quando cambia schermata (non a ogni tocco):
// fwd/back = elenco ⇄ esercizio, ex-next/ex-prev = da un esercizio all'altro, day-next/day-prev = cambio giorno, fade = cambio scheda
let lastKey = null;
function screenKey() { const c = state.current; return ui.tab === 'oggi' && c?.view === 'ex' && c.date === (ui.day || today()) ? `ex:${c.cur}` : ui.tab + (ui.tab === 'oggi' ? ':' + (ui.day || '') : ''); }
function transitionKind(prev, key) {
  if (!prev) return 'fade';
  if (prev === key) return '';
  const a = prev.startsWith('ex:') ? +prev.slice(3) : null, b = key.startsWith('ex:') ? +key.slice(3) : null;
  if (a == null && b != null) return 'fwd';
  if (a != null && b == null) return key.startsWith('oggi') ? 'back' : 'fade';
  if (a != null && b != null) return b > a ? 'ex-next' : 'ex-prev';
  if (prev.startsWith('oggi:') && key.startsWith('oggi:')) return (key.slice(5) || today()) > (prev.slice(5) || today()) ? 'day-next' : 'day-prev';
  return 'fade';
}
// La schermata vecchia resta un attimo come copia sopra la nuova: scivola via dal lato giusto e sfuma
function ghostOut(old, kind) {
  const box = document.getElementById('ghosts'); if (!box || !old.animate) return;
  const r = old.getBoundingClientRect();
  const g = old.cloneNode(true);
  g.className = `screen ${kind.startsWith('day') ? 'g-day' : kind.startsWith('ex-') ? 'g-ex' : ''}`;
  g.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
  Object.assign(g.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px` });
  box.appendChild(g);
  const st = old.querySelector('.strip'), gst = g.querySelector('.strip'); if (st && gst) gst.scrollLeft = st.scrollLeft;
  const part = kind.startsWith('day') ? g.querySelector('.daybody') : kind.startsWith('ex-') ? g.querySelector('.exbody') : g;
  const dir = /next|fwd/.test(kind) ? -1 : 1;
  const from = part?.style.transform || 'none', op = part?.style.opacity || '1';
  // la copia sparisce presto (non si sovrappone alla nuova), ma continua a scivolare per dare la direzione
  const anim = part?.animate([{ transform: from, opacity: op }, { opacity: 0, offset: 0.4 }, { transform: `translateX(${dir * 38}%)`, opacity: 0 }], { duration: 280, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
  const end = () => g.remove();
  if (anim) { anim.onfinish = end; anim.oncancel = end; } else end();
  setTimeout(end, 600);
}
function render() {
  const tabs = [...document.querySelectorAll('.tabs button')];
  tabs.forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const ti = tabs.findIndex(b => b.dataset.tab === ui.tab), bar = $('#tabs');
  bar.style.setProperty('--ti', Math.max(0, ti)); bar.classList.toggle('noind', ti < 0);
  const key = screenKey();
  const kind = reduced() ? '' : transitionKind(lastKey, key);
  lastKey = key;
  const view = $('#view'), old = view.firstElementChild;
  if (old && kind && kind !== 'fade') ghostOut(old, kind);
  // le immagini dell'esercizio restano le stesse: l'animazione non riparte a ogni tocco
  const flips = new Map([...view.querySelectorAll('.flip[data-id]')].map(f => [f.dataset.id, f]));
  view.innerHTML = `<div class="screen ${kind ? `enter-${kind}` : ''}">${VIEWS[ui.tab]()}</div>`;
  if (flips.size && !kind) view.querySelectorAll('.flip[data-id]').forEach(f => { const o = flips.get(f.dataset.id); if (o) f.replaceWith(o); });
  if (ui.toTop) { view.scrollTop = 0; ui.toTop = false; }
  placeStrip();
  renderSheet();
  if (state.current?.view !== 'ex' && !state.rest) keepAwake(false);
  tickTimer();
}

// ---------- Scheda esercizio a comparsa (tenendo premuto in Piano) ----------
function renderSheet() {
  const el = $('#sheet');
  if (el.classList.contains('closing')) {
    if (!ui.sheet) return;              // sta scendendo: la si lascia finire
    el.classList.remove('closing'); el.dataset.id = '';
  }
  if (ui.sheet === 'menu' && ui.menu) {
    el.dataset.id = 'menu';
    el.innerHTML = `<div class="sheet-bg" data-act="sheet-close"></div>
      <div class="sheet-card menu-card" role="dialog" aria-modal="true" aria-label="${esc(ui.menu.title)}">
        <p class="small muted" style="margin:0 0 10px;text-align:center">${esc(ui.menu.title)}</p>
        ${ui.menu.items.map(x => `<button class="big ${x.danger ? 'danger' : ''}" data-act="${x.act}" ${x.attrs || ''}>${esc(x.label)}</button>`).join('')}
        <button class="big ghost" data-act="sheet-close">Annulla</button>
      </div>`;
    el.hidden = false; return;
  }
  if (ui.sheet === 'fretta') {
    if (el.dataset.id === 'fretta' && !el.hidden) return;
    el.dataset.id = 'fretta';
    el.innerHTML = `<div class="sheet-bg" data-act="sheet-close"></div>
      <div class="sheet-card" role="dialog" aria-modal="true" aria-label="Ho fretta">
        <div class="row between" style="align-items:flex-start"><h3>Quanto tempo ti resta?</h3><button class="icon ghost" data-act="sheet-close" aria-label="Chiudi">✕</button></div>
        <p class="small muted" style="margin:4px 0 12px">L’app tiene gli esercizi più utili e lascia il resto alle prossime sedute.</p>
        <div class="chips">${[10, 15, 20, 30, 45].map(v => `<button data-act="fretta" data-v="${v}">${v} min</button>`).join('')}</div>
      </div>`;
    el.hidden = false; return;
  }
  const e = ui.sheet && EX[ui.sheet];
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
// Chiusura: la scheda scende (da dove l'ha lasciata il dito) e lo sfondo sfuma
function closeSheet() {
  ui.sheet = null;
  const el = $('#sheet');
  if (el.hidden || el.classList.contains('closing')) return;
  el.dataset.id = '';
  const card = el.querySelector('.sheet-card'), bg = el.querySelector('.sheet-bg');
  if (reduced() || !card?.animate) { el.hidden = true; el.innerHTML = ''; return; }
  el.classList.add('closing');
  const from = card.style.transform || 'translateY(0)';
  const a = card.animate([{ transform: from }, { transform: 'translateY(105%)' }], { duration: 260, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
  bg?.animate([{ opacity: getComputedStyle(bg).opacity }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
  const done = () => { if (!el.classList.contains('closing')) return; el.classList.remove('closing'); if (!ui.sheet) { el.hidden = true; el.innerHTML = ''; } };
  a.onfinish = done; setTimeout(done, 500);
}
// La scheda si chiude anche trascinandola verso il basso
let sd = null;
document.addEventListener('touchstart', ev => {
  sd = null;
  const card = ev.target.closest?.('.sheet-card'); if (!card || ev.touches.length !== 1 || card.scrollTop > 0) return;
  sd = { card, y: ev.touches[0].clientY, t: Date.now(), dy: 0, on: false };
}, { passive: true });
document.addEventListener('touchmove', ev => {
  if (!sd) return;
  const dy = ev.touches[0].clientY - sd.y;
  if (!sd.on) { if (dy < -4) { sd = null; return; } if (dy < 8) return; sd.on = true; }
  if (ev.cancelable) ev.preventDefault();
  sd.dy = Math.max(0, dy - 8);
  sd.card.style.transform = `translateY(${sd.dy}px)`;
  const bg = sd.card.previousElementSibling; if (bg) bg.style.opacity = String(Math.max(0.2, 1 - sd.dy / 500));
}, { passive: false });
for (const t of ['touchend', 'touchcancel']) document.addEventListener(t, () => {
  const s = sd; sd = null; if (!s?.on) return;
  const v = s.dy / Math.max(1, Date.now() - s.t);
  if (s.dy > 110 || (s.dy > 30 && v > 0.5)) return closeSheet();
  const from = s.card.style.transform; s.card.style.transform = '';
  const bg = s.card.previousElementSibling; if (bg) bg.style.opacity = '';
  s.card.animate?.([{ transform: from }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.34, 1.3, .64, 1)' });
}, { passive: true });

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) { navigator.share({ files: [file] }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------- Azioni ----------
// + e −: il carico va di 1 kg (di una piastra sulle macchine in libbre), le ripetizioni di 1 (5 s a tempo).
// Tenendo premuto il numero scorre a raffica.
function stepDraft(a, d) {
  const c = state.current; if (!c || !ui.draft) return;
  const it = c.items[ui.draft.i];
  ui.bump = { a, d };
  if (a === 'kg') ui.draft.kg = isLb(it.id) ? E.stepLoad(state, it.id, ui.draft.kg, d) : Math.max(0, Math.round(((ui.draft.kg ?? 0) + d) * 100) / 100);
  else ui.draft.reps = Math.max(1, ui.draft.reps + d * (EX[it.id].type === 'time' ? 5 : 1));
  render();
}
let hold = null;
document.addEventListener('pointerdown', ev => {
  const b = ev.target.closest?.('[data-act=kg],[data-act=reps]');
  if (hold) clearTimeout(hold.t);
  hold = null; if (!b || !ui.draft) return;
  const a = b.dataset.act, d = +b.dataset.d;
  const tick = n => { hold.fired = true; stepDraft(a, d); hold.t = setTimeout(() => tick(n + 1), n < 6 ? 160 : 70); };
  hold = { fired: false, t: setTimeout(() => tick(0), 400) };
});
for (const t of ['pointerup', 'pointercancel']) document.addEventListener(t, () => { if (hold) clearTimeout(hold.t); });

document.addEventListener('click', ev => {
  unlockAudio();
  const tab = ev.target.closest('[data-tab]');
  if (tab) {
    if (tab.dataset.tab === 'oggi' && ui.tab === 'oggi' && ui.day) { ui.stripCenter = true; return setDay(today()); }   // secondo tocco su Oggi: torna a oggi
    ui.tab = tab.dataset.tab; ui.confirmReset = false; ui.confirmDel = null; ui.confirmSnap = null; toTop(); render(); return;
  }
  if (Date.now() - (ui.lpEnd || 0) < 450) { ui.lpEnd = 0; return; }   // il tocco che chiude una pressione lunga non conta
  const el = ev.target.closest('[data-act]'); if (!el) return;
  if (el.closest('.menu-card') && el.dataset.act !== 'sheet-close') closeSheet();
  const a = el.dataset.act; const c = state.current;
  const i = +el.dataset.i; const d = +el.dataset.d;
  const rerender = () => { if (c) { tidySupersets(c); c.minutes = E.planMinutes(state, c); sync(); } save(); render(); };
  const replan = () => { if (c && !hasLogs(c)) state.current = null; };
  switch (a) {
    case 'none': return;                          // tocco sul contatore delle serie: non apre l'esercizio
    case 'intro-ok': state.seenIntro = true; return rerender();
    case 'cycle-ok': state.cycleBanner = null; return rerender();
    case 'notice-ok': state.notice = null; return rerender();
    case 'force': delete state.skipDay; state.current = E.compose(state, today()); state.current.forced = true; save(); return render();
    case 'lp-info': ui.sheet = el.dataset.id; return renderSheet();
    case 'plan-del': {   // dalla pressione lunga su "Seduta di oggi": via le serie segnate (se ci sono) e la seduta
      const s0 = c && state.sessions.find(x => x.date === c.date);
      if (s0 && hasLogs(c)) { snapshot(JSON.stringify(state), 'prima di eliminare un allenamento'); E.deleteSession(state, s0.id); }
      if (c && c.date !== today()) leavePast();
      else { if (c && !c.forced && !hasLogs(c)) state.skipDay = today(); state.current = null; }
      state.rest = null; save(); toast('Seduta eliminata'); return render();
    }
    case 'recompose': { if (hasLogs(c)) return; const f = c?.forced; state.current = E.compose(state, today(), Date.now(), c?.duration); state.current.forced = f; toast('Seduta ricomposta'); save(); return render(); }
    case 'today-dur': {
      if (!c || hasLogs(c)) return;
      const v = +el.dataset.v, f = c.forced; ui.dur = { date: today(), min: v };
      state.current = E.compose(state, today(), Date.now(), v); state.current.forced = f; save(); return render();
    }
    case 'fretta-open': ui.sheet = 'fretta'; return renderSheet();
    case 'fretta': {
      closeSheet(); if (!c) return;
      E.trimPlan(state, c, +el.dataset.v);
      const gs = E.groupItems(c.items);
      c.cur = Math.max(0, gs.findIndex(gr => !gr.items.every(i => isDone(i) || i.skipped)));
      if (c.cur === 0 && gs.every(gr => gr.items.every(i => isDone(i) || i.skipped))) c.view = 'list';
      const left = gs.filter(gr => !gr.items.every(i => isDone(i) || i.skipped)).length;
      toast(left ? `Seduta accorciata: ${left === 1 ? 'resta un esercizio' : `restano ${left} esercizi`}` : 'Per oggi basta così');
      sync(); save(); return render();
    }
    case 'open': return go(+el.dataset.g);
    case 'day': { const k = el.dataset.k; if (!el.closest('#strip')) ui.stripCenter = true; return setDay(k); }
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
      Object.assign(n, { forced: true, view: 'list', cur: 0 }); n.minutes = E.planMinutes(state, n);
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
    case 'kg': case 'reps': if (hold?.fired) { hold = null; return; } return stepDraft(a, d);
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
    case 'inc': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), inc: el.dataset.v === 'lb' ? 'lb' : +el.dataset.v }; return rerender();
    case 'unit': { // kg ⇄ pacco in libbre, direttamente dalla serie
      const id = el.dataset.id, x = state.settings.ex[id] || {};
      state.settings.ex[id] = x.inc === 'lb' ? { ...x, inc: x.incKg ?? E.exSettings({ settings: { ex: {} } }, id).inc } : { ...x, inc: 'lb', incKg: typeof x.inc === 'number' ? x.inc : undefined };
      if (ui.draft?.kg != null) ui.draft.kg = E.snapLoad(state, id, ui.draft.kg);
      toast(isLb(id) ? 'Pacco in libbre: segni il numero dove metti il perno' : 'Carico in kg');
      return rerender(); }
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
    case 'gh-connect': { const t = ($('[data-in=gh-token]')?.value || '').trim(); if (!t) { ui.ghMsg = 'Incolla prima la chiave'; return render(); } ghConnect(t); return; }
    case 'gh-now': ghBackup({ force: true }); toast('Salvataggio su GitHub…'); return;
    case 'gh-restore': if (!ui.confirmGh) { ui.confirmGh = true; return render(); } ui.confirmGh = false; ghRestore(); return;
    case 'gh-off': if (!ui.confirmGhOff) { ui.confirmGhOff = true; return render(); } ui.confirmGhOff = false; G.ghStore(null); toast('Copia su GitHub scollegata'); return render();
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
  const el = ev.target; const k = el.dataset.in; if (!k || k === 'gh-token') return;   // la chiave si legge solo con "Collega"
  const num = () => parseFloat(String(el.value).replace(',', '.'));
  const c = state.current;
  switch (k) {
    case 'ov-add': if (el.value) {
      c.items.push(newItem(el.value)); c.minutes = E.planMinutes(state, c);
      if (hasLogs(c) || c.free || c.date !== today()) return go(E.groupItems(c.items).length - 1);   // durante l'allenamento si apre subito
    } break;
    case 'past-add': if (el.value) { openPast(el.dataset.k, el.value); save(); return go(E.groupItems(state.current.items).length - 1); } break;
    case 'free-add': if (el.value) {
      state.current = { date: today(), items: [newItem(el.value)], reason: '', free: true, forced: true, deload: false, seed: null, cur: 0, view: 'list', minutes: 0 };
      state.current.minutes = E.planMinutes(state, state.current);
      return go(0);
    } break;
    case 'draft-kg': return; // gestito dall'evento input, senza ridisegnare (non perde il tocco sui bottoni)
    case 'note': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), note: el.value.trim() }; save(); return;
    case 'weight': case 'cp-weight': { const v = num(); if (!(v > 30 && v < 300)) return; const w = state.body.weights.filter(x => x.date !== today()); w.push({ date: today(), kg: v }); w.sort((a, b) => a.date.localeCompare(b.date)); state.body.weights = w; E.nutritionCheck(state); toast('Peso salvato'); break; }
    case 'waist': case 'cp-waist': { const v = num(); if (!(v > 40 && v < 200)) return; const w = state.body.waist.filter(x => x.date !== today()); w.push({ date: today(), cm: v }); state.body.waist = w; toast('Vita salvata'); break; }
    case 'ex-inc': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), inc: el.value === 'lb' ? 'lb' : +el.value }; break;
    case 'ex-base': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), base: num() || 0 }; break;
    case 'import': {
      const f = el.files[0]; if (!f) return;
      f.text().then(t => {
        try {
          loadData(t, 'prima di caricare una copia'); toast('Copia caricata'); render();
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
    const lb = isLb(state.current.items[ui.draft.i].id);
    ui.draft.kg = !isNaN(v) && v >= 0 ? (lb ? E.lbToKg(v) : v) : null;
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

// Pressione lunga su un allenamento, un esercizio o la seduta di oggi: si apre il menu con le opzioni (eliminare, togliere…)
function lpMenu(el) {
  const k = el.dataset.lp, c = state.current;
  let title = '', items = [];
  if (k === 'ses') {
    const s = state.sessions.find(x => x.id === +el.dataset.id); if (!s) return false;
    title = `Allenamento di ${dayLabel(s.date).toLowerCase()}`;
    items = [{ act: 'del-yes', label: 'Elimina allenamento', danger: true, attrs: `data-id="${s.id}"` }];
  } else if (k === 'ex') {
    const it = c?.items[+el.dataset.i]; if (!it) return false;
    title = it.id === 'cardio' ? 'Cardio extra' : EX[it.id].name;
    if (it.id !== 'cardio') items.push({ act: 'lp-info', label: 'Come si fa', attrs: `data-id="${it.id}"` });
    if (!logged(it).length) items.push({ act: 'ov-del', label: 'Togli dalla seduta', danger: true, attrs: `data-i="${el.dataset.i}"` });
  } else if (k === 'plan') {
    if (!c) return false;
    const isToday = c.date === today();
    title = isToday ? 'Seduta di oggi' : `Allenamento di ${dayLabel(c.date).toLowerCase()}`;
    if (isToday && !hasLogs(c) && !c.free) items.push({ act: 'recompose', label: 'Ricomponi la seduta' });
    items.push({ act: 'plan-del', label: hasLogs(c) ? 'Elimina la seduta e le serie segnate' : 'Elimina la seduta', danger: true });
  }
  if (!items.length) return false;
  ui.menu = { title, items }; ui.sheet = 'menu'; ui.longAt = Date.now(); renderSheet();
  return true;
}
// Mentre tieni premuto il blocco si stringe un poco: si capisce che sta per aprirsi il menu
let lp = null;
const lpCancel = () => { if (!lp) return; clearTimeout(lp.timer); clearTimeout(lp.hold); lp.el.classList.remove('lp-hold'); lp = null; };
document.addEventListener('touchstart', ev => {
  lpCancel();
  const el = ev.target.closest?.('[data-lp]');
  if (!el || ev.touches.length !== 1 || ev.target.closest('button,input,select,textarea,.flip')) return;
  const t = ev.touches[0];
  lp = { el, x: t.clientX, y: t.clientY,
    hold: setTimeout(() => el.classList.add('lp-hold'), 130),
    timer: setTimeout(() => { el.classList.remove('lp-hold'); lp = null; ui.lpOpen = lpMenu(el); }, 500) };
}, { passive: true });
document.addEventListener('touchmove', ev => {
  if (!lp) return; const t = ev.touches[0];
  if (Math.hypot(t.clientX - lp.x, t.clientY - lp.y) > 10) lpCancel();
}, { passive: true });
for (const t of ['touchend', 'touchcancel']) document.addEventListener(t, () => {
  lpCancel();
  if (ui.lpOpen) { ui.lpOpen = false; ui.lpEnd = Date.now(); }
}, { passive: true });
document.addEventListener('contextmenu', ev => {   // computer: tasto destro
  const el = ev.target.closest?.('[data-lp]'); if (!el || ev.target.closest('[data-act=xp]')) return;
  if (lpMenu(el)) ev.preventDefault();
});

// Scorrimento orizzontale: in Oggi cambia giorno (verso sinistra il giorno dopo), nella seduta cambia esercizio.
// Il contenuto segue il dito; lasciando oltre metà strada (o con un colpo veloce) si passa, altrimenti torna al suo posto.
let sw = null;
function swipeCan(ex, dir) {
  if (!ex) return Math.abs(E.diffDays(E.addDays(ui.day || today(), dir), today())) <= 15;   // come il calendario
  const c = state.current;
  return dir > 0 ? c.cur < E.groupItems(c.items).length - 1 : true;                     // dal primo esercizio si torna all'elenco
}
document.addEventListener('touchstart', ev => {
  sw = null;
  if (ui.tab !== 'oggi' || ui.sheet || ev.touches.length !== 1 || ev.target.closest?.('input,select,.flip,#strip')) return;
  const c = state.current;
  const ex = c?.view === 'ex' && c.date === (ui.day || today());
  const body = document.querySelector(ex ? '#view .exbody' : '#view .daybody'); if (!body) return;
  sw = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now(), ex, body, lock: null, dx: 0 };
}, { passive: true });
document.addEventListener('touchmove', ev => {
  if (!sw) return;
  const p = ev.touches[0], dx = p.clientX - sw.x, dy = p.clientY - sw.y;
  if (!sw.lock) {
    if (Math.hypot(dx, dy) < 10) return;
    sw.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
    if (sw.lock === 'h') { if (hold) clearTimeout(hold.t); sw.can = { 1: swipeCan(sw.ex, 1), '-1': swipeCan(sw.ex, -1) }; }
  }
  if (sw.lock !== 'h') return;
  if (ev.cancelable) ev.preventDefault();
  const ok = sw.can[dx < 0 ? 1 : -1];
  sw.dx = dx;
  sw.body.style.transform = `translateX(${ok ? dx : dx * 0.2}px)`;     // dove non si può andare fa resistenza
  sw.body.style.opacity = ok ? String(1 - Math.min(0.45, Math.abs(dx) / 700)) : '';
}, { passive: false });
for (const type of ['touchend', 'touchcancel']) document.addEventListener(type, () => {
  const s = sw; sw = null; if (!s || s.lock !== 'h') return;
  const dir = s.dx < 0 ? 1 : -1, v = Math.abs(s.dx) / Math.max(1, Date.now() - s.t);
  if (type === 'touchend' && s.can[dir] && (Math.abs(s.dx) > Math.min(120, innerWidth * 0.3) || (Math.abs(s.dx) > 40 && v > 0.45))) {
    if (!s.ex) { ui.stripCenter = true; return setDay(E.addDays(ui.day || today(), dir)); }
    const c = state.current;
    if (dir > 0) return go(c.cur + 1);
    return c.cur > 0 ? go(c.cur - 1) : showList();
  }
  const from = s.body.style.transform, op = s.body.style.opacity || '1';
  s.body.style.transform = ''; s.body.style.opacity = '';
  if (!reduced()) s.body.animate?.([{ transform: from, opacity: op }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.34, 1.25, .64, 1)' });
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
setTimeout(() => ghBackup(), 2000);
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
