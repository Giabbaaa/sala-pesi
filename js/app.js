import { EX, EXERCISES, MUSCLES, MUSCLE_ORDER, TYPE_RULES, imgs } from './catalog.js';
import * as E from './engine.js';

const KEY = 'salapesi.v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kg = E.fmtKg;
const thousands = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---------- Stato ----------
let state;
try { state = E.migrate(JSON.parse(localStorage.getItem(KEY))); } catch { state = E.initialState(); }
let ui = { tab: 'oggi', editSet: null, confirmEnd: false, confirmReset: false, undo: null };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Spazio pieno: esporta un backup'); } };
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

const today = () => E.dayKey();

// ---------- Audio e schermo acceso ----------
let actx = null;
function unlockAudio() {
  if (actx) return;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
}
function beep(n = 3) {
  if (!actx) return;
  for (let i = 0; i < n; i++) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime + i * 0.35;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.start(t); o.stop(t + 0.3);
  }
  navigator.vibrate?.([200, 100, 200]);
}
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.current?.start) keepAwake(true); tickTimer(); });

// ---------- Timer di recupero ----------
function startRest(sec, label) {
  state.rest = { end: Date.now() + sec * 1000, label, beeped: false };
  save(); tickTimer();
}
function tickTimer() {
  const el = $('#timer'); const r = state.rest;
  if (!r || !state.current?.start) { el.hidden = true; return; }
  const left = Math.ceil((r.end - Date.now()) / 1000);
  if (left <= -20) { state.rest = null; save(); el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('end', left <= 0);
  const t = Math.max(0, left);
  el.innerHTML = left > 0
    ? `<span class="t">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span><span class="l">Recupero<br>${esc(r.label)}</span><button data-act="rest+">+15 s</button><button data-act="rest-skip">Salta</button>`
    : `<span class="t">Vai!</span><span class="l">Recupero finito</span><button data-act="rest-skip">OK</button>`;
  if (left <= 0 && !r.beeped) { r.beeped = true; save(); beep(); }
}
setInterval(tickTimer, 250);

// ---------- Notifica con Annulla ----------
let toastTimer = null;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-act="undo">Annulla</button>' : ''}`;
  el.hidden = false; ui.undo = undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; ui.undo = null; }, undo ? 6000 : 2500);
}

// ---------- Helper di visualizzazione ----------
const repsLabel = (id, r) => EX[id].type === 'time' ? `${r} s` : `${r}`;
const rangeLabel = id => { const r = TYPE_RULES[EX[id].type]; return `${r.min}–${r.max}${r.unit ? ' s' : ''}`; };
const loadLabel = (id, k) => EX[id].type === 'time' ? 'corpo libero' : k == null ? 'carico da provare' : `${kg(k)} kg`;
const musclesLine = id => Object.entries(EX[id].work).map(([m, w]) => w >= 1 ? MUSCLES[m].name : `${MUSCLES[m].name.toLowerCase()} (in parte)`).join(' · ');

function stripHtml() {
  const d = E.strip(state, today());
  return `<div class="strip">${d.map(x => `<div class="day ${x.done ? 'done' : ''} ${x.rec ? 'rec' : ''} ${x.today ? 'today' : ''}">${x.label}<i>${x.num}</i></div>`).join('')}</div>`;
}

function calendarCard() {
  const lbl = E.nextLabel(state, today());
  const doneToday = state.sessions.some(s => s.date === today());
  return `<section class="card">
    <div class="next">Prossimo allenamento<b>${doneToday && lbl === 'oggi' ? '—' : esc(lbl)}</b></div>
    ${stripHtml()}
  </section>`;
}

function spark(values, h = 48) {
  if (values.length < 2) return '';
  const w = 300, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [i / (values.length - 1) * (w - 8) + 4, h - 6 - (v - min) / span * (h - 12)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const l = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}"/><circle cx="${l[0]}" cy="${l[1]}" r="4"/></svg>`;
}

// ---------- OGGI ----------
function ensureCurrent(force = false) {
  const c = state.current;
  if (c && c.start) return;                         // seduta in corso: non si tocca
  if (c && c.date === today() && !force) return;
  state.current = E.compose(state, today());
  save();
}

