// Logica dell'app: composizione dinamica della seduta, progressione dei carichi,
// calendario consigliato, cicli, stime. Nessun accesso al DOM: testabile in Node.
import { EX, EXERCISES, MUSCLES, MUSCLE_ORDER, TYPE_RULES, TARGETS, DEFAULT_PRIORITY, DEFAULT_PLAN, START_LOADS, SEED, EQUIP_ORDER } from './catalog.js';

// ---------- Date ----------
export const pad = n => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const diffDays = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 864e5); // a - b
export const weekday = k => parseDay(k).getDay(); // 0 = domenica
export const DAY_NAMES = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
export const DAY_SHORT = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

// ---------- Numeri ----------
export const roundTo = (x, step) => Math.round(x / step) * step;
export const fmtKg = x => (x == null ? '–' : (Math.round(x * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 }));
export const epley = (kg, reps) => kg * (1 + reps / 30);
export const round10 = x => Math.round(x / 10) * 10;

// ---------- Stato iniziale ----------
// Versione del formato dei dati. Regole per non perdere mai nulla negli aggiornamenti:
// - le serie fatte (data, esercizio, kg, ripetizioni, sforzo) sono il dato vero e non si riscrivono;
//   cicli, record, kcal e calendario si ricalcolano da lì (replay);
// - ogni cambio di formato alza SCHEMA e aggiunge un passo in MIGRATIONS, che trasforma senza cancellare;
// - gli id degli esercizi non si cancellano né si rinominano: un esercizio tolto diventa hidden: true;
// - prima di ogni migrazione l'app salva una copia dei dati com'erano (vedi app.js, snapshot).
export const SCHEMA = 3;

export function initialState() {
  return {
    v: SCHEMA,
    settings: {
      freq: 3,
      days: [],                      // giorni della settimana in cui si pensa di andare (0 = domenica); vuoto = li propone l'app
      priority: { ...DEFAULT_PRIORITY },
      plan: JSON.parse(JSON.stringify(DEFAULT_PLAN)),
      ex: {},                        // per esercizio: { inc, plates, base, note }
      plates: [20, 10, 5, 2.5, 1.25],
      sessionMinutes: 60,            // durata abituale della seduta (si può cambiare ogni giorno)
    },
    sessions: [],
    current: null,
    cycle: { n: 1, level: 0, startCount: 0, length: 16, deloadLeft: 0, goal: 'Chest press da 55 a 60 kg × 10 · peso medio −3 kg', history: [] },
    body: { weights: [], waist: [] },
    nutrition: { kcal: 2150, protein: 160, fat: 60, last: '', lastAdj: null, proteinBaseWeight: null },
  };
}

// Passi di migrazione: MIGRATIONS[n] porta i dati dalla versione n alla n + 1
const MIGRATIONS = {
  1: s => {   // 1 → 2: da "giorni in cui non puoi" a "giorni in cui pensi di andare"
    if (s.settings) { s.settings.days = s.settings.days || []; delete s.settings.unavailable; }
    return s;
  },
  2: s => {   // 2 → 3: durata abituale tra quelle del selettore (30–90); tirate al mento tolte se erano quelle predefinite
    if (s.settings) {
      if (s.settings.sessionMinutes) s.settings.sessionMinutes = nearestDuration(s.settings.sessionMinutes);
      const lat = s.settings.plan?.laterali;
      if (lat && lat.Upright_Cable_Row === 1) delete lat.Upright_Cable_Row;
    }
    return s;
  },
};

// Un esercizio presente nello storico ma non più nel catalogo resta leggibile (nome salvato con la seduta)
function keepUnknown(s) {
  for (const ses of s.sessions || []) for (const it of ses.items || []) {
    if (!it || it.id === 'cardio' || EX[it.id]) continue;
    EX[it.id] = { id: it.id, name: it.name || it.id.replace(/_/g, ' '), muscle: it.muscle || null, type: 'iso', work: {}, equip: '', how: [], cues: [], hidden: true, unknown: true };
  }
}

export function migrate(s) {
  const base = initialState();
  if (!s || typeof s !== 'object') return base;
  s = JSON.parse(JSON.stringify(s));
  for (let n = s.v || 1; n < SCHEMA; n++) if (MIGRATIONS[n]) s = MIGRATIONS[n](s) || s;
  keepUnknown(s);
  const out = { ...base, ...s, v: Math.max(SCHEMA, s.v || 1) };
  out.settings = { ...base.settings, ...(s.settings || {}) };
  out.settings.priority = { ...base.settings.priority, ...(out.settings.priority || {}) };
  out.settings.plan = { ...base.settings.plan, ...(out.settings.plan || {}) };
  // vecchio formato { anchor, comp } → priorità per esercizio (3 alta, 2 media, 1 bassa)
  for (const m of Object.keys(out.settings.plan)) {
    const p = out.settings.plan[m];
    if (p && p.anchor) { const n = {}; for (const id of p.comp || []) n[id] = 2; n[p.anchor] = 3; out.settings.plan[m] = n; }
    for (const id of Object.keys(out.settings.plan[m])) if (!EX[id]) delete out.settings.plan[m][id];
  }
  out.cycle = { ...base.cycle, ...(s.cycle || {}) };
  out.body = { ...base.body, ...(s.body || {}) };
  out.nutrition = { ...base.nutrition, ...(s.nutrition || {}) };
  out.sessions = Array.isArray(s.sessions) ? s.sessions : [];
  return out;
}

// ---------- Impostazioni esercizio ----------
export function exSettings(state, id) {
  const e = EX[id];
  const s = state.settings.ex[id] || {};
  const defInc = e.inc || (e.equip === 'manubri' ? 2 : 2.5);
  const bar = e.equip === 'bilanciere';
  const lb = s.inc === 'lb';
  return { inc: lb ? 15 * LB : (s.inc ?? defInc), lb, incSet: s.inc != null, plates: s.plates ?? bar, base: s.base ?? (bar ? (e.bar ?? 20) : 0), note: s.note || '' };
}

// ---------- Pacco pesi in libbre ----------
// Molte macchine della palestra di Giabba hanno il pacco in libbre: 10, 20, 30, 40, 50, poi di 15 in 15.
// I dati restano sempre in kg (conversione esatta); l'app mostra le libbre, cioè il numero dove si mette il perno.
export const LB = 0.45359237;
export const STACK_LB = [10, 20, 30, 40, 50, ...Array.from({ length: 24 }, (_, i) => 65 + 15 * i)];
export const lbToKg = lb => Math.round(lb * LB * 100) / 100;
export const kgToLb = kg => Math.round(kg / LB);
const STACK_KG = STACK_LB.map(lbToKg);
export const canLb = id => ['macchina', 'cavo'].includes(EX[id]?.equip) && !['time', 'bw'].includes(EX[id]?.type);
// Carico più vicino che l'attrezzo permette davvero
export function snapLoad(state, id, kg) {
  const { lb, inc } = exSettings(state, id);
  if (kg == null) return kg;
  if (!lb) return roundTo(kg, inc);
  return STACK_KG.reduce((a, b) => Math.abs(b - kg) < Math.abs(a - kg) ? b : a);
}
// d scatti in su (d>0) o in giù (d<0) dal carico kg
export function stepLoad(state, id, kg, d) {
  const { lb, inc } = exSettings(state, id);
  if (!lb) return Math.max(0, Math.round(((kg ?? 0) + d * inc) * 100) / 100);
  let k = kg ? snapLoad(state, id, kg) : 0;   // si parte dal peso del pacco più vicino
  for (let i = 0; i < Math.abs(d); i++) {
    const nx = d > 0 ? STACK_KG.find(v => v > k + 0.01) : [...STACK_KG].reverse().find(v => v < k - 0.01);
    if (nx == null) break; k = nx;
  }
  return k;
}