function viewOggi() {
  const t = today();
  const c = state.current;
  if (c?.start) return viewSession();
  let html = '';
  if (!state.seenIntro) html += `<section class="alert"><b>Prima di iniziare</b>
    <p class="small">Se un esercizio fa male in modo acuto o il dolore aumenta serie dopo serie, fermati e usa <b>Cambia</b>. Ginocchio: sulla leg press piedi alti e scendi solo fin dove non fa male.</p>
    ${!matchMedia('(display-mode: standalone)').matches && !navigator.standalone ? '<p class="small">Per averla come app: in Safari tocca Condividi → Aggiungi alla schermata Home.</p>' : ''}
    <button class="ghost" data-act="intro-ok">Ho capito</button></section>`;

  html += `<h1>Oggi</h1>`;
  html += calendarCard();

  const sum = state.lastSummary;
  if (sum && sum.date === t) {
    html += `<section class="card done-card"><div class="big-num">Fatto!</div>
      <div class="summary" style="justify-content:center"><span><b>${sum.minutes}</b> min</span><span><b>${sum.kcal[0]}–${sum.kcal[1]}</b> kcal</span><span><b>${sum.sets}</b> serie</span></div>
      ${sum.records.length ? `<p><b>Record battuti</b></p>${sum.records.map(r => `<p>${esc(EX[r.id].name)} · ${kg(Math.round(r.e1rm))} kg stimati</p>`).join('')}` : '<p class="muted">Nessun record oggi: la costanza conta di più.</p>'}
    </section>`;
    if (!c || c.date !== t) return html;
  }

  const ci = E.cycleInfo(state);
  if (ci.checkpoint && !state.body.waist.some(w => w.date === t) && !(sum && sum.date === t)) {
    html += `<section class="alert"><b>Punto di controllo (seduta ${ci.done})</b><p class="small">Peso di stamattina e circonferenza vita all’ombelico.</p>
      <div class="row" style="margin-top:8px"><input type="number" inputmode="decimal" step="0.1" placeholder="Peso kg" data-in="cp-weight"><input type="number" inputmode="decimal" step="0.5" placeholder="Vita cm" data-in="cp-waist"></div></section>`;
  }
  if (state.cycleBanner) html += `<section class="alert"><b>${esc(state.cycleBanner)}</b><p class="small">Se vuoi, in Piano puoi cambiare gli esercizi àncora con una variante.</p><button class="ghost" data-act="cycle-ok">OK</button></section>`;

  const rec = E.recommendedDays(state, t);
  const isRec = rec[0] === t && !state.sessions.some(s => s.date === t);
  if (!isRec && !(c && c.date === t && c.forced)) {
    html += `<section class="card"><h3>${sum && sum.date === t ? 'Per oggi basta così' : 'Oggi riposo'}</h3>
      <p class="muted">Il recupero fa crescere il muscolo quanto l’allenamento.</p>
      <button style="margin-top:10px" data-act="force">Allenati comunque</button></section>`;
    return html;
  }
  ensureCurrent();
  return html + overview(state.current);
}

function overview(c) {
  const work = c.items.filter(i => i.id !== 'cardio');
  const all = work.flatMap(i => Array(i.planSets).fill(0));
  const kc = E.kcalRange(state, c.minutes, { superset: c.items.some(i => i.ss), hard: true });
  let rows = '';
  const groups = E.groupItems(c.items);
  groups.forEach((g, gi) => {
    let inner = '';
    g.items.forEach(it => {
      const idx = c.items.indexOf(it);
      if (it.id === 'cardio') {
        inner += `<div class="ex-row"><div style="font-size:26px;text-align:center">🚴</div><div><div class="name">Cardio extra</div><div class="meta">${it.minutes} min · ellittica o tapis roulant in salita</div></div>
          <div><button class="icon" data-act="ov-del" data-i="${idx}" aria-label="Togli">✕</button></div></div>`;
        return;
      }
      const e = EX[it.id];
      inner += `<div class="ex-row">
        <img src="${imgs(it.id)[1]}" alt="" loading="lazy">
        <div><div class="name">${esc(e.name)}</div>
          <div class="meta">${it.planSets} × ${rangeLabel(it.id)} · ${loadLabel(it.id, it.kg)}</div>
          ${it.note ? `<div class="tip ${/−|ridotto|Fermo|pausa/.test(it.note) ? 'down' : ''}">${esc(it.note)}</div>` : ''}
          <div class="ctrls">
            <button data-act="ov-sets" data-i="${idx}" data-d="-1" aria-label="Una serie in meno">−</button>
            <button data-act="ov-sets" data-i="${idx}" data-d="1" aria-label="Una serie in più">+</button>
            <button data-act="ov-swap" data-i="${idx}" aria-label="Cambia esercizio">⇄</button>
            <button data-act="ov-del" data-i="${idx}" aria-label="Togli">✕</button>
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
        : next.items.length === 1 && EX[g.items[0].id].type !== 'multi' && EX[next.items[0].id].type !== 'multi' ? `<div class="join"><button data-act="ov-join" data-i="${g.start}">Unisci in superserie ↕</button></div>` : '';
    }
  });
  const addOpts = MUSCLE_ORDER.map(m => `<optgroup label="${MUSCLES[m].name}">${EXERCISES.filter(e => e.muscle === m).map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</optgroup>`).join('');
  return `<section class="card">
    <h3>Seduta di oggi${c.deload ? ' · scarico' : ''}</h3>
    <p class="reason">${esc(c.reason)}</p>
    <div class="summary"><span><b>${c.minutes}</b> min</span><span><b>${work.length}</b> esercizi</span><span><b>${all.length}</b> serie</span><span><b>${kc[0]}–${kc[1]}</b> kcal</span></div>
    <p class="small muted">Prima 5–10 min di cardio leggero.</p>
    ${rows}
    <select data-in="ov-add" style="margin-top:12px"><option value="">+ Aggiungi esercizio</option>${addOpts}</select>
  </section>
  <button class="primary big" data-act="start">Inizia</button>
  <div class="row" style="justify-content:center;margin-top:6px"><button class="ghost" data-act="recompose">Ricomponi la seduta</button></div>`;
}

// ---------- Seduta in corso ----------
const isDone = it => it.id === 'cardio' ? it.sets.length > 0 : it.sets.filter(Boolean).length >= it.planSets;

function curGroup(c) {
  const groups = E.groupItems(c.items);
  return { groups, g: groups[Math.min(c.cur, groups.length - 1)] || groups[0] };
}

function setDefaults(c, it, i) {
  const logged = it.sets.filter(Boolean);
  const prev = logged[logged.length - 1];
  return { kg: it.adjKg ?? (prev ? prev.kg : it.kg), reps: it.reps };
}

function viewSession() {
  const c = state.current;
  const { groups, g } = curGroup(c);
  const mins = Math.floor((Date.now() - c.start) / 60000);
  const segs = groups.map((gr, gi) => {
    const done = gr.items.every(isDone), skip = gr.items.every(i => i.skipped);
    const cls = gi === c.cur ? 'cur' : done ? 'done' : skip ? 'skip' : '';
    return `<span class="${cls}" data-act="goto" data-g="${gi}"></span>`;
  }).join('');
  let html = `<div class="topbar"><div class="row between" style="margin-bottom:8px"><span class="muted small">${mins} min · esercizio ${c.cur + 1} di ${groups.length}</span>
    <button class="ghost" data-act="end">Termina</button></div><div class="progress">${segs}</div></div>`;

  if (ui.confirmEnd) {
    const missing = c.items.filter(i => !i.skipped && !i.sets.filter(Boolean).length);
    html += `<section class="alert"><b>${missing.length ? 'Ti mancano ancora:' : 'Terminare la seduta?'}</b>
      ${missing.length ? `<p class="small">${missing.map(i => i.id === 'cardio' ? 'Cardio extra' : esc(EX[i.id].name)).join(', ')}</p>` : ''}
      <div class="row" style="margin-top:8px"><button class="grow" data-act="end-no">Torna agli esercizi</button><button class="grow primary" data-act="end-yes">Termina</button></div></section>`;
  }

  const sm = g.items.length > 1;
  html += `<section class="card">${sm ? '<span class="tag">Superserie: alterna i due esercizi, recupero dopo la coppia</span>' : ''}`;
  // turno nella superserie: l'esercizio con meno serie fatte
  const turn = g.items.filter(i => !isDone(i) && !i.skipped).sort((a, b) => a.sets.filter(Boolean).length - b.sets.filter(Boolean).length)[0];
  for (const it of g.items) {
    const idx = c.items.indexOf(it);
    if (it.id === 'cardio') {
      html += `<h3>Cardio extra · ${it.minutes} min</h3><p class="muted">Ellittica o tapis roulant in salita, ritmo in cui riesci a parlare.</p>
        <button class="primary big" style="margin-top:12px" data-act="cardio-done" data-i="${idx}">${it.sets.length ? 'Fatto ✓' : 'Segna come fatto'}</button>`;
      continue;
    }
    const e = EX[it.id]; const st = E.exSettings(state, it.id);
    const sg = E.suggestion(state, it.id);
    const last = sg.last;
    html += `<div style="${sm && it !== g.items[0] ? 'margin-top:18px;padding-top:14px;border-top:2px solid var(--line)' : ''}">
      <div class="row between"><h3>${esc(e.name)}</h3><span class="muted small">${it.planSets} × ${rangeLabel(it.id)}</span></div>
      <p class="small muted">${musclesLine(it.id)}</p>
      <div class="flip ${sm ? 'sm' : ''}" style="margin-top:8px"><img src="${imgs(it.id)[0]}" alt="Posizione iniziale"><img class="b" src="${imgs(it.id)[1]}" alt="Posizione finale"></div>
      <ul class="cues">${e.cues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="note"><input type="text" placeholder="Nota personale (es. sedile al 4)" value="${esc(st.note)}" data-in="note" data-id="${it.id}"></div>`;
    if (!st.incSet && e.type !== 'time') {
      html += `<div style="margin-top:10px"><p class="small"><b>Di quanto sale il carico su questo attrezzo?</b> Lo chiedo una volta sola.</p>
        <div class="chips" style="margin-top:6px">${[1, 1.25, 2, 2.5, 5].map(v => `<button class="${v === st.inc ? 'on' : ''}" data-act="inc" data-id="${it.id}" data-v="${v}">${kg(v)} kg</button>`).join('')}</div></div>`;
    }
    const wu = !it.sets.length ? E.warmups(state, it.id, it.kg) : [];
    const firstForMuscle = c.items.findIndex(x => x.id !== 'cardio' && EX[x.id].muscle === e.muscle) === idx;
    if (wu.length && firstForMuscle) html += `<p class="small" style="margin-top:10px"><b>Riscaldamento:</b> ${wu.map(w => `1×${w.reps} a ${kg(w.kg)} kg`).join(', poi ')}</p>`;
    if (it.note && !it.sets.length) html += `<p class="small" style="margin-top:6px;color:var(--ok)">${esc(it.note)}</p>`;

    // Serie
    html += `<div style="margin-top:10px">`;
    const n = Math.max(it.planSets, it.sets.length);
    let activeShown = false;
    for (let i = 0; i < n; i++) {
      const s = it.sets[i];
      const lastSet = last?.sets[i] || last?.sets[last.sets.length - 1];
      const lastTxt = lastSet ? `ultima volta ${e.type === 'time' ? `${lastSet.reps} s` : `${kg(lastSet.kg)} × ${lastSet.reps}`}` : 'prima volta';
      const editing = ui.editSet && ui.editSet.i === idx && ui.editSet.s === i;
      const isActive = editing || (!s && !activeShown && !it.skipped && (!sm || it === turn));
      if (s && !editing) {
        html += `<div class="set logged" data-act="edit-set" data-i="${idx}" data-s="${i}"><span class="n">${i + 1}</span>
          <span class="val">${e.type === 'time' ? `${s.reps} s` : `${kg(s.kg)} kg × ${s.reps}`}</span><span class="eff">${{ facile: 'facile', giusto: 'giusto', limite: 'al limite' }[s.eff]} ✓</span></div>`;
      } else if (isActive) {
        activeShown = true;
        const d = s ? { kg: s.kg, reps: s.reps } : (ui.draft?.i === idx && ui.draft?.s === i ? ui.draft : setDefaults(c, it, i));
        ui.draft = { i: idx, s: i, kg: d.kg, reps: d.reps };
        const plates = E.platesPerSide(state, it.id, d.kg);
        html += `<div class="set active"><div class="row between"><b>Serie ${i + 1}</b><span class="lastline">${esc(lastTxt)}</span></div>
          <div class="steppers">
            ${e.type === 'time' ? '<div></div>' : `<div class="stepper"><button data-act="kg" data-d="-1" aria-label="Meno peso">−</button><b><input class="kgin" type="text" inputmode="decimal" value="${d.kg == null ? '' : kg(d.kg)}" placeholder="?" data-in="draft-kg" aria-label="Carico in kg"><small>kg</small></b><button data-act="kg" data-d="1" aria-label="Più peso">+</button></div>`}
            <div class="stepper"><button data-act="reps" data-d="-1" aria-label="Meno">−</button><b>${d.reps}<small>${e.type === 'time' ? 'secondi' : 'ripetizioni'}</small></b><button data-act="reps" data-d="1" aria-label="Più">+</button></div>
          </div>
          ${plates ? `<p class="small muted" style="margin:-2px 0 8px">Per lato: ${plates.length ? plates.map(kg).join(' + ') : 'nessun disco'}</p>` : ''}
          <div class="effort">
            <button class="e1" data-act="log" data-eff="facile">Facile<small>4+ in riserva</small></button>
            <button class="e2" data-act="log" data-eff="giusto">Giusto<small>1–3 in riserva</small></button>
            <button class="e3" data-act="log" data-eff="limite">Al limite<small>0 in riserva</small></button>
          </div></div>`;
      } else {
        const d = setDefaults(c, it, i);
        html += `<div class="set future"><span class="n">${i + 1}</span><span class="val">${e.type === 'time' ? `${d.reps} s` : `${kg(d.kg)} kg × ${d.reps}`}</span><span></span></div>`;
      }
    }
    html += `</div>
      <div class="ctrls" style="margin-top:8px"><button data-act="add-set" data-i="${idx}">+ serie</button>
      ${!it.sets.length ? `<button data-act="swap" data-i="${idx}">Cambia (macchina occupata)</button>` : ''}
      ${!isDone(it) ? `<button data-act="skip" data-i="${idx}">${it.skipped ? 'Riprendi' : 'Salta'}</button>` : ''}</div>
    </div>`;
  }
  html += `</section>`;
  const nextG = groups.findIndex((gr, gi) => gi > c.cur && !gr.items.every(i => isDone(i) || i.skipped));
  html += `<div class="row" style="gap:8px">
    <button class="grow" data-act="goto" data-g="${Math.max(0, c.cur - 1)}" ${c.cur === 0 ? 'disabled' : ''}>← Indietro</button>
    ${nextG >= 0 ? `<button class="grow primary" data-act="goto" data-g="${nextG}">Avanti →</button>` : `<button class="grow primary" data-act="end">Termina seduta</button>`}
  </div>`;
  return html;
}

function logSet(eff) {
  const c = state.current; const d = ui.draft; if (!d) return;
  const it = c.items[d.i]; const e = EX[it.id];
  if (e.type !== 'time' && d.kg == null) { toast('Scegli prima il carico'); return; }
  const set = { kg: e.type === 'time' ? 0 : d.kg, reps: d.reps, eff, t: Date.now() };
  const wasEdit = !!it.sets[d.s];
  const before = JSON.stringify(c);
  it.sets[d.s] = set;
  // Al limite già alla prima serie sotto il minimo: le serie seguenti si alleggeriscono
  const r = TYPE_RULES[e.type];
  if (d.s === 0 && eff === 'limite' && d.reps < r.min && e.type !== 'time') {
    it.adjKg = Math.max(E.exSettings(state, it.id).inc, E.roundTo(d.kg * 0.925, E.exSettings(state, it.id).inc));
  } else if (d.s === 0) delete it.adjKg;
  ui.editSet = null; ui.draft = null;
  if (!wasEdit) {
    const { groups, g } = curGroup(c);
    const counts = g.items.filter(i => !i.skipped).map(i => i.sets.filter(Boolean).length);
    const pairDone = counts.every(x => x === counts[0]);
    if (pairDone) {
      const rest = g.items.length > 1 ? 90 : TYPE_RULES[e.type].rest;
      const allDone = g.items.every(i => isDone(i) || i.skipped);
      startRest(rest, allDone ? 'poi il prossimo esercizio' : `poi serie ${counts[0] + 1}`);
      if (allDone) {
        const nextG = groups.findIndex((gr, gi) => gi > c.cur && !gr.items.every(i => isDone(i) || i.skipped));
        const anyG = nextG >= 0 ? nextG : groups.findIndex(gr => !gr.items.every(i => isDone(i) || i.skipped));
        if (anyG >= 0 && anyG !== c.cur) { c.cur = anyG; setTimeout(() => window.scrollTo(0, 0), 0); }
      }
    }
  }
  save(); render();
  toast(wasEdit ? 'Serie corretta' : 'Serie salvata', () => { state.current = JSON.parse(before); state.rest = null; save(); render(); });
}

async function endSession() {
  const c = state.current;
  const res = E.finishSession(state, c);
  state.lastSummary = { date: c.date, ...res };
  const cyc = state.cycle;
  if (cyc.history.length && cyc.history[cyc.history.length - 1].end === E.dayKey() && c.deload) state.cycleBanner = `Inizia il ciclo ${cyc.n}`;
  state.current = null; state.rest = null; ui.confirmEnd = false;
  save(); keepAwake(false); window.scrollTo(0, 0); render();
}

// ---------- PIANO ----------
function viewPiano() {
  const ci = E.cycleInfo(state); const s = state.settings;
  const done7 = E.setsByMuscle(state, E.addDays(today(), -6), today());
  let html = `<h1>Piano</h1>
  <section class="card"><div class="row between"><h3>Ciclo ${ci.n}</h3><span class="muted">${ci.deloadLeft ? `scarico: ${ci.deloadLeft} sedute` : `seduta ${ci.session} di ${ci.length}`}</span></div>
    <div class="bar" style="margin:10px 0"><i style="width:${Math.min(100, ci.done / ci.length * 100)}%"></i></div>
    <p class="small muted">Traguardo del ciclo</p><input type="text" value="${esc(state.cycle.goal)}" data-in="goal">
    <p class="small muted" style="margin-top:8px">Punto di controllo ogni 12 sedute, poi 3 sedute di scarico. Obiettivi di serie: livello ${E.levelOf(state) + 1} di 3.</p></section>

  <h2>Serie per muscolo · ultimi 7 giorni</h2><section class="card">
  ${MUSCLE_ORDER.map(m => { const t = E.targetFor(state, m); const v = Math.round(done7[m] * 2) / 2; const p = Math.min(100, v / t * 100);
    return `<div class="mrow"><span>${MUSCLES[m].name}</span><span class="muted">${kg(v)} / ${t}</span><div class="bar"><i class="${v >= t ? 'full' : ''}" style="width:${p}%"></i></div></div>`; }).join('')}
  </section>

  <h2>Ritmo</h2><section class="card stack">
    <div class="row between"><span>Sedute ogni 7 giorni</span><span class="seg">${[2, 3, 4].map(n => `<button class="${s.freq === n ? 'on' : ''}" data-act="freq" data-v="${n}">${n}</button>`).join('')}</span></div>
    <p class="small muted">Giorni in cui di solito non puoi andare</p>
    <div class="chips">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button class="${s.unavailable.includes(d) ? 'on' : ''}" data-act="unav" data-v="${d}">${E.DAY_NAMES[d].slice(0, 3)}</button>`).join('')}</div>
  </section>

  <h2>Priorità ed esercizi</h2><section class="card">
  ${MUSCLE_ORDER.map(m => {
    const p = s.plan[m]; const opts = EXERCISES.filter(e => e.muscle === m);
    return `<div class="pm"><div class="row between"><b>${MUSCLES[m].name}</b>
      <span class="seg">${['alta', 'normale', 'minima'].map(v => `<button class="${s.priority[m] === v ? 'on' : ''}" data-act="prio" data-m="${m}" data-v="${v}">${v === 'minima' ? 'minima' : v}</button>`).join('')}</span></div>
      <div class="row"><span class="small muted" style="width:62px">Àncora</span><select data-in="anchor" data-m="${m}">${opts.map(e => `<option value="${e.id}" ${e.id === p.anchor ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
      <div class="chips">${opts.filter(e => e.id !== p.anchor).map(e => `<button class="${p.comp.includes(e.id) ? 'on' : ''}" data-act="comp" data-m="${m}" data-id="${e.id}">${esc(e.name)}</button>`).join('')}</div>
    </div>`; }).join('')}
  <p class="small muted" style="margin-top:8px">L’àncora resta fissa per tutto il ciclo e misura i progressi; gli esercizi evidenziati ruotano.</p>
  </section>`;
  return html;
}

// ---------- PROGRESSI ----------
function viewProgressi() {
  const t = today();
  const ss = state.sessions;
  let html = `<h1>Progressi</h1>`;
  if (!ss.length) return html + `<section class="card"><p>Qui vedrai massimali stimati, record, costanza, peso e vita.</p><p class="muted">Compare tutto dopo la prima seduta.</p></section>`;
  const ci = E.cycleInfo(state);
  html += `<section class="card"><div class="row between"><h3>Ciclo ${ci.n}</h3><span class="muted">seduta ${ci.session} di ${ci.length}</span></div>
    <p class="small muted">${esc(ci.goal)}</p>
    ${state.cycle.history.map(h => `<p class="small">Ciclo ${h.n}: ${h.sessions} sedute · ${h.levelUp ? 'obiettivi saliti' : 'stesso livello'}</p>`).join('')}</section>`;

  // Massimale stimato sulle àncore
  html += `<h2>Massimale stimato · esercizi àncora</h2><section class="card">`;
  let any = false;
  for (const m of MUSCLE_ORDER) {
    const id = state.settings.plan[m].anchor; if (EX[id].type === 'time') continue;
    const h = E.history(state, id).filter(p => !p.deload).reverse();
    if (!h.length) continue;
    any = true;
    const vals = h.map(p => E.bestE1rm(p.sets));
    const cur = vals[vals.length - 1], first = vals[0];
    const diff = cur - first;
    html += `<div class="mrow"><span><b>${esc(EX[id].name)}</b></span><span>${kg(Math.round(cur))} kg ${h.length > 1 ? `<span class="small" style="color:${diff >= 0 ? 'var(--ok)' : 'var(--bad)'}">${diff >= 0 ? '+' : ''}${kg(Math.round(diff))}</span>` : ''}</span>
      <div style="grid-column:1/-1">${spark(vals)}</div></div>`;
  }
  html += any ? '' : '<p class="muted">Ancora nessun dato sulle àncore.</p>';
  html += `</section>`;

  // Record personali
  const best = {};
  for (const s of ss) for (const it of s.items) for (const st of (it.sets || [])) {
    if (!EX[it.id] || EX[it.id].type === 'time') continue;
    const v = E.epley(st.kg, st.reps);
    if (!best[it.id] || v > best[it.id].v) best[it.id] = { v, st, date: s.date };
  }
  const recs = Object.entries(best).sort((a, b) => b[1].v - a[1].v);
  html += `<h2>Record personali</h2><section class="card">${recs.map(([id, b]) => `<div class="mrow"><span>${esc(EX[id].name)}</span><span><b>${kg(b.st.kg)} × ${b.st.reps}</b> <span class="muted small">${kg(Math.round(b.v))} kg stim.</span></span></div>`).join('')}</section>`;

  // Costanza: 12 settimane
  const days = new Set(ss.map(s => s.date));
  const startMon = E.addDays(t, -((E.weekday(t) + 6) % 7) - 7 * 11);
  let cells = '';
  for (let i = 0; i < 84; i++) { const k = E.addDays(startMon, i); cells += `<i class="${k > t ? 'out' : days.has(k) ? 'on' : ''}"></i>`; }
  const last30 = ss.filter(s => E.diffDays(t, s.date) < 30).length;
  html += `<h2>Costanza</h2><section class="card"><div class="row between"><div class="grid-days">${cells}</div>
    <div style="text-align:right"><div class="big-num">${last30}</div><div class="small muted">sedute<br>ultimi 30 giorni</div><p class="small muted" style="margin-top:6px">${ss.length} in totale</p></div></div></section>`;

  // Peso e vita
  const w = state.body.weights;
  const avgs = [];
  for (let i = 0; i < w.length; i++) avgs.push(E.weightAvg(state, w[i].date));
  const waist = state.body.waist;
  html += `<h2>Peso e vita</h2><section class="card">
    ${w.length ? `<div class="row between"><span>Media 7 giorni</span><b>${kg(Math.round(E.weightAvg(state, w[w.length - 1].date) * 10) / 10)} kg</b></div>${spark(avgs)}` : '<p class="muted">Inserisci il peso in Alimentazione.</p>'}
    <div class="row" style="margin-top:10px"><span class="grow">Vita (cm)</span><input style="width:110px" type="number" inputmode="decimal" step="0.5" placeholder="${waist.length ? kg(waist[waist.length - 1].cm) : 'cm'}" data-in="waist"></div>
    ${waist.slice(-4).reverse().map(x => `<p class="small muted">${x.date.split('-').reverse().slice(0, 2).join('/')}: ${kg(x.cm)} cm</p>`).join('')}
  </section>`;
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
    <div class="row"><span class="grow">Peso di stamattina, a digiuno</span><input style="width:110px" type="number" inputmode="decimal" step="0.1" placeholder="${todayW ? kg(todayW.kg) : 'kg'}" data-in="weight"></div>
    ${avg != null ? `<div class="kv" style="margin-top:8px"><span>Media 7 giorni</span><b>${kg(Math.round(avg * 10) / 10)} kg</b>
      ${avgOld != null ? `<span class="small muted" style="grid-column:1/-1">${avg - avgOld <= 0 ? '' : '+'}${kg(Math.round((avg - avgOld) * 10) / 10)} kg rispetto a 7 giorni prima</span>` : ''}</div>` : ''}
    <p class="small muted">Pesati 2–3 volte ogni 7 giorni. Ogni 14 giorni l’app corregge le calorie se il calo è troppo lento (meno di 0,4 kg a settimana) o troppo veloce (più di 1 kg).</p>
  </section>`;
}

// ---------- IMPOSTAZIONI ----------
function viewImpostazioni() {
  const s = state.settings;
  const planIds = [...new Set(MUSCLE_ORDER.flatMap(m => [s.plan[m].anchor, ...s.plan[m].comp]))].filter(id => EX[id] && EX[id].type !== 'time');
  return `<h1>Impostazioni</h1>
  <h2>Allenamento</h2><section class="card stack">
    <div class="row between"><span>Durata seduta</span><span class="seg">${[55, 65, 75].map(v => `<button class="${s.sessionMinutes === v ? 'on' : ''}" data-act="dur" data-v="${v}">${v}′</button>`).join('')}</span></div>
  </section>
  <h2>Dischi disponibili</h2><section class="card"><div class="chips">${[25, 20, 15, 10, 5, 2.5, 1.25].map(p => `<button class="${s.plates.includes(p) ? 'on' : ''}" data-act="plate" data-v="${p}">${kg(p)} kg</button>`).join('')}</div>
    <p class="small muted" style="margin-top:8px">Per gli attrezzi a dischi l’app ti dice cosa mettere per lato.</p></section>
  <h2>Attrezzi</h2><section class="card">
    <p class="small muted">Salto di carico, se si carica con i dischi e il peso a vuoto (slitta o bilanciere).</p>
    ${planIds.map(id => { const x = E.exSettings(state, id); return `<div class="exset"><span>${esc(EX[id].name)}</span>
      <select data-in="ex-inc" data-id="${id}">${[1, 1.25, 2, 2.5, 5].map(v => `<option value="${v}" ${v === x.inc ? 'selected' : ''}>+${kg(v)}</option>`).join('')}</select>
      <button class="${x.plates ? 'primary' : ''}" style="min-height:36px;padding:4px 10px;font-size:13px" data-act="ex-plates" data-id="${id}">dischi</button>
      ${x.plates ? `<span class="small muted" style="grid-column:1/2">peso a vuoto</span><input type="number" inputmode="decimal" value="${x.base}" data-in="ex-base" data-id="${id}">` : ''}</div>`; }).join('')}
  </section>
  <h2>Backup</h2><section class="card stack">
    <p class="small muted">I dati sono solo su questo telefono. Esporta un backup ogni tanto (per esempio su iCloud Drive).</p>
    <div class="row"><button class="grow" data-act="export">Esporta backup</button><label class="grow" style="display:block"><input type="file" accept="application/json,.json" data-in="import" hidden><span class="row" style="justify-content:center;background:var(--card2);border-radius:10px;min-height:44px">Importa backup</span></label></div>
    <button class="danger" data-act="reset">${ui.confirmReset ? 'Tocca di nuovo per cancellare tutto' : 'Cancella tutti i dati'}</button>
  </section>
  <p class="small muted" style="text-align:center;margin-top:16px">Sala Pesi · V1<br>Immagini esercizi: Free Exercise DB (pubblico dominio)</p>`;
}

// ---------- Render ----------
const VIEWS = { oggi: viewOggi, piano: viewPiano, progressi: viewProgressi, cibo: viewCibo, impostazioni: viewImpostazioni };
function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $('#view').innerHTML = VIEWS[ui.tab]();
  tickTimer();
}

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
  if (tab) { ui.tab = tab.dataset.tab; ui.confirmReset = false; window.scrollTo(0, 0); render(); return; }
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act; const c = state.current;
  const i = +el.dataset.i; const d = +el.dataset.d;
  const rerender = () => { if (c && !c.start) c.minutes = E.itemMinutes(c.items); save(); render(); };
  switch (a) {
    case 'intro-ok': state.seenIntro = true; return rerender();
    case 'cycle-ok': state.cycleBanner = null; return rerender();
    case 'force': state.current = E.compose(state, today()); state.current.forced = true; return rerender();
    case 'recompose': { const f = c?.forced; state.current = E.compose(state, today()); state.current.forced = f; toast('Seduta ricomposta'); return rerender(); }
    case 'ov-sets': c.items[i].planSets = Math.max(1, Math.min(8, c.items[i].planSets + d)); return rerender();
    case 'ov-del': c.items.splice(i, 1); return rerender();
    case 'ov-move': {
      const j = i + d; if (j < 0 || j >= c.items.length) return;
      [c.items[i], c.items[j]] = [c.items[j], c.items[i]];
      c.items.forEach(x => { if (x.ss && c.items.filter(y => y.ss === x.ss).length < 2) x.ss = null; });
      // una superserie deve restare contigua
      const groupsOk = c.items.every((x, k) => !x.ss || (c.items[k - 1]?.ss === x.ss) || (c.items[k + 1]?.ss === x.ss));
      if (!groupsOk) c.items.forEach(x => { if (x.ss && !(c.items[c.items.indexOf(x) - 1]?.ss === x.ss || c.items[c.items.indexOf(x) + 1]?.ss === x.ss)) x.ss = null; });
      return rerender();
    }
    case 'ov-swap': case 'swap': {
      const it = c.items[i]; const e = EX[it.id];
      const used = new Set(c.items.map(x => x.id));
      const plan = state.settings.plan[e.muscle];
      const pool = [e.sub, plan.anchor, ...plan.comp, ...EXERCISES.filter(x => x.muscle === e.muscle).map(x => x.id)].filter(x => EX[x] && !used.has(x));
      const nid = pool[0]; if (!nid) { toast('Nessuna alternativa disponibile'); return; }
      const sg = E.suggestion(state, nid);
      Object.assign(it, { id: nid, kg: sg.kg, reps: sg.reps, note: sg.note, sets: [] }); delete it.adjKg;
      ui.draft = null; toast(`Cambiato con ${EX[nid].name}`); return rerender();
    }
    case 'ov-join': { const tag = 'u' + Date.now(); c.items[i].ss = tag; c.items[i + 1].ss = tag; const m = Math.max(c.items[i].planSets, c.items[i + 1].planSets); c.items[i].planSets = c.items[i + 1].planSets = m; return rerender(); }
    case 'ov-split': { const tag = c.items[i].ss; c.items.forEach(x => { if (x.ss === tag) x.ss = null; }); return rerender(); }
    case 'start': c.start = Date.now(); c.cur = 0; c.forced = true; keepAwake(true); window.scrollTo(0, 0); return rerender();
    case 'goto': c.cur = +el.dataset.g; ui.editSet = null; ui.draft = null; ui.confirmEnd = false; window.scrollTo(0, 0); return rerender();
    case 'kg': { const it = c.items[ui.draft.i]; const inc = E.exSettings(state, it.id).inc; ui.draft.kg = Math.max(0, Math.round(((ui.draft.kg ?? 0) + d * inc) * 100) / 100); return render(); }
    case 'reps': { const it = c.items[ui.draft.i]; const step = EX[it.id].type === 'time' ? 5 : 1; ui.draft.reps = Math.max(1, ui.draft.reps + d * step); return render(); }
    case 'log': return logSet(el.dataset.eff);
    case 'edit-set': ui.editSet = { i, s: +el.dataset.s }; ui.draft = null; return render();
    case 'add-set': c.items[i].planSets++; ui.draft = null; return rerender();
    case 'skip': c.items[i].skipped = !c.items[i].skipped; ui.draft = null; {
      const { groups } = curGroup(c); const g = groups[c.cur];
      if (g.items.every(x => isDone(x) || x.skipped)) { const n = groups.findIndex((gr, gi) => gi > c.cur && !gr.items.every(x => isDone(x) || x.skipped)); if (n >= 0) c.cur = n; }
    } return rerender();
    case 'cardio-done': { const it = c.items[i]; it.sets = it.sets.length ? [] : [{ kg: 0, reps: it.minutes, eff: 'giusto', t: Date.now() }]; return rerender(); }
    case 'inc': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), inc: +el.dataset.v }; return rerender();
    case 'rest+': state.rest.end += 15000; save(); return tickTimer();
    case 'rest-skip': state.rest = null; save(); return tickTimer();
    case 'undo': if (ui.undo) { ui.undo(); ui.undo = null; $('#toast').hidden = true; } return;
    case 'end': ui.confirmEnd = true; window.scrollTo(0, 0); return render();
    case 'end-no': ui.confirmEnd = false; return render();
    case 'end-yes': return endSession();
    case 'freq': state.settings.freq = +el.dataset.v; return rerender();
    case 'unav': { const v = +el.dataset.v; const u = state.settings.unavailable; state.settings.unavailable = u.includes(v) ? u.filter(x => x !== v) : [...u, v]; if (state.settings.unavailable.length > 5) state.settings.unavailable = u; return rerender(); }
    case 'prio': state.settings.priority[el.dataset.m] = el.dataset.v; if (c && !c.start) state.current = null; return rerender();
    case 'comp': { const p = state.settings.plan[el.dataset.m]; const id = el.dataset.id; p.comp = p.comp.includes(id) ? p.comp.filter(x => x !== id) : [...p.comp, id]; if (c && !c.start) state.current = null; return rerender(); }
    case 'dur': state.settings.sessionMinutes = +el.dataset.v; if (c && !c.start) state.current = null; return rerender();
    case 'plate': { const v = +el.dataset.v; const p = state.settings.plates; state.settings.plates = p.includes(v) ? p.filter(x => x !== v) : [...p, v]; return rerender(); }
    case 'ex-plates': { const id = el.dataset.id; const x = state.settings.ex[id] || {}; state.settings.ex[id] = { ...x, plates: !x.plates }; return rerender(); }
    case 'export': download(`sala-pesi-backup-${today()}.json`, JSON.stringify(state), 'application/json'); return;
    case 'reset':
      if (!ui.confirmReset) { ui.confirmReset = true; return render(); }
      state = E.initialState(); ui.confirmReset = false; save(); toast('Dati cancellati'); return render();
  }
});