// ---------- Priorità per esercizio ----------
// plan[muscolo][id] = 3 alta (sempre, misura i progressi), 2 media (a rotazione), 1 bassa (ogni tanto)
export const exPrio = (state, id) => (state.settings.plan[EX[id]?.muscle] || {})[id] || 0;
export const anchorsOf = (state, m) => EXERCISES.filter(e => e.muscle === m && !e.hidden && exPrio(state, e.id) === 3).map(e => e.id);
export const poolOf = (state, m) => EXERCISES.filter(e => e.muscle === m && !e.hidden && exPrio(state, e.id) > 0).map(e => e.id);

// ---------- Postazioni e cambi ----------
// Postazione: dove si fa l'esercizio. Cavi, manubri, bilanciere e corpo libero sono una postazione
// ciascuno; una macchina è una postazione a sé, salvo le macchine con più esercizi (station).
export const setupOf = id => { const e = EX[id]; if (!e) return id; return e.equip === 'macchina' ? `macchina:${e.station || e.id}` : e.equip; };
const SS_TYPES = ['iso', 'bw'];
const byPrio = state => (a, b) => exPrio(state, b) - exPrio(state, a) || EXERCISES.indexOf(EX[a]) - EXERCISES.indexOf(EX[b]);
const muscleList = (state, m, ok) => EXERCISES.filter(x => x.muscle === m && !x.hidden && ok(x)).map(x => x.id).sort(byPrio(state));

// "Cambia esercizio": il prossimo dello stesso muscolo con lo stesso attrezzo (in superserie: alla stessa postazione del compagno)
export function nextSameSetup(state, id, used = new Set(), partner = null) {
  const e = EX[id]; if (!e) return null;
  const ok = partner ? x => setupOf(x.id) === setupOf(partner) && SS_TYPES.includes(x.type) : x => x.equip === e.equip;
  // ordine fisso: prima i multiarticolari, poi gli isolamenti; dentro, per priorità
  const T = ['multi', 'bw', 'iso', 'core', 'time'];
  const ring = muscleList(state, e.muscle, x => x.id === id || ok(x)).sort((a, b) => T.indexOf(EX[a].type) - T.indexOf(EX[b].type));
  const at = ring.indexOf(id);
  return [...ring.slice(at + 1), ...ring.slice(0, Math.max(0, at))].find(x => x !== id && !used.has(x)) || null;
}
// "Cambia attrezzo": il miglior esercizio dello stesso muscolo con l'attrezzo successivo che ne ha uno
export function nextSetup(state, id, used = new Set()) {
  const e = EX[id]; if (!e) return null;
  const k = Math.max(0, EQUIP_ORDER.indexOf(e.equip));
  // prima un movimento simile (spinta con spinta, isolamento con isolamento), poi qualsiasi
  const similar = x => x.type === e.type || x.type === 'bw' || e.type === 'bw';
  for (const strict of [true, false]) {
    for (let i = 1; i < EQUIP_ORDER.length; i++) {
      const eq = EQUIP_ORDER[(k + i) % EQUIP_ORDER.length];
      const best = muscleList(state, e.muscle, x => x.equip === eq && !used.has(x.id) && (!strict || similar(x)))[0];
      if (best) return best;
    }
  }
  return null;
}
// Superserie: le due postazioni successive in cui entrambi i muscoli hanno un esercizio
export function nextSetupPair(state, a, b, used = new Set()) {
  const ea = EX[a], eb = EX[b]; if (!ea || !eb) return null;
  const pick = (m, setup) => muscleList(state, m, x => setupOf(x.id) === setup && SS_TYPES.includes(x.type) && !used.has(x.id))[0];
  const k = Math.max(0, EQUIP_ORDER.indexOf(ea.equip));
  for (let i = 1; i < EQUIP_ORDER.length; i++) {
    const eq = EQUIP_ORDER[(k + i) % EQUIP_ORDER.length];
    const setups = eq === 'macchina'
      ? [...new Set(EXERCISES.filter(x => x.equip === 'macchina' && x.station).map(x => setupOf(x.id)))]
      : [eq];
    for (const st of setups) {
      if (st === setupOf(a)) continue;
      const x = pick(ea.muscle, st), y = pick(eb.muscle, st);
      if (x && y) return [x, y];
    }
  }
  return null;
}

// Forma le superserie solo tra esercizi alla stessa postazione. Se non ce ne sono, cambia
// l'esercizio meno importante con uno della postazione dell'altro (un'alta solo con un'altra alta).
const PAIRS = [['bicipiti', 'tricipiti'], ['bicipiti', 'tricipiti'], ['laterali', 'posteriori'], ['petto', 'posteriori']];
// dry: solo per stimare i minuti (non crea esercizi nuovi)
function pairUp(state, items, today, dry = false) {
  const free = m => items.filter(it => it.id !== 'cardio' && !it.skipped && EX[it.id]?.muscle === m && SS_TYPES.includes(EX[it.id].type) && !it.ss);
  let n = 0;
  for (const [m1, m2] of PAIRS) {
    const A = free(m1), B = free(m2);
    if (!A.length || !B.length) continue;
    let pair = null;
    for (const a of A) { const b = B.find(x => setupOf(x.id) === setupOf(a.id)); if (b) { pair = [a, b]; break; } }
    if (!pair) {
      const used = new Set(items.map(i => i.id));
      const prio = it => exPrio(state, it.id);
      outer: for (const [keepL, swapL] of [[A, B], [B, A]]) {
        for (const keep of [...keepL].sort((x, y) => prio(y) - prio(x))) {
          for (const sw of [...swapL].sort((x, y) => prio(x) - prio(y))) {
            // un esercizio a priorità alta si cambia solo con un altro a priorità alta
            // un complementare si cambia con un altro complementare se c'è (la rotazione non torna all'àncora)
            const anc = id => prio(sw) < 3 && exPrio(state, id) === 3 ? 1 : 0;
            const alt = poolOf(state, EX[sw.id].muscle).filter(id => !used.has(id) && SS_TYPES.includes(EX[id].type) && setupOf(id) === setupOf(keep.id)
              && (prio(sw) < 3 || exPrio(state, id) >= 3))
              .sort((x, y) => anc(x) - anc(y) || exPrio(state, y) - exPrio(state, x) || lastUse(state, x) - lastUse(state, y))[0];
            if (!alt) continue;
            const nu = dry ? { ...sw, id: alt } : makeItem(state, alt, sw.planSets, today);
            items[items.indexOf(sw)] = nu;
            pair = [keep, nu]; break outer;
          }
        }
      }
    }
    if (pair) { const tag = `s${++n}`; pair[0].ss = pair[1].ss = tag; pair[0].planSets = pair[1].planSets = Math.max(pair[0].planSets, pair[1].planSets); }
  }
}

// ---------- Storico ----------
const workSets = it => (it.sets || []).filter(s => s && s.reps > 0);

// Prestazioni passate di un esercizio, dalla più recente
export function history(state, id) {
  const out = [];
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    for (const it of s.items) if (it.id === id && workSets(it).length) out.push({ date: s.date, deload: !!s.deload, sets: workSets(it) });
  }
  return out;
}

export const bestE1rm = sets => Math.max(0, ...sets.map(s => epley(s.kg || 0, s.reps)));