document.addEventListener('change', ev => {
  const el = ev.target; const k = el.dataset.in; if (!k) return;
  const num = () => parseFloat(String(el.value).replace(',', '.'));
  const c = state.current;
  switch (k) {
    case 'ov-add': if (el.value) { const sg = E.suggestion(state, el.value); c.items.push({ id: el.value, planSets: 3, kg: sg.kg, reps: sg.reps, note: sg.note, ss: null, sets: [], skipped: false }); c.minutes = E.itemMinutes(c.items); } break;
    case 'draft-kg': return; // gestito dall'evento input, senza ridisegnare (non perde il tocco sui bottoni)
    case 'note': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), note: el.value.trim() }; save(); return;
    case 'goal': state.cycle.goal = el.value.trim(); break;
    case 'anchor': { const p = state.settings.plan[el.dataset.m]; p.comp = p.comp.filter(x => x !== el.value); if (!p.comp.includes(p.anchor)) p.comp.unshift(p.anchor); p.anchor = el.value; if (c && !c.start) state.current = null; break; }
    case 'weight': case 'cp-weight': { const v = num(); if (!(v > 30 && v < 300)) return; const w = state.body.weights.filter(x => x.date !== today()); w.push({ date: today(), kg: v }); w.sort((a, b) => a.date.localeCompare(b.date)); state.body.weights = w; E.nutritionCheck(state); toast('Peso salvato'); break; }
    case 'waist': case 'cp-waist': { const v = num(); if (!(v > 40 && v < 200)) return; const w = state.body.waist.filter(x => x.date !== today()); w.push({ date: today(), cm: v }); state.body.waist = w; toast('Vita salvata'); break; }
    case 'ex-inc': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), inc: +el.value }; break;
    case 'ex-base': state.settings.ex[el.dataset.id] = { ...(state.settings.ex[el.dataset.id] || {}), base: num() || 0 }; break;
    case 'import': {
      const f = el.files[0]; if (!f) return;
      f.text().then(t => { try { state = E.migrate(JSON.parse(t)); save(); toast('Backup importato'); render(); } catch { toast('File non valido'); } });
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

// ---------- Avvio ----------
if (state.current?.start) { keepAwake(true); }
// Una seduta pianificata ma non iniziata di un giorno passato si ricompone
if (state.current && !state.current.start && state.current.date !== today()) state.current = null;
render();
// Aggiorna la vista al cambio di giorno o al ritorno nell'app
let lastDay = today();
setInterval(() => { if (today() !== lastDay) { lastDay = today(); render(); } }, 60000);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Nuova versione: si aggiorna alla prossima apertura'); });
    });
  }).catch(() => {});
}