// Serie (frazionarie) per muscolo in un intervallo di giorni [from, to]
export function setsByMuscle(state, from, to) {
  const acc = Object.fromEntries(MUSCLE_ORDER.map(m => [m, 0]));
  for (const s of state.sessions) {
    if (s.date < from || s.date > to) continue;
    for (const it of s.items) {
      const n = workSets(it).length; const e = EX[it.id];
      if (!n || !e) continue;
      for (const [m, w] of Object.entries(e.work)) acc[m] += n * w;
    }
  }
  return acc;
}

// Ore dall'ultima volta che il muscolo ha lavorato in modo diretto
export function hoursSince(state, muscle, now = Date.now()) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    if (s.items.some(it => (EX[it.id]?.work[muscle] || 0) >= 1 && workSets(it).length)) return (now - (s.end || s.start)) / 36e5;
  }
  return Infinity;
}

export function daysSince(state, muscle, today = dayKey()) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    if (s.items.some(it => (EX[it.id]?.work[muscle] || 0) >= 1 && workSets(it).length)) return diffDays(today, s.date);
  }
  return Infinity;
}

// ---------- Calendario consigliato ----------
// Regole: al massimo "sedute" allenamenti in ogni finestra di 7 giorni (contando quelli fatti davvero),
// stacco preferito di almeno 7/sedute giorni (2 sedute → 3, 3 → 2, 4 → 1), giorni non disponibili saltati,
// mai 3 giorni di fila. Se lo stacco preferito porterebbe troppo in là, si accetta un giorno più vicino.
// Una seduta "mini" (pochi esercizi segnati, per esempio a casa) conta per i muscoli ma non come giorno di allenamento
export const counts = s => !s.mini;
const doneDays = state => new Set(state.sessions.filter(counts).map(s => s.date));

// Sedute a settimana: i giorni scelti in Ritmo, oppure il numero impostato
export const freqOf = state => { const d = state.settings.days || []; return d.length ? Math.min(5, Math.max(2, d.length)) : (state.settings.freq || 3); };

export function recommendedDays(state, today = dayKey(), count = 6) {
  const days = state.settings.days || [];
  const taken = doneDays(state);
  if (days.length) {          // giorni scelti: i prossimi di quei giorni non ancora fatti
    const out = [];
    for (let i = 0; i <= 60 && out.length < count; i++) { const k = addDays(today, i); if (days.includes(weekday(k)) && !taken.has(k)) out.push(k); }
    return out;
  }
  const freq = freqOf(state);
  const minGap = Math.max(1, Math.floor(7 / freq));
  const late = Math.ceil(7 / freq);
  const inWindow = k => { let n = 0; for (let i = 1; i <= 6; i++) if (taken.has(addDays(k, -i))) n++; return n; };
  const fits = k => !(taken.has(addDays(k, -1)) && taken.has(addDays(k, -2))) && inWindow(k) < freq;
  const next = (from, minDay) => {
    let relaxed = null;
    for (let g = 1; g <= 21; g++) {
      const k = from ? addDays(from, g) : addDays(minDay, g - 1);
      if (k < minDay || !fits(k)) continue;
      if (!from || g >= minGap) return relaxed && g > late ? relaxed : k;
      if (!relaxed) relaxed = k;
    }
    return relaxed;
  };
  const last = state.sessions.length ? state.sessions[state.sessions.length - 1].date : null;
  let cand = last ? next(last, addDays(last, 1)) : null;
  if (!cand || cand < today) cand = next(null, today);      // seduta saltata: primo giorno utile da oggi
  const out = [];
  while (cand && out.length < count) {
    out.push(cand); taken.add(cand);
    cand = next(cand, addDays(cand, 1));
  }
  return out;
}

// Giorni del calendario da "from" a "to" rispetto a oggi
export function strip(state, today = dayKey(), from = -3, to = 3) {
  const rec = new Set(recommendedDays(state, today, 12));
  const done = doneDays(state);
  const days = [];
  for (let i = from; i <= to; i++) {
    const k = addDays(today, i);
    const s = state.sessions.find(x => x.date === k);
    const real = s && !s.free && counts(s);
    const frac = real ? s.frac ?? 1 : null;      // seduta del piano: colore pieno o parziale
    days.push({ key: k, label: DAY_SHORT[weekday(k)], num: parseDay(k).getDate(), month: parseDay(k).getMonth(), year: parseDay(k).getFullYear(),
      today: i === 0, past: i < 0, done: done.has(k), frac, extra: !!s && !real, rec: !done.has(k) && rec.has(k) && i >= 0 });
  }
  return days;
}
export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function nextLabel(state, today = dayKey()) {
  const rec = recommendedDays(state, today);
  const k = rec[0];
  if (!k) return '';
  const d = diffDays(k, today);
  if (d === 0) return 'oggi';
  if (d === 1) return 'domani';
  return DAY_NAMES[weekday(k)] + (d > 6 ? ` ${parseDay(k).getDate()}` : '');
}

// ---------- Ciclo ----------
export function cycleInfo(state) {
  const c = state.cycle;
  const done = state.sessions.filter(s => !s.deload && counts(s)).length - c.startCount;
  return { n: c.n, session: Math.min(done + 1, c.length), done, length: c.length, deloadLeft: c.deloadLeft, goal: c.goal,
    checkpoint: done > 0 && done % 12 === 0 };
}

// Punto di controllo: dopo la 12a seduta del ciclo, finché non si inserisce la vita
export function checkpointDue(state) {
  const c = state.cycle;
  if (c.deloadLeft > 0) return false;
  const real = state.sessions.filter(s => !s.deload && counts(s));
  const twelfth = real[c.startCount + 11];
  if (!twelfth) return false;
  return !state.body.waist.some(w => w.date >= twelfth.date);
}

export const levelOf = state => Math.min(state.cycle.level, 2);

export function targetFor(state, m) {
  return TARGETS[state.settings.priority[m] || 'normale'][levelOf(state)];
}

// ---------- Progressione carichi (doppia progressione) ----------
export function stalled(state, id) {
  const lastDeload = [...state.sessions].reverse().find(s => s.deload)?.date || '';
  const h = history(state, id).filter(p => !p.deload && p.date > lastDeload);
  if (h.length < 4) return false;
  // a tempo o a corpo libero il "carico" sono le ripetizioni (o i secondi)
  const score = ['time', 'bw'].includes(EX[id]?.type) ? sets => Math.max(...sets.map(x => x.reps)) : bestE1rm;
  const ref = score(h[3].sets);
  return h.slice(0, 3).every(p => score(p.sets) <= ref + 0.01);
}

// Pausa più lunga (in giorni) tra due sedute qualsiasi, da una data fino a oggi
export function longestBreak(state, from, today = dayKey()) {
  const days = [...new Set(state.sessions.map(s => s.date).filter(d => d > from && d < today))].sort();
  let prev = from, max = 0;
  for (const d of [...days, today]) { max = Math.max(max, diffDays(d, prev)); prev = d; }
  return max;
}

export function suggestion(state, id, today = dayKey()) {
  const e = EX[id]; const r = TYPE_RULES[e.type];
  const down = (k0, f) => { const k = snapLoad(state, id, k0 * f); return k < k0 ? k : stepLoad(state, id, k0, -1); };
  const h = history(state, id).filter(p => !p.deload);
  const isTime = e.type === 'time';
  const noKg = isTime || e.type === 'bw';            // a tempo o a corpo libero: si progredisce con tempo/ripetizioni
  if (!h.length) {
    const kg = noKg ? 0 : snapLoad(state, id, START_LOADS[id] ?? null);
    return { kg, reps: r.min, note: kg == null ? 'Prima serie di prova: scegli tu il carico' : '', last: null };
  }
  const last = h[0]; const sets = last.sets;
  const kg0 = sets[0].kg || 0;
  const minReps = Math.min(...sets.map(s => s.reps));
  const gap = longestBreak(state, last.date, today);
  let kg = kg0, reps = Math.max(r.min, Math.min(r.max, minReps + (isTime ? 5 : 1))), note = '';
  const allTop = sets.every(s => s.reps >= r.max) && sets.every(s => s.eff !== 'limite');
  const allEasy = sets.every(s => s.eff === 'facile');
  if (gap >= 28) { kg = down(kg0, 0.8); reps = r.min; note = noKg ? 'Ripresa dopo una pausa: si riparte dal minimo' : 'Ripresa dopo una pausa: −20%'; }
  else if (gap >= 14) { kg = down(kg0, 0.9); reps = r.min; note = noKg ? 'Ripresa dopo una pausa: si riparte dal minimo' : 'Ripresa dopo una pausa: −10%'; }
  else if (stalled(state, id)) { kg = down(kg0, 0.9); reps = r.min; note = noKg ? 'Fermo da 3 sedute: si riparte dal minimo' : 'Fermo da 3 sedute: −10% e si risale'; }
  else if (allTop) {
    if (noKg) { reps = r.max; note = isTime ? 'Tempo al massimo: prova una variante più dura' : 'Ripetizioni al massimo: prova una variante più dura o aggiungi peso'; }
    else {
      const steps = allEasy ? 2 : 1;
      const one = stepLoad(state, id, kg0, 1);
      kg = exSettings(state, id).lb ? one : Math.min(stepLoad(state, id, kg0, steps), Math.max(one, snapLoad(state, id, kg0 * 1.1)));
      reps = r.min; note = exSettings(state, id).lb ? `Sali di carico: +${kgToLb(kg) - kgToLb(snapLoad(state, id, kg0))} lb` : `Sali di carico: +${fmtKg(kg - kg0)} kg`;
    }
  } else if (sets[0].reps < r.min && sets[0].eff === 'limite' && !noKg) {
    kg = Math.max(stepLoad(state, id, 0, 1), down(kg0, 0.925)); reps = r.min; note = 'Troppo pesante l’ultima volta: carico ridotto';
  }
  if (noKg) kg = 0;
  else if (kg && exSettings(state, id).lb) kg = snapLoad(state, id, kg);   // vale anche per i carichi segnati prima di passare alle libbre
  return { kg, reps, note, last };
}

export function warmups(state, id, kg) {
  const e = EX[id];
  if (e.type !== 'multi' || !kg) return [];
  return [{ kg: snapLoad(state, id, kg * 0.5), reps: 10 }, { kg: snapLoad(state, id, kg * 0.75), reps: 5 }];
}

export function platesPerSide(state, id, kg) {
  const s = exSettings(state, id);
  if (!s.plates || kg == null) return null;
  let side = (kg - s.base) / 2;
  const out = [];
  if (side <= 0) return { plates: out, rest: 0 };
  for (const p of [...state.settings.plates].sort((a, b) => b - a)) {
    while (side >= p - 1e-9) { out.push(p); side -= p; }
  }
  return { plates: out, rest: Math.round(side * 100) / 100 };
}

// ---------- Stime ----------
export function bodyWeight(state) {
  const w = state.body.weights;
  if (!w.length) return 87;
  const lastDay = w[w.length - 1].date;
  const recent = w.filter(x => diffDays(lastDay, x.date) < 7);
  return recent.reduce((a, b) => a + b.kg, 0) / recent.length;
}

export function weightAvg(state, endDay) {
  const w = state.body.weights.filter(x => x.date <= endDay && diffDays(endDay, x.date) < 7);
  return w.length ? w.reduce((a, b) => a + b.kg, 0) / w.length : null;
}

export function kcalRange(state, minutes, { superset = false, hard = false } = {}) {
  const w = bodyWeight(state); const h = minutes / 60;
  const hi = hard ? 6.0 : superset ? 5.8 : 5.0;
  return [round10(w * h * 3.5), round10(w * h * hi)];
}

// warm: minuti di cardio leggero iniziale (8, meno nelle sedute corte)
export function itemMinutes(items, warm = 8) {
  let sets = 0;
  const groups = groupItems(items);
  for (const g of groups) {
    if (g.cardio) { sets += (g.items[0].minutes || 0) / 2.5; continue; }
    if (g.items.length > 1) sets += Math.max(...g.items.map(i => i.planSets)) * 1.5;
    else sets += g.items[0].planSets;
  }
  return Math.round(warm + sets * 2.5);
}

// ---------- Durata della seduta ----------
// Si sceglie ogni giorno (30–90 min, predefinita quella abituale delle impostazioni). Quello che non ci sta
// resta in arretrato e passa alle sedute successive grazie alla finestra mobile.
export const DURATIONS = [30, 45, 60, 75, 90];
export const nearestDuration = m => DURATIONS.reduce((a, b) => Math.abs(b - m) < Math.abs(a - m) ? b : a);
export const warmMin = d => d <= 30 ? 3 : d <= 45 ? 5 : 8;
export const usualMinutes = state => state.settings.sessionMinutes || 60;
export const planMinutes = (state, c) => itemMinutes(c.items, warmMin(c.duration || usualMinutes(state)));
// Durata media delle ultime 6 sedute (quella scelta; le sedute di prima valgono la durata abituale)
export function avgDuration(state, before = '9999-12-31') {
  const usual = usualMinutes(state);
  const last = state.sessions.filter(s => counts(s) && !s.free && !s.deload && s.date < before).slice(-6);
  return last.length ? last.reduce((a, s) => a + (s.duration || usual), 0) / last.length : usual;
}

// Raggruppa gli esercizi in superserie consecutive
export function groupItems(items) {
  const out = [];
  items.forEach((it, i) => {
    const prev = out[out.length - 1];
    if (prev && it.ss && prev.items[0].ss === it.ss) prev.items.push(it);
    else out.push({ items: [it], start: i, cardio: it.id === 'cardio' });
  });
  return out;
}

// ---------- Composizione della seduta ----------
const PRIO_RANK = { alta: 0, normale: 1, minima: 2 };
const LEGS = ['quadricipiti', 'femorali', 'glutei', 'polpacci'];

function lastUse(state, id) {
  for (let i = state.sessions.length - 1; i >= 0; i--) if (state.sessions[i].items.some(it => it.id === id)) return i;
  return -1;
}

// Sedute (con lavoro su quel muscolo) passate dall'ultima volta che si è fatto l'esercizio
function sinceUse(state, id, m) {
  let n = 0;
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    if (s.items.some(it => it.id === id && workSets(it).length)) return n;
    if (s.items.some(it => (EX[it.id]?.work[m] || 0) >= 1 && workSets(it).length)) n++;
  }
  return Infinity;
}

function makeItem(state, id, sets, today) {
  const sg = suggestion(state, id, today);
  return { id, planSets: sets, kg: sg.kg, reps: sg.reps, note: sg.note, ss: null, sets: [], skipped: false };
}

export function seedSession(state, today) {
  const lastSeed = [...state.sessions].reverse().find(s => s.seed)?.seed;
  const which = lastSeed === 'A' ? 'B' : 'A';
  const items = SEED[which].map(x => ({ ...makeItem(state, x.id, x.sets, today), ss: x.ss ? `${which}${x.ss}` : null }));
  return { items, seed: which, reason: `Seduta tipo ${which}: le prime sedute servono a fissare i carichi di partenza` };
}

export function compose(state, today = dayKey(), now = Date.now(), duration = null) {
  const cyc = cycleInfo(state);
  const deload = state.cycle.deloadLeft > 0;
  const nonDeload = state.sessions.filter(s => !s.deload && counts(s)).length;
  const dur = duration || usualMinutes(state);
  const warm = warmMin(dur);
  let res;
  if (nonDeload < 4) {
    res = seedSession(state, today);
    res.want = pairedMinutes(state, res.items, warm, false);
    res.cut = fitTime(state, res.items, windowCtx(state, today), dur + 2, warm, false);
  } else res = dynamicSession(state, today, now, dur);
  if (deload) {
    res.items.forEach(it => { if (it.id !== 'cardio') it.planSets = Math.max(1, Math.round(it.planSets / 2)); });
    res.reason = `Scarico (${4 - state.cycle.deloadLeft} di 3): metà serie, stessi carichi, sforzo facile o giusto`;
  }
  const minutes = itemMinutes(res.items, warm);
  return { date: today, items: res.items, reason: res.reason, seed: res.seed || null, deload, cycle: cyc.n, minutes, duration: dur, want: res.want || null, cur: 0, view: 'list' };
}

// ---------- Tagli per stare nel tempo ----------
// Pavimento dei muscoli a priorità minima: 2 serie negli ultimi 7 giorni, contando le indirette
// (la leg press vale mezza serie per glutei e femorali).
export const FLOOR = 2;
const hasCompoundAnchor = (state, m) => anchorsOf(state, m).some(id => EX[id].type === 'multi');

// Quando c'è posto per un solo esercizio di un muscolo: àncora una volta, la volta dopo il complementare
// usato meno di recente (così non spariscono petto alto, brachiale, capo lungo del tricipite)
function anchorTurn(state, m) {
  const a = anchorsOf(state, m);
  return !a.length || !a.some(id => sinceUse(state, id, m) === 0);
}
function keeper(state, m, exs) {
  const A = exs.filter(x => exPrio(state, x.id) === 3), C = exs.filter(x => exPrio(state, x.id) < 3);
  if (!A.length || !C.length) return [...exs].sort((a, b) => exPrio(state, b.id) - exPrio(state, a.id))[0];
  const lru = (a, b) => lastUse(state, a.id) - lastUse(state, b.id);
  return anchorTurn(state, m) ? [...A].sort(lru)[0] : [...C].sort(lru)[0];
}

// Finestra per muscolo: serie fatte nei giorni prima (oggi escluso: oggi conta il piano), serie attese
// nelle prossime sedute (con la durata media delle ultime 6), obiettivi del livello e del ciclo 1
function windowCtx(state, today) {
  const freq = freqOf(state);
  const done = setsByMuscle(state, addDays(today, -3), addDays(today, -1));
  const win7 = setsByMuscle(state, addDays(today, -6), addDays(today, -1));
  const future = recommendedDays(state, today).filter(k => k > today && diffDays(k, today) <= 3).length;
  const f = Math.min(1, avgDuration(state, today) / usualMinutes(state));
  const target = {}, base = {}, ahead = {};
  for (const m of MUSCLE_ORDER) {
    target[m] = targetFor(state, m);
    base[m] = TARGETS[state.settings.priority[m] || 'normale'][0];
    ahead[m] = target[m] / freq * future * f;
  }
  return { freq, done, win7, future, target, base, ahead };
}

// Minuti di quello che resta da fare (serie non ancora segnate), contando le superserie che si formeranno
const restSets = it => it.id === 'cardio' || it.skipped ? 0 : Math.max(0, it.planSets - (it.sets?.length || 0));
function pairedMinutes(state, items, warm, pair = true) {
  const t = items.map(i => ({ ...i }));
  if (pair) pairUp(state, t, null, true);
  return itemMinutes(t.map(i => i.id === 'cardio' ? { ...i, minutes: i.sets?.length ? 0 : i.minutes } : { ...i, planSets: restSets(i) }), warm);
}

// Ordine dei tagli: prima le priorità minime fino al pavimento, poi le normali fino all'obiettivo del ciclo 1,
// poi le alte (una serie a testa, a turno) fino all'obiettivo del ciclo 1. Se ancora non basta (sedute corte):
// le normali a 2 serie, le alte a 3, via le gambe, via le normali senza multiarticolare (addome, deltoide
// posteriore), le alte a 2, via il resto. La schiena resta anche nelle sedute da 30 minuti.
const STAGES = [['minima', 'floor'], ['normale', 'base'], ['alta', 'base'], ['normale', 2], ['alta', 3], ['minima', 0], ['normale', 0, 'iso'], ['alta', 2], ['normale', 0], ['alta', 0]];
function fitTime(state, items, ctx, budget, warm, pair = true) {
  const fits = () => pairedMinutes(state, items, warm, pair) <= budget;
  if (fits()) return 0;
  const P = state.settings.priority;
  const tot = it => it.id === 'cardio' ? 0 : it.skipped ? (it.sets?.length || 0) : Math.max(it.planSets, it.sets?.length || 0);
  const planned = () => {
    const acc = Object.fromEntries(MUSCLE_ORDER.map(m => [m, 0]));
    for (const it of items) if (it.id !== 'cardio' && EX[it.id]) for (const [m, w] of Object.entries(EX[it.id].work)) acc[m] += w * tot(it);
    return acc;
  };
  // Una serie in meno per il muscolo: si accorcia l'esercizio più lungo; a 2 serie si toglie un esercizio
  // (resta quello che tocca secondo la rotazione àncora / complementare)
  const step = m => {
    const exs = items.filter(it => it.id !== 'cardio' && EX[it.id]?.muscle === m && restSets(it) > 0);
    if (!exs.length) return null;
    const big = [...exs].sort((a, b) => b.planSets - a.planSets)[0];
    if (big.planSets > 2) return { it: big, n: 1, apply: () => { big.planSets--; } };
    // un esercizio già iniziato resta (si toglie per ultimo)
    const started = exs.filter(x => x.sets?.length);
    const keep = exs.length > 1 ? (started[0] || keeper(state, m, exs)) : null;
    const others = exs.filter(x => x !== keep), fresh = others.filter(x => !x.sets?.length);
    const drop = (fresh.length ? fresh : others).sort((a, b) => exPrio(state, a.id) - exPrio(state, b.id))[0];
    return { it: drop, n: restSets(drop), apply: () => { if (drop.sets?.length) drop.planSets = drop.sets.length; else items.splice(items.indexOf(drop), 1); } };
  };
  const ok = (m, s, kind) => {
    const pl = planned(), work = EX[s.it.id].work;
    if (kind === 'floor') return Object.entries(work).every(([mm, w]) => P[mm] !== 'minima' || ctx.win7[mm] + pl[mm] - w * s.n >= FLOOR - 1e-9);
    if (kind === 'base') return ctx.done[m] + ctx.ahead[m] + pl[m] - (work[m] || 0) * s.n >= ctx.base[m] - 1e-9;
    const direct = items.filter(it => it.id !== 'cardio' && EX[it.id]?.muscle === m).reduce((a, it) => a + tot(it), 0);
    return direct - s.n >= kind;
  };
  let cut = 0;
  for (const [prio, kind, only] of STAGES) {
    for (let moved = true; moved;) {
      moved = false;
      const pl = planned();
      // a turno, partendo dal muscolo meno in arretrato
      const cov = m => kind === 'floor' ? ctx.win7[m] + pl[m] : (ctx.done[m] + ctx.ahead[m] + pl[m]) / ctx.target[m];
      for (const m of MUSCLE_ORDER.filter(x => P[x] === prio && (!only || !hasCompoundAnchor(state, x))).sort((a, b) => cov(b) - cov(a))) {
        const s = step(m);
        if (!s || !ok(m, s, kind)) continue;
        s.apply(); cut += s.n; moved = true;
        if (fits()) return cut;
      }
    }
  }
  return cut;
}

// "Ho fretta": quello che resta si taglia per stare nei minuti indicati, con le stesse regole
export function trimPlan(state, cur, left, now = Date.now()) {
  const logged = cur.items.some(it => it.sets?.length);
  const warm = logged ? 0 : warmMin(left);
  cur.items = cur.items.filter(it => it.id !== 'cardio' || it.sets?.length);   // il cardio extra si toglie per primo
  const cut = fitTime(state, cur.items, windowCtx(state, cur.date), left + 1, warm, !logged);
  if (!logged) pairUp(state, cur.items, cur.date);
  for (const it of cur.items) if (it.ss && cur.items.filter(x => x.ss === it.ss).length < 2) it.ss = null;
  const rest = pairedMinutes(state, cur.items, warm, false);
  if (left - rest >= 10) cur.items.push({ id: 'cardio', minutes: Math.min(30, Math.floor((left - rest) / 5) * 5), planSets: 0, sets: [], skipped: false, ss: null });
  const ts = cur.items.flatMap(it => (it.sets || []).map(x => x.t)).filter(Boolean);
  const spent = ts.length ? (now - Math.min(...ts)) / 60000 + 8 : 0;
  cur.duration = Math.max(15, Math.round(spent + left));
  cur.minutes = Math.round(spent) + itemMinutes(cur.items.map(i => i.id === 'cardio' ? { ...i, minutes: i.sets?.length ? 0 : i.minutes } : { ...i, planSets: restSets(i) }), warm);
  return cut;
}

function dynamicSession(state, today, now, dur) {
  const { settings } = state;
  const ctx = windowCtx(state, today);
  const { freq, done, win7, target } = ctx;
  const need = {}, light = [];
  for (const m of MUSCLE_ORDER) {
    const quota = target[m] / freq;
    let n;
    // Gambe a priorità minima senza multiarticolare (abductor, calf, leg curl): solo sotto il pavimento
    if (settings.priority[m] === 'minima' && !hasCompoundAnchor(state, m)) n = FLOOR - win7[m];
    else n = Math.min(target[m] - done[m] - ctx.ahead[m], target[m] * 0.6, 10);
    // Recupero: allenato ieri (o oggi) → al massimo un terzo della quota; tra 24 e 36 ore → metà
    const h = hoursSince(state, m, now);
    const d = daysSince(state, m, today);
    if (d <= 1 && h < 24) { n = Math.min(n, quota / 3); if (done[m] >= 2) light.push(m); }
    else if (d <= 1) { n = Math.min(n, quota / 2); if (done[m] >= 2) light.push(m); }
    need[m] = Math.max(0, n);
  }
  const start = { ...need };

  // Ordine di lavoro: prima i muscoli con multiarticolari (danno serie indirette), poi priorità e arretrato
  const order = [...MUSCLE_ORDER].sort((a, b) =>
    (hasCompoundAnchor(state, b) - hasCompoundAnchor(state, a)) ||
    (PRIO_RANK[settings.priority[a]] - PRIO_RANK[settings.priority[b]]) ||
    (need[b] - need[a]));

  const items = []; const used = new Set();
  for (const m of order) {
    let r = need[m];
    if (r < 1) continue;
    let total = Math.min(10, Math.max(2, Math.round(r)));
    // Candidati: prima le priorità alte, poi le medie a rotazione, le basse solo ogni tanto
    // (una bassa passa davanti alle medie se non si fa da almeno 6 sedute di quel muscolo)
    const lru = (a, b) => lastUse(state, a) - lastUse(state, b);
    const by = lv => poolOf(state, m).filter(id => exPrio(state, id) === lv && !used.has(id)).sort(lru);
    const low = by(1); const due = low.filter(id => sinceUse(state, id, m) >= 6).slice(0, 1);
    const anchors = by(3), comps = [...due, ...by(2), ...low.filter(id => !due.includes(id))];
    // 1 esercizio fino a 4 serie, 2 fino a 8, poi 3 (se ce ne sono abbastanza); max 5 serie per esercizio
    const want = total <= 4 ? 1 : total <= 8 ? 2 : 3;
    // con un solo esercizio si alterna: àncora una volta, la volta dopo il complementare usato meno di recente
    const cands = want === 1 && comps.length && !anchorTurn(state, m) ? [...comps, ...anchors] : [...anchors, ...comps];
    if (!cands.length) continue;
    const k = Math.max(1, Math.min(want, cands.length));
    total = Math.min(total, k * 5);
    const chunks = Array.from({ length: k }, (_, i) => Math.floor(total / k) + (i < total % k ? 1 : 0));
    chunks.forEach((n, i) => {
      const id = cands[i]; if (!id || n < 1) return;
      used.add(id);
      items.push(makeItem(state, id, Math.max(2, n), today));
      for (const [mm, w] of Object.entries(EX[id].work)) need[mm] -= w * Math.max(2, n);
    });
  }

  // Tempo: si taglia nell'ordine delle priorità finché la seduta sta nei minuti di oggi
  const warm = warmMin(dur);
  const wantMin = pairedMinutes(state, items, warm);
  const cut = fitTime(state, items, ctx, dur + 2, warm);

  // Superserie alla stessa postazione: bicipiti + tricipiti, laterali + posteriori, petto + posteriori
  pairUp(state, items, today);

  // Ordine: multi prioritari, altri multi, isolamenti (superserie insieme), addome, gambe
  const rank = it => {
    const e = EX[it.id];
    if (LEGS.includes(e.muscle)) return 40 + (e.type === 'multi' ? 0 : 1);
    if (e.muscle === 'addome') return 30;
    if (e.type === 'multi') return settings.priority[e.muscle] === 'alta' ? 0 : 10;
    return 20 + PRIO_RANK[settings.priority[e.muscle]];
  };
  items.sort((a, b) => rank(a) - rank(b) || (a.ss || '').localeCompare(b.ss || ''));
  // tieni vicine le coppie in superserie
  const sorted = [];
  for (const it of items) {
    if (sorted.includes(it)) continue;
    sorted.push(it);
    if (it.ss) items.filter(x => x !== it && x.ss === it.ss).forEach(x => sorted.push(x));
  }

  // Il tempo che avanza va al cardio (fino a 30 minuti)
  const left = dur - itemMinutes(sorted, warm);
  if (left >= 10) sorted.push({ id: 'cardio', minutes: Math.min(30, Math.floor(left / 5) * 5), planSets: 0, sets: [], skipped: false, ss: null });

  // Una riga che spiega il perché
  const behind = MUSCLE_ORDER.filter(m => settings.priority[m] !== 'minima' && start[m] >= 2 && sorted.some(it => EX[it.id]?.muscle === m))
    .sort((a, b) => start[b] / target[b] - start[a] / target[a]);
  const names = [];
  for (const m of behind) {
    const n = (m === 'bicipiti' || m === 'tricipiti') ? 'braccia' : (m === 'laterali' || m === 'posteriori') ? 'spalle' : MUSCLES[m].name.toLowerCase();
    if (!names.includes(n)) names.push(n);
    if (names.length === 2) break;
  }
  const parts = [];
  if (names.length) parts.push(cap(names.join(' e ')) + ' in arretrato');
  const lightBig = light.filter(m => ['petto', 'schiena', 'quadricipiti'].includes(m)).map(m => m === 'quadricipiti' ? 'gambe' : MUSCLES[m].name.toLowerCase());
  if (lightBig.length) parts.push(`${lightBig.join(' e ')} allenat${lightBig.length > 1 || lightBig[0] === 'gambe' ? 'e' : 'o'} ieri, versione leggera`);
  if (cut >= 3 && dur < usualMinutes(state)) parts.push(`${dur} minuti: il resto passa alle prossime sedute`);
  if (!sorted.filter(i => i.id !== 'cardio').length) parts.push('Volume già coperto: oggi cardio e recupero');
  else if (sorted.some(i => i.id === 'cardio')) parts.push('cardio in coda');
  return { items: sorted, want: wantMin, cut, reason: parts.join(' · ') || 'Seduta bilanciata su tutti i muscoli' };
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Fine seduta ----------
export function finishSession(state, cur, now = Date.now()) {
  const items = cur.items.map(it => ({ id: it.id, ss: it.ss, planSets: it.planSets, sets: (it.sets || []).filter(Boolean), skipped: it.skipped, minutes: it.minutes }));
  const all = items.flatMap(i => i.sets);
  if (!all.length) return null;                       // nessuna serie: la seduta non conta
  const start = cur.start || now;
  const lastT = Math.max(start, ...all.map(x => x.t || 0));
  const cardioMin = items.filter(i => i.id === 'cardio' && i.sets.length).reduce((a, i) => a + (i.minutes || 0), 0);
  // se Termina arriva molto dopo l'ultima serie (app dimenticata aperta), la fine è l'ultima serie
  const end = now - lastT > 30 * 60000 ? lastT + (cardioMin + 2) * 60000 : now;
  const session = { id: now, date: cur.date, start, end, items, deload: cur.deload, seed: cur.seed, cycle: state.cycle.n };
  if (cur.duration) session.duration = cur.duration;
  if (cur.want) session.want = cur.want;
  // record: miglior massimale stimato rispetto allo storico precedente
  const records = [];
  for (const it of items) {
    if (!EX[it.id] || !it.sets.length || (EX[it.id].type === 'time' || EX[it.id].type === 'bw')) continue;
    const prev = history(state, it.id);
    const prevBest = Math.max(0, ...prev.map(p => bestE1rm(p.sets)));
    const now1 = bestE1rm(it.sets);
    if (prev.length && now1 > prevBest + 0.01) records.push({ id: it.id, e1rm: now1 });
  }
  state.sessions.push(session);
  const minutes = Math.max(1, Math.round((session.end - session.start) / 60000));
  const hard = all.length && all.filter(s => s.eff !== 'facile').length / all.length > 0.5;
  const kcal = kcalRange(state, minutes, { superset: items.some(i => i.ss), hard });
  session.kcal = kcal; session.minutes = minutes;

  advanceCycle(state, !!cur.deload, cur.date);
  return { id: session.id, minutes, kcal, records, sets: all.length };
}

// Ciclo e scarico dopo una seduta (già aggiunta a state.sessions)
function advanceCycle(state, deload, date) {
  const c = state.cycle;
  const startDeload = stalls => {
    c.deloadLeft = 3;
    // si decide ora se il ciclo è andato bene (durante lo scarico gli stalli si azzerano)
    const sets = state.sessions.filter(s => s.cycle === c.n && !s.deload).flatMap(s => s.items.filter(i => i.id !== 'cardio').flatMap(i => i.sets));
    c.levelUp = !!sets.length && sets.filter(x => x.eff === 'giusto').length / sets.length >= 0.5 && stalls < 3 && levelFits(state, c.n, c.level + 1);
  };
  const stallCount = () => Object.keys(EX).filter(id => stalled(state, id)).length;
  if (deload) {
    if (!c.deloadLeft) startDeload(stallCount());       // solo ricostruendo dopo un'eliminazione
    c.deloadLeft = Math.max(0, c.deloadLeft - 1);
    if (c.deloadLeft === 0) newCycle(state, date);
  } else {
    const info = cycleInfo(state);
    const stalls = stallCount();
    if (info.done >= c.length || (stalls >= 3 && info.done >= 6)) startDeload(stalls);
  }
}

// Il livello successivo si sblocca solo se sta nel tempo: i minuti che le sedute del ciclo chiedevano
// (prima dei tagli), portati al volume del livello successivo, contro la durata scelta in media
function levelFits(state, n, level) {
  const P = state.settings.priority;
  const vol = L => MUSCLE_ORDER.reduce((a, m) => a + (P[m] === 'minima' ? 0 : TARGETS[P[m] || 'normale'][L] || 0), 0);
  if (level > 2 || !vol(level - 1)) return true;
  const ss = state.sessions.filter(s => s.cycle === n && !s.deload && counts(s) && !s.free && s.want && s.duration);
  if (ss.length < 3) return true;
  const avg = k => ss.reduce((a, s) => a + s[k], 0) / ss.length;
  const warm = warmMin(avg('duration'));
  return warm + (avg('want') - warm) * vol(level) / vol(level - 1) <= avg('duration') + 3;
}

// Ricalcola cicli e scarichi rigiocando le sedute nell'ordine. L'ultima seduta conserva lo stato
// del ciclo di prima (cycleBefore), così si può aggiornare mentre ci si allena.
function replay(state, list) {
  const old = state.cycle;
  state.cycle = { n: 1, level: 0, startCount: 0, length: old.length, deloadLeft: 0, goal: old.goal, history: [], levelUp: false };
  state.sessions = [];
  for (const s of list) {
    delete s.cycleBefore;
    s.cycleBefore = JSON.parse(JSON.stringify(state.cycle));
    s.cycle = state.cycle.n; state.sessions.push(s);
    if (counts(s)) advanceCycle(state, !!s.deload, s.date);
  }
  list.slice(0, -1).forEach(s => delete s.cycleBefore);
}

// Elimina una seduta e ricalcola cicli e scarichi
export function deleteSession(state, id) {
  const rest = state.sessions.filter(s => s.id !== id);
  if (rest.length === state.sessions.length) return false;
  replay(state, rest);
  return true;
}

export const MINI_SETS = 6;     // sotto questo numero di serie la giornata è "extra", non una seduta del ciclo
const isItemDone = it => it.id === 'cardio' ? it.sets.length > 0 : it.sets.length >= it.planSets;

// Salva (o aggiorna) la giornata di allenamento a ogni serie: niente "Termina" obbligatorio.
// Una sola seduta per data; tutto ciò che è segnato nel giorno finisce lì.
export function recordDay(state, cur, now = Date.now()) {
  // con ogni esercizio si salva anche nome e muscolo: lo storico resta leggibile anche se il catalogo cambia
  const items = cur.items.map(it => ({ id: it.id, name: EX[it.id]?.name || (it.id === 'cardio' ? 'Cardio' : it.name), muscle: EX[it.id]?.muscle || null,
    ss: it.ss || null, planSets: it.planSets, sets: (it.sets || []).filter(Boolean), skipped: !!it.skipped, minutes: it.minutes }));
  const all = items.flatMap(i => i.sets);
  let s = state.sessions.find(x => x.date === cur.date);
  if (!all.length) { if (s) deleteSession(state, s.id); return null; }
  const before = state.cycle.n;
  if (!s) {
    state.sessions.forEach(x => delete x.cycleBefore);
    s = { id: now, date: cur.date, cycleBefore: JSON.parse(JSON.stringify(state.cycle)) };
    state.sessions.push(s);
    state.sessions.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }
  const fill = () => {
    const work = items.filter(i => i.id !== 'cardio');
    const nWork = work.reduce((a, i) => a + i.sets.length, 0);
    // orari: quelli delle serie segnate quel giorno; per un giorno passato segnato dopo, una stima
    const ts = all.map(x => x.t || now).filter(t => dayKey(new Date(t)) === cur.date);
    let start, end;
    if (ts.length) { start = Math.min(...ts) - 4 * 60000; end = Math.max(...ts) + 2 * 60000; }
    else { start = parseDay(cur.date).getTime() + 18 * 36e5; end = start + Math.round(8 + nWork * 2.5 + items.filter(i => i.id === 'cardio' && i.sets.length).reduce((a, i) => a + (i.minutes || 0), 0)) * 60000; }
    const minutes = Math.max(1, Math.round((end - start) / 60000));
    const hard = all.filter(x => x.eff !== 'facile').length / all.length > 0.5;
    const planned = work.filter(i => !i.skipped || i.sets.length);
    // durata scelta per la seduta e minuti che il piano chiedeva prima dei tagli (servono a capire se il livello sta nel tempo)
    if (cur.duration) s.duration = cur.duration;
    if (cur.want) s.want = cur.want;
    Object.assign(s, { items, start, end, minutes, deload: !!cur.deload, seed: cur.seed || null, mini: nWork < MINI_SETS, free: !!cur.free,
      frac: planned.length ? planned.filter(isItemDone).length / planned.length : 1,
      kcal: kcalRange(state, minutes, { superset: items.some(i => i.ss), hard }) });
    const others = { sessions: state.sessions.filter(x => x !== s) };
    s.records = [];
    for (const it of items) {
      if (!EX[it.id] || !it.sets.length || (EX[it.id].type === 'time' || EX[it.id].type === 'bw')) continue;
      const prev = history(others, it.id);
      const prevBest = Math.max(0, ...prev.map(p => bestE1rm(p.sets)));
      const best = bestE1rm(it.sets);
      if (prev.length && best > prevBest + 0.01) s.records.push({ id: it.id, e1rm: best });
    }
  };
  fill();
  if (state.sessions[state.sessions.length - 1] !== s || !s.cycleBefore) replay(state, state.sessions);
  else {
    state.cycle = JSON.parse(JSON.stringify(s.cycleBefore));
    s.cycle = state.cycle.n;
    if (counts(s)) advanceCycle(state, !!s.deload, s.date);
  }
  return { session: s, newCycle: state.cycle.n > before };
}

function newCycle(state, date = dayKey()) {
  const c = state.cycle;
  const cycleSessions = state.sessions.filter(s => s.cycle === c.n && !s.deload && counts(s));
  const up = !!c.levelUp;
  c.history.push({ n: c.n, goal: c.goal, sessions: cycleSessions.length, levelUp: up, end: date });
  if (up) c.level = Math.min(2, c.level + 1);
  c.n += 1; c.startCount = state.sessions.filter(s => !s.deload && counts(s)).length; c.deloadLeft = 0; c.levelUp = false;
}

// ---------- Traguardo del ciclo (automatico) ----------
// Per gli esercizi a priorità alta dei muscoli a priorità alta: dal carico di inizio ciclo a circa +7,5%
// (almeno un salto), al massimo delle ripetizioni. Peso: −0,5 kg a settimana dalla media di inizio ciclo.
export function cycleGoals(state, today = dayKey()) {
  const c = state.cycle;
  const mine = state.sessions.filter(s => s.cycle === c.n && !s.deload);
  const startDay = mine[0]?.date || today;
  const out = [];
  const ids = MUSCLE_ORDER.filter(m => state.settings.priority[m] === 'alta').flatMap(m => anchorsOf(state, m))
    .filter(id => !['time', 'bw'].includes(EX[id].type));
  for (const id of ids) {
    const all = history(state, id).filter(p => !p.deload);       // dalla più recente
    const before = all.find(p => p.date < startDay), first = [...all].reverse().find(p => p.date >= startDay);
    const ref = before || first;
    const from = ref ? Math.max(...ref.sets.map(x => x.kg || 0)) : START_LOADS[id];
    if (!from) continue;
    const to = Math.max(stepLoad(state, id, from, 1), snapLoad(state, id, from * 1.075));
    const now = all[0] ? Math.max(...all[0].sets.map(x => x.kg || 0)) : null;
    out.push({ id, from, to, reps: TYPE_RULES[EX[id].type].max, now });
    if (out.length === 3) break;
  }
  let weight = null;
  const w = state.body.weights;
  if (w.length) {
    const startW = weightAvg(state, startDay) ?? w[0].kg;
    const weeks = c.length / freqOf(state);
    weight = { from: Math.round(startW * 10) / 10, to: Math.round((startW - 0.5 * weeks) * 10) / 10, now: Math.round(weightAvg(state, w[w.length - 1].date) * 10) / 10 };
  }
  return { lifts: out, weight };
}

// ---------- Previsione per un giorno futuro ----------
// Simula le sedute consigliate fino a quel giorno (come se fossero fatte come previsto):
// è una stima, che si aggiorna con quello che si fa davvero.
export function forecast(state, day, todayPlan = null, today = dayKey()) {
  const rec = recommendedDays(state, today, 12).filter(k => k <= day);
  if (!rec.includes(day)) return null;
  const sim = { ...state, sessions: [...state.sessions], cycle: { ...state.cycle } };
  const at = k => parseDay(k).getTime() + 18 * 36e5;
  for (const k of rec) {
    const plan = k === today && todayPlan ? todayPlan : compose(sim, k, at(k));
    if (k === day) return plan;
    const items = plan.items.map(it => ({ id: it.id, ss: it.ss, planSets: it.planSets, minutes: it.minutes,
      sets: it.id === 'cardio' ? [{ kg: 0, reps: it.minutes, eff: 'giusto' }] : Array.from({ length: it.planSets }, () => ({ kg: it.kg || 0, reps: it.reps, eff: 'giusto' })) }));
    sim.sessions.push({ id: -at(k), date: k, start: at(k), end: at(k) + plan.minutes * 60000, items, seed: plan.seed, deload: plan.deload, frac: 1, duration: plan.duration });
  }
  return null;
}

// ---------- Alimentazione ----------
export function nutritionCheck(state, today = dayKey()) {
  const n = state.nutrition; const w = state.body.weights;
  if (!w.length) return;
  if (n.lastAdj && diffDays(today, n.lastAdj) < 14) return;
  const first = w[0].date;
  if (diffDays(today, first) < 21) return;            // il primo calo è in parte acqua
  const nowAvg = weightAvg(state, today), oldAvg = weightAvg(state, addDays(today, -14));
  if (nowAvg == null || oldAvg == null) return;
  const perWeek = (oldAvg - nowAvg) / 2;
  const d = new Date(); const when = `${d.getDate()}/${d.getMonth() + 1}`;
  if (perWeek < 0.4) { n.kcal = Math.max(1700, n.kcal - 150); n.last = `calorie −150 il ${when}: calo più lento del previsto · aggiorna anche Yazio`; n.lastAdj = today; }
  else if (perWeek > 1) { n.kcal += 150; n.last = `calorie +150 il ${when}: calo troppo veloce · aggiorna anche Yazio`; n.lastAdj = today; }
  const base = n.proteinBaseWeight ?? 87;
  if (Math.abs(nowAvg - base) > 3) { n.protein = Math.round(nowAvg * 1.85 / 5) * 5; n.proteinBaseWeight = nowAvg; }
}

export const carbs = n => Math.max(0, Math.round((n.kcal - n.protein * 4 - n.fat * 9) / 4 / 10) * 10);
