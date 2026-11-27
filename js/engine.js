// Logica dell'app: composizione dinamica della seduta, progressione dei carichi,
// calendario consigliato, cicli, stime. Nessun accesso al DOM: testabile in Node.
import { EX, EXERCISES, MUSCLES, MUSCLE_ORDER, TYPE_RULES, TARGETS, DEFAULT_PRIORITY, DEFAULT_PLAN, START_LOADS, SEED, EQUIP_ORDER, HOME_PLAN, ZONES } from './catalog.js';

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
export const SCHEMA = 8;

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
      office: [1, 2, 3, 4, 5],       // giorni in cui pranza con la mensa (0 = domenica)
      // manubri di casa (foto di Giabba 25/11): due manici e dischi da 2, 1,5 e 1,25 kg, 4 per tipo
      homeDb: { handle: 0.5, plates: { 2: 4, 1.5: 4, 1.25: 4 } },
      homePlan: JSON.parse(JSON.stringify(HOME_PLAN)),   // priorità degli esercizi a casa (Piano → A casa)
      learn: {},                     // punti delle scelte fatte durante le sedute ('g:id' palestra, 'h:id' casa): { s, d }
    },
    sessions: [],
    current: null,
    cycle: { n: 1, level: 0, startCount: 0, length: 16, deloadLeft: 0, goal: 'Chest press da 55 a 60 kg × 10 · peso medio −3 kg', history: [] },
    body: { weights: [], waist: [] },
    nutrition: { kcal: 1850, protein: 170, fat: 60, last: '', lastAdj: null, proteinBaseWeight: null },
    meals: { pick: {} },   // menu del giorno: i pasti scelti da Giabba, per giorno ({ colazione, pranzo, dish, merenda, cena })
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
  3: s => {   // 3 → 4: durata ricalcolata senza contare le serie corrette ore dopo (la seduta del 23/11 risultava di 797 min)
    for (const ses of s.sessions || []) {
      const all = (ses.items || []).flatMap(i => i.sets || []);
      const ts = all.map(x => x.t).filter(t => t && dayKey(new Date(t)) === ses.date);
      if (!ts.length) continue;
      Object.assign(ses, spanOf(ts));
      if (s.body) ses.kcal = kcalRange(s, ses.minutes, { superset: ses.items.some(i => i.ss), hard: all.filter(x => x.eff !== 'facile').length / all.length > 0.5 });
    }
    return s;
  },  6: s => {   // 6 → 7: i pasti si scelgono da una lista: il piatto "ordinato" in mensa diventa il pranzo scelto
    const m = s.meals || {}, pick = {};
    for (const [d, dish] of Object.entries(m.ordered || {})) pick[d] = { pranzo: 'm:' + dish.id, dish };
    s.meals = { pick };
    return s;
  },
  5: s => {   // 5 → 6: menu del giorno (nuovo, vuoto)
    s.meals = s.meals || { alt: {}, where: {}, ordered: {} };
    return s;
  },
  4: s => {   // 4 → 5: calorie dinamiche (PT 24/11): kcal diventa la base del giorno di riposo, l'allenamento aggiunge la sua quota
    const n = s.nutrition;
    if (n) {
      n.kcal = n.lastAdj ? Math.max(1700, (n.kcal || 2150) - 300) : 1850;
      if (!n.proteinBaseWeight && (n.protein == null || n.protein === 160)) n.protein = 170;
    }
    return s;
  },
  7: s => {   // 7 → 8: "Elimina" non insegna più (Giabba 25/11): via i punti negativi dati dalle eliminazioni.
    // Restano quelli di un esercizio davvero cambiato con un altro (la seduta aperta lo ricorda in "orig").
    const L = s.settings?.learn;
    if (L) {
      const swapped = new Set([s.current, s.stash].filter(Boolean).flatMap(c => (c.items || []).filter(i => i.orig && i.orig !== i.id).map(i => (c.home ? 'h:' : 'g:') + i.orig)));
      for (const [k, v] of Object.entries(L)) if (v && v.s < 0 && !swapped.has(k)) delete L[k];
    }
    return s;
  },
};

// Inizio, fine e minuti di una seduta dagli orari delle serie. Le pause oltre 45 minuti non contano:
// una serie tolta e rimessa la sera (per correggerla) non allunga la seduta del mattino.
const GAP = 45 * 60000;
export function spanOf(ts) {
  const t = [...ts].sort((a, b) => a - b);
  let ms = 0, from = t[0];
  for (let i = 1; i <= t.length; i++) if (i === t.length || t[i] - t[i - 1] > GAP) { ms += t[i - 1] - from; from = t[i]; }
  const start = t[0] - 4 * 60000, minutes = Math.max(1, Math.round(ms / 60000) + 6);
  return { start, end: start + minutes * 60000, minutes };
}

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
  out.settings.homePlan = { ...base.settings.homePlan, ...(out.settings.homePlan || {}) };
  for (const m of Object.keys(out.settings.homePlan)) for (const id of Object.keys(out.settings.homePlan[m])) if (!EX[id]?.home) delete out.settings.homePlan[m][id];
  // vecchio formato { anchor, comp } → priorità per esercizio (3 alta, 2 media, 1 bassa)
  for (const m of Object.keys(out.settings.plan)) {
    const p = out.settings.plan[m];
    if (p && p.anchor) { const n = {}; for (const id of p.comp || []) n[id] = 2; n[p.anchor] = 3; out.settings.plan[m] = n; }
    for (const id of Object.keys(out.settings.plan[m])) if (!EX[id]) delete out.settings.plan[m][id];
  }
  out.cycle = { ...base.cycle, ...(s.cycle || {}) };
  out.body = { ...base.body, ...(s.body || {}) };
  out.nutrition = { ...base.nutrition, ...(s.nutrition || {}) };
  out.meals = { ...base.meals, ...(s.meals || {}) };
  out.sessions = Array.isArray(s.sessions) ? s.sessions : [];
  return out;
}

// ---------- Impostazioni esercizio ----------
export function exSettings(state, id) {
  const e = EX[id];
  const s = state.settings.ex[id] || {};
  const bar = e.equip === 'bilanciere';
  const lb = s.inc === 'lb';
  // Salto di carico automatico (dal 24/11 niente più tabella Attrezzi): quello tipico dell'attrezzo,
  // più piccolo se dai pesi segnati si vede che l'attrezzo sale di meno. I vecchi valori scelti a mano non contano più.
  const inc = lb ? 15 * LB : learnedInc(state, id, e.inc || (e.equip === 'manubri' ? 2 : 2.5));
  // Calcolo dei dischi da solo per bilanciere e macchine a dischi (leg press); peso a vuoto con la pressione lunga
  return { inc, lb, plates: s.plates ?? (bar || PLATE_LOADED.includes(id)), base: s.base ?? (bar ? (e.bar ?? 20) : 0), note: s.note || '' };
}
// Attrezzi che si caricano con i dischi (oltre ai bilancieri)
const PLATE_LOADED = ['Leg_Press', 'Calf_Press_On_The_Leg_Press_Machine', 'Hack_Squat', 'Smith_Machine_Squat', 'Smith_Machine_Incline_Bench_Press', 'T-Bar_Row_with_Handle'];
// Il salto più piccolo tra i carichi diversi segnati su questo esercizio (almeno 1 kg, al massimo quello tipico)
const incCache = new WeakMap();
function learnedInc(state, id, def) {
  const ss = state.sessions || [];
  let c = incCache.get(ss);
  if (!c || c.n !== ss.length) { c = { n: ss.length, by: {} }; incCache.set(ss, c); }
  if (c.by[id] != null) return c.by[id] || def;
  const kgs = [...new Set(ss.flatMap(x => (x.items || []).filter(i => i.id === id).flatMap(i => (i.sets || []).map(t => Math.round((t.kg || 0) * 2) / 2))))].filter(k => k > 0).sort((a, b) => a - b);
  let step = 0;
  for (let i = 1; i < kgs.length; i++) { const d = kgs[i] - kgs[i - 1]; if (d >= 1 && (!step || d < step)) step = d; }
  c.by[id] = step && step < def ? step : 0;
  return c.by[id] || def;
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

// ---------- Priorità che imparano dalle scelte fatte durante la seduta ----------
// Un esercizio proposto e cambiato con un altro (che poi fai davvero): il nuovo prende un punto, quello lasciato ne
// perde uno. Un esercizio aggiunto a mano e fatto prende un punto. "Elimina" non insegna niente: si toglie per
// mancanza di tempo o per fare altro (Giabba 25/11). Ogni esercizio prende al massimo un punto al giorno per verso,
// quindi la priorità cambia solo se la scelta si ripete in 2 giorni diversi.
// A +2 punti la priorità sale di un livello (da "mai" si entra direttamente a rotazione), a −2 scende di uno, mai
// fino a "mai": resta una possibilità. Se così il muscolo perde il suo esercizio "sempre", lo diventa quello scelto
// al suo posto. Punti fermi da più di 4 settimane si azzerano: conta come scegli adesso.
// Cambiare a mano la priorità in Piano azzera i punti di quell'esercizio. A casa vale lo stesso, sulle priorità di casa.
export const LEARN_STEP = 2, LEARN_DAYS = 28;
export const learnKey = (id, home) => (home ? 'h:' : 'g:') + id;
export function learnChoice(state, { chosen = null, rejected = null, home = false, today = dayKey() } = {}) {
  const S = state.settings, L = S.learn = S.learn || {};
  const plan = home ? (S.homePlan = S.homePlan || JSON.parse(JSON.stringify(HOME_PLAN))) : S.plan;
  const ok = id => id && id !== 'cardio' && EX[id] && !EX[id].hidden && EX[id].muscle && (!home || EX[id].home);
  const pr = id => (plan[EX[id].muscle] || {})[id] || 0;
  const hadAnchor = ok(rejected) && pr(rejected) === 3 && Object.values(plan[EX[rejected].muscle] || {}).filter(p => p === 3).length === 1;
  const changes = [];
  const set = (id, to) => {
    const m = EX[id].muscle, p = plan[m] = plan[m] || {}, from = p[id] || 0;
    if (to === from) return;
    p[id] = to;
    const ch = changes.find(x => x.id === id);
    if (ch) ch.to = to; else changes.push({ id, from, to });
  };
  const bump = (id, d) => {
    if (!ok(id)) return;
    const k = learnKey(id, home), cur = L[k];
    if (cur && cur.d === today && (cur.t ?? Math.sign(cur.s)) === d) return;   // già contato oggi in questo verso
    const old = cur && diffDays(today, cur.d) <= LEARN_DAYS ? cur.s : 0;
    let s = old + d;
    const from = pr(id);
    if (s >= LEARN_STEP) { set(id, from === 0 ? 2 : Math.min(3, from + 1)); s = 0; }
    else if (s <= -LEARN_STEP) { set(id, Math.max(1, from - 1)); s = 0; }
    L[k] = { s, d: today, t: d };
  };
  bump(rejected, -1);
  bump(chosen, +1);
  // il muscolo aveva un solo esercizio "sempre" ed è sceso: lo sostituisce quello scelto al suo posto
  if (hadAnchor && pr(rejected) < 3 && ok(chosen) && EX[chosen].muscle === EX[rejected].muscle && pr(chosen) < 3) {
    set(chosen, 3); L[learnKey(chosen, home)] = { s: 0, d: today, t: 1 };
  }
  return changes;
}
// Priorità cambiata a mano in Piano: i punti di quell'esercizio ripartono da zero
export function forgetChoice(state, id, home = false) { if (state.settings.learn) delete state.settings.learn[learnKey(id, home)]; }

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
            if (inDueZone(state, sw.id)) continue;      // copre una zona rimasta scoperta: resta
            // un esercizio a priorità alta si cambia solo con un altro a priorità alta
            // un complementare si cambia con un altro complementare se c'è (la rotazione non torna all'àncora)
            const anc = id => prio(sw) < 3 && exPrio(state, id) === 3 ? 1 : 0;
            const alt = poolOf(state, EX[sw.id].muscle).filter(id => !used.has(id) && SS_TYPES.includes(EX[id].type) && setupOf(id) === setupOf(keep.id)
              && (prio(sw) < 3 || exPrio(state, id) >= 3))
              .sort((x, y) => anc(x) - anc(y) || exPrio(state, y) - exPrio(state, x) || lastUse(state, x) - lastUse(state, y))[0];
            if (!alt) continue;
            const nu = dry ? { ...sw, id: alt } : { ...makeItem(state, alt, sw.planSets, today), cap: sw.cap };
            items[items.indexOf(sw)] = nu;
            pair = [keep, nu]; break outer;
          }
        }
      }
    }
    // stesse serie per i due esercizi, senza superare il limite di recupero di nessuno dei due (lavorato ieri)
    if (pair && Math.max(pair[0].planSets, pair[1].planSets) > Math.min(pair[0].cap ?? 99, pair[1].cap ?? 99)) pair = null;
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
    for (const it of s.items) if (it.id === id && workSets(it).length) out.push({ date: s.date, deload: !!s.deload, home: !!s.home, sets: workSets(it) });
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
      for (const [m, w] of Object.entries(e.work)) if (m in acc) acc[m] += n * w;
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

// ---------- Ogni giorno, muscolo per muscolo ----------
// Nessuno schema fisso (doc di ricerca, 25/11): né A/B, né spinta/tirata, né giorni della settimana. Ogni volta l'app
// guarda ogni muscolo: quanto è indietro (arretrato), se è recuperato (pronto) e quanto conta (priorità).
// Spinta e tirata, sedute focus e giornate di cardio escono da sole quando servono.
export const GROUPS = { spinta: ['petto', 'laterali', 'tricipiti'], tirata: ['schiena', 'posteriori', 'bicipiti', 'avambracci'],
  gambe: ['quadricipiti', 'femorali', 'glutei', 'polpacci'], addome: ['addome'] };
const WEIGHT = { alta: 3, normale: 2, minima: 1 };
const RESTING = ['focus', 'cardio'];
export const KIND_LABEL = { full: 'Total body', spinta: 'Spinta', tirata: 'Tirata', focus: 'Focus', cardio: 'Cardio e recupero' };

// Una seduta "mini" (pochi esercizi, per esempio a casa), focus o di solo cardio conta per i muscoli ma non come
// giorno di allenamento: non entra nel ritmo né nel ciclo.
export const counts = s => !s.mini && s.kind !== 'focus' && s.kind !== 'cardio';
const doneDays = state => new Set(state.sessions.filter(counts).map(s => s.date));

// Sedute ogni 7 giorni (Piano → Ritmo). I giorni scelti lì sono solo una preferenza.
export const freqOf = state => Math.min(5, Math.max(2, state.settings.freq || 3));

// Lavoro di una seduta per muscolo: serie effettive (dirette 1, indirette 0,5) e se una serie diretta è arrivata al limite
function sessionLoad(s) {
  const L = {};
  for (const it of s.items || []) {
    const e = EX[it.id], sets = workSets(it);
    if (!e || !sets.length) continue;
    for (const [m, w] of Object.entries(e.work || {})) {
      const x = L[m] = L[m] || { n: 0, lim: false };
      x.n += sets.length * w;
      if (w >= 1 && (s.sim || sets.some(z => z.eff === 'limite'))) x.lim = true;
      if (w >= 1) x.nl = (x.nl || 0) + (s.sim ? 1 : sets.filter(z => z.eff === 'limite').length);   // serie dirette al limite
    }
  }
  return L;
}
// Il recupero si conta in ore, dall'inizio della seduta all'ora in cui ti alleni (Morán-Navarro 2017, Schoenfeld 2016):
// lavoro duro (3 o più serie effettive, oppure una al limite) → 48 ore di riposo per quel muscolo;
// lavoro leggero (1–2 serie, nessuna al limite) → nelle 48 ore al massimo 2 serie;
// lavoro molto duro (6 o più serie, almeno 4 al limite) → anche fra 48 e 72 ore la metà delle serie.
const isHard = x => !!x && (x.n >= 3 - 1e-9 || x.lim);
const isVeryHard = x => !!x && x.n >= 6 - 1e-9 && (x.nl || 0) >= 4;
// Le ore si contano da inizio a inizio seduta, con 2 ore di margine (arrivare un po' prima non cambia niente).
const HOUR = 36e5, REST_H = 46, HALF_H = 70;
// Ora abituale di inizio (minuti dalla mezzanotte): la mediana delle ultime 6 sedute vere; senza storia le 18.
export function usualStart(state) {
  const xs = state.sessions.filter(s => !s.sim && counts(s) && s.start).slice(-6)
    .map(s => { const d = new Date(s.start); return d.getHours() * 60 + d.getMinutes(); }).sort((a, b) => a - b);
  return xs.length ? xs[Math.floor((xs.length - 1) / 2)] : 18 * 60;
}
// L'ora di una seduta che si compone adesso: oggi è adesso, un altro giorno l'ora abituale
const sessionTime = (state, k, now) => k === dayKey(new Date(now)) ? now : parseDay(k).getTime() + usualStart(state) * 60000;
// Quando ci si allena il giorno k: all'ora abituale (oggi non prima di adesso)
export function planTime(state, k, now = Date.now()) {
  const t = parseDay(k).getTime() + usualStart(state) * 60000;
  return k === dayKey(new Date(now)) ? Math.max(t, now) : t;
}

// Storia recente: lavoro per giorno, giorni con una seduta che conta nel ritmo, giorni con qualcosa di segnato
function recent(state, today) {
  const from = addDays(today, -8), H = { loads: new Map(), at: new Map(), hard: new Set(), any: new Set() };
  for (const s of state.sessions) {
    if (s.date < from) continue;
    H.any.add(s.date);
    if (counts(s)) H.hard.add(s.date);
    const acc = H.loads.get(s.date) || {};
    for (const [m, x] of Object.entries(sessionLoad(s))) { const a = acc[m] = acc[m] || { n: 0, lim: false, nl: 0 }; a.n += x.n; a.lim = a.lim || x.lim; a.nl += x.nl || 0; }
    H.loads.set(s.date, acc);
    // inizio della seduta (le sedute vecchie senza orari: le 18 di quel giorno); due sedute lo stesso giorno: l'ultima
    const start = s.start || parseDay(s.date).getTime() + 18 * HOUR;
    H.at.set(s.date, Math.max(H.at.get(s.date) || 0, start));
  }
  return H;
}
function sumLoads(H, from, to) {
  const acc = Object.fromEntries(MUSCLE_ORDER.map(m => [m, 0]));
  for (const [d, L] of H.loads) if (d >= from && d <= to) for (const [m, x] of Object.entries(L)) if (m in acc) acc[m] += x.n;
  return acc;
}

// I numeri di ogni muscolo per il giorno k (doc di ricerca, "I tre numeri di ogni muscolo"):
// arretrato = obiettivo dei 7 giorni meno le serie fatte davvero nei 6 giorni prima (un esercizio tolto o saltato
// non conta); pronto = cap (in ore: lavoro duro da meno di 48 ore 0, leggero 2, molto duro da 48–72 ore metà);
// peso = priorità. Con il ritmo nella finestra (al massimo "sedute" ogni 7 giorni) ogni seduta piena dà circa
// obiettivo/sedute, una seduta a metà il doppio. T: l'ora della seduta (adesso, o l'ora abituale per un giorno futuro).
function dayCtx(state, H, k, T = planTime(state, k)) {
  const P = state.settings.priority;
  const win7 = sumLoads(H, addDays(k, -6), addDays(k, -1));
  const target = {}, base = {}, cap = {}, ahead = {}, half = {}, wait = {};
  let relax = Infinity;    // la prima ora dopo T in cui un limite di recupero si allenta (per aggiornare la seduta)
  for (const m of MUSCLE_ORDER) {
    target[m] = targetFor(state, m);
    base[m] = TARGETS[P[m] || 'normale'][0];
    cap[m] = 10; ahead[m] = 0;
    for (const [d, L] of H.loads) {
      const x = L[m], end = H.at.get(d);   // end: l'inizio di quella seduta
      if (!x || d >= k || !end) continue;
      const h = (T - end) / HOUR;
      if (h < REST_H && x.n > 0) {
        cap[m] = Math.min(cap[m], isHard(x) ? 0 : 2);
        wait[m] = Math.max(wait[m] || 0, Math.ceil(REST_H - h));
        relax = Math.min(relax, end + REST_H * HOUR);
      }
      if (h < HALF_H && isVeryHard(x)) { half[m] = true; relax = Math.min(relax, end + (h < REST_H ? REST_H : HALF_H) * HOUR); }
    }
    if (half[m]) cap[m] = Math.min(cap[m], Math.max(2, Math.round(Math.min(target[m] - win7[m], target[m] * 0.6, 10) / 2)));
  }
  return { freq: freqOf(state), done: win7, win7, target, base, cap, ahead, half, wait, T, relax: relax < Infinity ? relax : null };
}

// Serie di oggi per un muscolo: l'arretrato, al massimo 10 e il 60% dell'obiettivo, poi il limite del recupero.
// I muscoli a priorità minima senza multiarticolare (abductor, calf, leg curl, polsi) solo fino al pavimento.
function needOf(state, ctx, m) {
  const n = state.settings.priority[m] === 'minima' && !hasCompoundAnchor(state, m) ? FLOOR - ctx.win7[m]
    : Math.min(ctx.target[m] - ctx.win7[m], ctx.target[m] * 0.6, 10);
  return Math.max(0, Math.min(n, ctx.cap[m]));
}

// Il piano del giorno k, muscolo per muscolo: tipo di seduta e serie per muscolo (need).
// pair: domani è prevista un'altra seduta (coppia di giorni) → oggi un gruppo, domani l'altro.
export function planDay(state, k, { H = null, pair = false, home = false, at = null } = {}) {
  H = H || recent(state, k);
  const st = home ? homeState(state) : state, P = state.settings.priority;
  const ctx = dayCtx(state, H, k, at ?? planTime(state, k));
  const can = m => poolOf(st, m).length > 0;
  const y1 = H.loads.get(addDays(k, -1)) || {}, y2 = H.loads.get(addDays(k, -2)) || {};
  const yHard = H.hard.has(addDays(k, -1)), third = yHard && H.hard.has(addDays(k, -2));
  const need = {};
  for (const m of MUSCLE_ORDER) need[m] = can(m) ? needOf(st, ctx, m) : 0;
  const base = { ctx, third, rested: MUSCLE_ORDER.filter(m => ctx.cap[m] === 0), group: null, minEx: {}, units: [] };

  // Focus sui 1–2 muscoli (le gambe contano come uno) con più arretrato pesato, anche di priorità bassa; poi cardio.
  // Terzo giorno di fila: solo muscoli che non hanno lavorato nei due giorni prima.
  const focus = why => {
    const fresh = m => !third || ((y1[m]?.n || 0) < 1 && (y2[m]?.n || 0) < 1);
    const tgt = m => P[m] === 'minima' && !hasCompoundAnchor(st, m) ? FLOOR : ctx.target[m];
    const back = m => fresh(m) && ctx.cap[m] > 0 && can(m) ? Math.max(0, tgt(m) - ctx.win7[m]) : 0;
    const W = m => WEIGHT[P[m]] || 2;
    const units = [...GROUPS.spinta, ...GROUPS.tirata, 'addome'].map(m => ({ muscles: [m], score: back(m) * W(m) }));
    const legs = GROUPS.gambe.filter(m => back(m) > 0).sort((a, b) => back(b) * W(b) - back(a) * W(a));
    units.push({ muscles: legs.slice(0, 2), legs: true, score: legs.reduce((a, m) => a + back(m) * W(m), 0) });
    const top = units.filter(u => u.score >= 1 && u.muscles.length).sort((a, b) => b.score - a.score);
    const pick = top.length > 1 && top[1].score >= top[0].score / 2 ? top.slice(0, 2) : top.slice(0, 1);
    const f = Object.fromEntries(MUSCLE_ORDER.map(m => [m, 0])), minEx = {};
    for (const u of pick) for (const m of u.muscles) {
      const raw = Math.round(Math.min(back(m), ctx.target[m] * 0.6, 10));
      f[m] = Math.min(ctx.cap[m], u.legs ? Math.max(2, Math.min(3, raw)) : Math.max(4, Math.min(6, raw)));
      if (!u.legs && f[m] >= 4) minEx[m] = 2;           // focus su un muscolo: due esercizi diversi
    }
    if (!pick.length) return { ...base, kind: 'cardio', need: f, why: third ? 'terzo giorno di fila' : MUSCLE_ORDER.some(m => ctx.cap[m] > 0 && back(m) > 0) ? 'i muscoli sono già a posto per questa settimana' : 'niente di pronto da allenare' };
    return { ...base, kind: 'focus', need: f, minEx, units: pick, why };
  };

  if (third) return focus('terzo giorno di fila');
  let kind = 'full', group = null;
  if (pair && !yHard) {
    // due giorni di fila: oggi il gruppo pronto con più arretrato pesato, domani l'altro (che oggi riposa).
    // Gambe e addome dove c'è tempo: le gambe oggi, l'addome domani.
    const score = g => GROUPS[g].reduce((a, m) => a + need[m] * (WEIGHT[P[m]] || 2), 0);
    group = score('tirata') > score('spinta') ? 'tirata' : 'spinta';
    for (const m of [...GROUPS[group === 'spinta' ? 'tirata' : 'spinta'], ...GROUPS.addome]) need[m] = 0;
    kind = group;
  }
  // serie utili: quelle dei muscoli che contano (priorità alta e normale); le minime si aggiungono dove c'è tempo
  const main = m => P[m] !== 'minima' && need[m] >= 1;
  const sum = g => GROUPS[g].reduce((a, m) => a + (main(m) ? need[m] : 0), 0);
  // un gruppo riposa (lavorato ieri, oppure già a posto): oggi è una seduta a metà sull'altro
  if (!group) {
    if (sum('spinta') < 3 && sum('tirata') >= 3) kind = 'tirata';
    else if (sum('tirata') < 3 && sum('spinta') >= 3) kind = 'spinta';
  }
  // seduta a metà: il gruppo di oggi lavora in meno sedute, quindi ne prende di più (5–6 serie alle priorità alte),
  // fino al 120% dell'obiettivo dei 7 giorni (il limite alto della fascia)
  if (kind === 'spinta' || kind === 'tirata') for (const m of GROUPS[kind]) {
    if (!can(m) || (P[m] === 'minima' && !hasCompoundAnchor(st, m))) continue;
    need[m] = Math.max(need[m], Math.min(ctx.cap[m], 10, ctx.target[m] * 0.6, ctx.target[m] * 1.2 - ctx.win7[m]));
  }
  const useful = MUSCLE_ORDER.reduce((a, m) => a + (main(m) ? need[m] : 0), 0);
  if (useful < 8) return focus(yHard || base.rested.length ? 'il resto ha lavorato da meno di 48 ore' : 'pochi muscoli da recuperare');
  return { ...base, kind, group, need };
}

// ---------- Calendario consigliato ----------
// Mai giorni fissi: il calendario simula le prossime sedute una dopo l'altra e si ricalcola a ogni evento
// (seduta fatta, modificata, aggiunta, tolta o saltata). Il prossimo giorno è il primo in cui una seduta sarebbe
// utile (abbastanza muscoli pronti e in arretrato), senza superare il ritmo nella finestra di 7 giorni (uno in più se
// sei indietro) e mai con 3 sedute di fila. Le sedute focus e di solo cardio non contano nel ritmo.
// I giorni scelti in Piano → Ritmo valgono a parità: si aspetta al massimo un giorno per arrivare a uno di quelli,
// e due giorni preferiti di fila diventano spinta e tirata. Da soli non creano mai sedute. Due giorni di fila non
// previsti (seduta in più) vanno bene lo stesso: il secondo prende i muscoli che il primo ha lasciato riposare.
export function calendar(state, today = dayKey(), count = 6, now = Date.now()) {
  const H = recent(state, today), prefs = state.settings.days || [], freq = freqOf(state);
  const pref = k => prefs.includes(weekday(k));
  const alta = MUSCLE_ORDER.filter(m => state.settings.priority[m] === 'alta');
  // indietro: alle priorità alte manca più di metà dell'obiettivo negli ultimi 7 giorni
  const behind = k => {
    if (!alta.length) return false;
    const w = sumLoads(H, addDays(k, -6), addDays(k, -1));
    return alta.reduce((a, m) => a + Math.max(0, targetFor(state, m) - w[m]), 0) >= alta.reduce((a, m) => a + targetFor(state, m), 0) / 2;
  };
  const inWin = k => { let n = 0; for (let i = 1; i <= 6; i++) if (H.hard.has(addDays(k, -i))) n++; return n; };
  // con 2 sedute a settimana almeno 3 giorni tra una e l'altra, così ogni muscolo lavora in due momenti distanti
  const gapOk = k => freq > 2 || ![1, 2].some(i => H.hard.has(addDays(k, -i)));
  const allowed = k => !(H.hard.has(addDays(k, -1)) && H.hard.has(addDays(k, -2))) && gapOk(k) && inWin(k) < freq + (behind(k) ? 1 : 0);
  const useful = (k, pair = false) => {
    if (!allowed(k)) return null;
    const p = planDay(state, k, { H, pair, at: planTime(state, k, now) });
    return RESTING.includes(p.kind) ? null : p;
  };
  const add = (k, p) => {
    const L = {};
    for (const m of MUSCLE_ORDER) if (p.need[m] >= 1) { const n = Math.max(2, Math.round(p.need[m])); L[m] = { n, lim: true, nl: Math.ceil(n / 3) }; }
    H.loads.set(k, L); H.hard.add(k); H.at.set(k, planTime(state, k, now));
  };
  const drop = k => { H.loads.delete(k); H.hard.delete(k); H.at.delete(k); };
  const days = [], pair = new Set(), plans = {};
  let k = H.any.has(today) ? addDays(today, 1) : today;
  for (let i = 0; i < 90 && days.length < count; i++, k = addDays(k, 1)) {
    const p = useful(k);
    if (!p) continue;
    const k1 = addDays(k, 1);
    if (prefs.length && !pref(k) && pref(k1) && useful(k1)) continue;          // a parità, il giorno preferito
    if (!H.hard.has(addDays(k, -1)) && pref(k) && pref(k1)) {
      const pp = useful(k, true);
      if (pp) {
        add(k, pp);
        const p2 = useful(k1);
        if (p2) { add(k1, p2); days.push(k, k1); pair.add(k); plans[k] = pp; plans[k1] = p2; k = k1; continue; }
        drop(k);
      }
    }
    add(k, p); days.push(k); plans[k] = p;
  }
  return { days: days.slice(0, count), pair, plans };
}
export const recommendedDays = (state, today = dayKey(), count = 6) => calendar(state, today, count).days;

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
  // solo in palestra: a casa i manubri arrivano a pochi chili e si sale con le ripetizioni
  const h = history(state, id).filter(p => !p.deload && !p.home && p.date > lastDeload);
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

export function suggestion(state, id, today = dayKey(), home = false) {
  const e = EX[id]; const r = TYPE_RULES[e.type];
  const down = (k0, f) => { const k = snapLoad(state, id, k0 * f); return k < k0 ? k : stepLoad(state, id, k0, -1); };
  // a casa si parte da quello fatto a casa, in palestra da quello fatto in palestra (se c'è)
  const all = history(state, id).filter(p => !p.deload), same = all.filter(p => p.home === home);
  const h = same.length ? same : all;
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

function makeItem(state, id, sets, today, home = false) {
  const sg = suggestion(state, id, today, home);
  return { id, planSets: sets, kg: sg.kg, reps: sg.reps, note: sg.note, ss: null, sets: [], skipped: false };
}

// Le prime 4 sedute partono dalla seduta tipo A/B (esercizi da cui fissare i carichi), ma passano dalle stesse
// regole delle altre: un muscolo non pronto, o che lavora domani, si toglie; l'arretrato decide le serie;
// una zona scoperta (petto alto, capo lungo, brachiale) prende il posto dell'esercizio meno importante.
export function seedSession(state, today, plan = null) {
  const lastSeed = [...state.sessions].reverse().find(s => s.seed)?.seed;
  const which = lastSeed === 'A' ? 'B' : 'A';
  // un esercizio che hai messo a "mai" in Piano lascia il posto al preferito dello stesso muscolo (stesso tipo, se c'è)
  const used = new Set(SEED[which].map(x => x.id));
  const pick = x => {
    const def = (DEFAULT_PLAN[EX[x.id].muscle] || {})[x.id] || 0;
    if (!(def > 0 && exPrio(state, x.id) === 0)) return x;
    const list = muscleList(state, EX[x.id].muscle, e => exPrio(state, e.id) > 0 && !used.has(e.id));
    const nid = list.find(id => EX[id].type === EX[x.id].type) || list[0];
    if (!nid) return null;
    used.add(nid);
    return { ...x, id: nid, ss: null };
  };
  let chosen = SEED[which].map(x => pick({ ...x })).filter(Boolean);
  const zoned = {};
  if (plan) {
    const need = plan.need, mOf = x => EX[x.id].muscle;
    chosen = chosen.filter(x => need[mOf(x)] >= 1);
    for (const m of new Set(chosen.map(mOf))) {
      const mine = chosen.filter(x => mOf(x) === m), tot = mine.reduce((a, x) => a + x.sets, 0);
      for (const x of mine) x.sets = Math.min(plan.ctx.cap[m], Math.max(2, Math.min(x.sets + 1, Math.round(need[m] * x.sets / tot))));
      const z = zoneDue(state, m);
      if (z && !mine.some(x => z.ids.includes(x.id))) {
        const nid = muscleList(state, m, e => z.ids.includes(e.id) && exPrio(state, e.id) > 0 && !used.has(e.id)).sort((a, b) => lastUse(state, a) - lastUse(state, b) || exPrio(state, b) - exPrio(state, a))[0];
        const out = [...mine].sort((a, b) => exPrio(state, a.id) - exPrio(state, b.id))[0];
        if (nid) { used.add(nid); out.id = nid; zoned[nid] = z.name; }
      }
    }
    // un muscolo con molto arretrato che la seduta tipo non ha (per esempio l'addome tolto ieri): il suo esercizio
    for (const m of MUSCLE_ORDER) {
      if (need[m] < 3 || chosen.some(x => mOf(x) === m)) continue;
      const pool = poolOf(state, m).filter(id => !used.has(id)).sort(byPrio(state));
      const z = zoneDue(state, m), id = (z && pool.find(i => z.ids.includes(i))) || (!anchorTurn(state, m) && pool.find(i => exPrio(state, i) < 3)) || pool[0];
      if (id) { used.add(id); chosen.push({ id, sets: Math.min(5, Math.round(need[m])) }); if (z?.ids.includes(id)) zoned[id] = z.name; }
    }
  }
  // una superserie resta solo se tutti e due gli esercizi ci sono ancora, alla stessa postazione
  for (const x of chosen) {
    const mate = x.ss && chosen.find(y => y !== x && y.ss === x.ss);
    if (x.ss && (!mate || setupOf(mate.id) !== setupOf(x.id))) x.ss = null;
  }
  const items = chosen.map(x => {
    const it = { ...makeItem(state, x.id, x.sets, today), ss: x.ss ? `${which}${x.ss}` : null };
    if (zoned[x.id] && !it.note) it.note = `Per il ${zoned[x.id]}: mancava da 2 sedute`;
    return it;
  });
  return { items, seed: which, reason: `seduta tipo ${which}: le prime sedute fissano i carichi di partenza` };
}

// Giornata di solo cardio: 30–45 minuti moderati
function cardioDay(dur) {
  return { items: [{ id: 'cardio', minutes: Math.max(30, Math.min(45, Math.floor((dur - 5) / 5) * 5)), planSets: 0, sets: [], skipped: false, ss: null }] };
}

export function compose(state, today = dayKey(), now = Date.now(), duration = null) {
  const cyc = cycleInfo(state);
  const deload = state.cycle.deloadLeft > 0;
  const nonDeload = state.sessions.filter(s => !s.deload && counts(s)).length;
  const dur = duration || usualMinutes(state);
  const warm = warmMin(dur);
  // coppia di giorni prevista dal calendario (oggi e domani): oggi un gruppo, domani l'altro
  const cal = calendar(state, today, 2, now);
  const plan = planDay(state, today, { pair: cal.days[0] === today && cal.pair.has(today), at: sessionTime(state, today, now) });
  let res;
  if (plan.kind === 'cardio') res = cardioDay(dur);
  else if (nonDeload < 4 && plan.kind !== 'focus') {
    res = seedSession(state, today, plan);
    res.want = pairedMinutes(state, res.items, warm, false);
    res.cut = fitTime(state, res.items, plan.ctx, dur + 2, warm, false);
    // il tempo che avanza va al cardio (fino a 30 minuti), come nelle sedute dinamiche
    const left = dur - itemMinutes(res.items, warm);
    if (left >= 10) res.items.push({ id: 'cardio', minutes: Math.min(30, Math.floor(left / 5) * 5), planSets: 0, sets: [], skipped: false, ss: null });
  } else res = dynamicSession(state, today, now, dur, plan);
  let reason = reasonFor(state, plan, res.items, { cut: res.cut || 0, dur, seed: res.seed || null });
  if (deload) {
    res.items.forEach(it => { if (it.id !== 'cardio') it.planSets = Math.max(1, Math.round(it.planSets / 2)); });
    reason = `Scarico (${4 - state.cycle.deloadLeft} di 3): metà serie, stessi carichi, sforzo facile o giusto`;
  }
  const minutes = itemMinutes(res.items, warm);
  // relax: da quell'ora un muscolo ha recuperato; se la seduta non è ancora iniziata né toccata, l'app la rifà
  return { date: today, items: res.items, reason, kind: plan.kind, seed: res.seed || null, deload, cycle: cyc.n, minutes, duration: dur, want: res.want || null, cur: 0, view: 'list',
    relax: plan.ctx.relax, fp: itemsPrint(res.items) };
}

// L'impronta degli esercizi di una seduta (per sapere se è stata cambiata a mano)
export const itemsPrint = items => (items || []).map(i => i.id + ':' + (i.planSets || i.minutes || 0) + (i.ss || '')).join('|');

// La riga del perché: tipo di seduta e motivo ("Tirata: petto e spalle riposano da ieri", "Focus addome: saltato
// nelle ultime 2 sedute", "Cardio e recupero: terzo giorno di fila"), poi i dettagli.
const NICK = m => ['bicipiti', 'tricipiti'].includes(m) ? 'braccia' : ['laterali', 'posteriori'].includes(m) ? 'spalle' : MUSCLES[m].name.toLowerCase();
const listIt = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1] : a[0] || '';
// sedute (che contano) di fila, dalla più recente, senza lavoro diretto sul muscolo
function missedIn(state, m) {
  let n = 0;
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    if (!counts(s)) continue;
    if (s.items.some(it => (EX[it.id]?.work[m] || 0) >= 1 && workSets(it).length)) break;
    n++;
  }
  return n;
}
export function planTitle(plan) {
  if (plan.kind !== 'focus') return KIND_LABEL[plan.kind];
  return 'Focus ' + listIt(plan.units.map(u => u.legs ? 'gambe' : MUSCLES[u.muscles[0]].name.toLowerCase()));
}
function reasonFor(state, plan, items, { cut = 0, dur = 60, seed = null } = {}) {
  const P = state.settings.priority, work = items.filter(i => i.id !== 'cardio');
  const has = m => work.some(it => EX[it.id]?.muscle === m);
  let why = '';
  if (plan.kind === 'focus') {
    const u = plan.units[0], m = u.legs ? null : u.muscles[0], miss = m ? missedIn(state, m) : 0;
    const sk = m === 'schiena' ? 'saltata' : /i$/.test(MUSCLES[m || 'petto'].name) ? 'saltati' : 'saltato';
    why = plan.third || miss < 2 ? plan.why : `${plan.units.length > 1 ? MUSCLES[m].name.toLowerCase() + ' ' : ''}${sk} nelle ultime ${miss} sedute`;
  } else if (plan.kind === 'cardio') why = plan.why;
  else if (plan.group) why = `domani ${plan.group === 'spinta' ? 'tirata' : 'spinta'}`;
  else if (plan.kind === 'spinta' || plan.kind === 'tirata') {
    const other = plan.kind === 'spinta' ? 'tirata' : 'spinta';
    const r = [...new Set(GROUPS[other].filter(m => plan.ctx.cap[m] === 0).map(NICK))].slice(0, 2);
    why = r.length ? `${listIt(r)} ${r.length > 1 || r[0] === 'braccia' || r[0] === 'spalle' ? 'riposano' : 'riposa'} (meno di 48 ore)` : '';
  } else {
    const behind = MUSCLE_ORDER.filter(m => P[m] !== 'minima' && plan.need[m] >= 2 && has(m)).sort((a, b) => plan.need[b] / plan.ctx.target[b] - plan.need[a] / plan.ctx.target[a]);
    const names = [...new Set(behind.map(NICK))].slice(0, 2);
    why = names.length ? `${listIt(names)} in arretrato` : 'seduta bilanciata su tutti i muscoli';
  }
  let head = planTitle(plan);
  if (seed) { head += ` (tipo ${seed})`; if (plan.kind === 'full') why = 'le prime sedute fissano i carichi di partenza'; }
  const parts = [why ? `${head}: ${why}` : head];
  if (cut >= 3 && dur < usualMinutes(state)) parts.push(`${dur} minuti: il resto passa alle prossime sedute`);
  if (work.length && items.some(i => i.id === 'cardio')) parts.push('cardio in coda');
  return parts.join(' · ');
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
// Zona del muscolo (petto alto, capo lungo, brachiale) scoperta da 2 sedute di quel muscolo, anche per un cambio:
// la seduta dopo sceglie un esercizio che la copre (tra quelli non a "mai")
export function zoneDue(state, m, n = 2) {
  const z = ZONES[m];
  if (!z) return null;
  let since = 0;
  for (let i = state.sessions.length - 1; i >= 0 && since < n; i--) {
    const its = (state.sessions[i].items || []).filter(it => workSets(it).length);
    if (its.some(it => z.ids.includes(it.id))) return null;
    if (its.some(it => (EX[it.id]?.work[m] || 0) >= 1)) since++;
  }
  return since >= n && poolOf(state, m).some(id => z.ids.includes(id)) ? z : null;
}
const inDueZone = (state, id) => !!zoneDue(state, EX[id]?.muscle)?.ids.includes(id);

function keeper(state, m, exs) {
  const z = zoneDue(state, m), zi = z && exs.find(x => z.ids.includes(x.id));
  if (zi) return zi;
  const A = exs.filter(x => exPrio(state, x.id) === 3), C = exs.filter(x => exPrio(state, x.id) < 3);
  if (!A.length || !C.length) return [...exs].sort((a, b) => exPrio(state, b.id) - exPrio(state, a.id))[0];
  const lru = (a, b) => lastUse(state, a.id) - lastUse(state, b.id);
  return anchorTurn(state, m) ? [...A].sort(lru)[0] : [...C].sort(lru)[0];
}

// Finestra per muscolo (per i tagli di tempo e la mini a casa): gli stessi numeri del piano del giorno
function windowCtx(state, today) { return dayCtx(state, recent(state, today), today); }

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

// Seduta dal piano del giorno (planDay): serie per muscolo → esercizi, tempo, superserie, ordine, cardio
function dynamicSession(state, today, now, dur, plan) {
  const { settings } = state;
  const ctx = plan.ctx;
  const need = { ...plan.need };

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
    const want = Math.max(plan.minEx?.[m] || 1, total <= 4 ? 1 : total <= 8 ? 2 : 3);
    // con un solo esercizio si alterna: àncora una volta, la volta dopo il complementare usato meno di recente;
    // se il muscolo ha una zona (petto alto, capo lungo, brachiale), il turno del complementare va a lei
    const zc = ZONES[m] ? comps.filter(id => ZONES[m].ids.includes(id)) : [];
    let cands = want === 1 && comps.length && !anchorTurn(state, m) ? [...zc, ...comps.filter(id => !zc.includes(id)), ...anchors] : [...anchors, ...comps];
    if (!cands.length) continue;
    const k = Math.max(1, Math.min(want, cands.length));
    // zona scoperta da 2 sedute (petto alto, capo lungo, brachiale): uno degli esercizi la copre
    const z = zoneDue(state, m);
    if (z && !cands.slice(0, k).some(id => z.ids.includes(id))) {
      const zi = cands.filter(id => z.ids.includes(id)).sort((a, b) => lastUse(state, a) - lastUse(state, b))[0];
      if (zi) { cands = cands.filter(id => id !== zi); cands.splice(k - 1, 0, zi); }
    }
    total = Math.min(total, k * 5);
    const chunks = Array.from({ length: k }, (_, i) => Math.floor(total / k) + (i < total % k ? 1 : 0));
    chunks.forEach((n, i) => {
      const id = cands[i]; if (!id || n < 1) return;
      used.add(id);
      const it = makeItem(state, id, Math.max(2, n), today);
      if (ctx.cap[m] < 10) it.cap = ctx.cap[m];
      if (z?.ids.includes(id) && !it.note) it.note = `Per il ${z.name}: mancava da 2 sedute`;
      items.push(it);
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

  return { items: sorted, want: wantMin, cut };
}

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
    if (ts.length) ({ start, end } = spanOf(ts));
    else { start = parseDay(cur.date).getTime() + 18 * 36e5; end = start + Math.round(8 + nWork * 2.5 + items.filter(i => i.id === 'cardio' && i.sets.length).reduce((a, i) => a + (i.minutes || 0), 0)) * 60000; }
    const minutes = Math.max(1, Math.round((end - start) / 60000));
    const hard = all.filter(x => x.eff !== 'facile').length / all.length > 0.5;
    const planned = work.filter(i => !i.skipped || i.sets.length);
    // durata scelta per la seduta e minuti che il piano chiedeva prima dei tagli (servono a capire se il livello sta nel tempo)
    if (cur.duration) s.duration = cur.duration;
    if (cur.want) s.want = cur.want;
    Object.assign(s, { items, start, end, minutes, deload: !!cur.deload, seed: cur.seed || null, mini: nWork < MINI_SETS || cur.home === 'mini', free: !!cur.free, home: cur.home || null,
      kind: RESTING.includes(cur.kind) && nWork >= 12 ? null : cur.kind || null,
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
  const at = k => parseDay(k).getTime() + usualStart(state) * 60000;
  for (const k of rec) {
    const plan = k === today && todayPlan ? todayPlan : compose(sim, k, at(k));
    if (k === day) return plan;
    const items = plan.items.map(it => ({ id: it.id, ss: it.ss, planSets: it.planSets, minutes: it.minutes,
      sets: it.id === 'cardio' ? [{ kg: 0, reps: it.minutes, eff: 'giusto' }] : Array.from({ length: it.planSets }, () => ({ kg: it.kg || 0, reps: it.reps, eff: 'giusto' })) }));
    sim.sessions.push({ id: -at(k), date: k, start: at(k), end: at(k) + plan.minutes * 60000, items, seed: plan.seed, deload: plan.deload, frac: 1, duration: plan.duration,
      kind: plan.kind, sim: true, mini: plan.items.filter(i => i.id !== 'cardio').reduce((a, i) => a + i.planSets, 0) < MINI_SETS });
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
  if (Math.abs(nowAvg - base) > 3) { n.protein = Math.round(nowAvg * 2 / 5) * 5; n.proteinBaseWeight = nowAvg; }
}

// Quota dell'allenamento: consumo netto della seduta, (MET − 1) × peso × ore, col MET medio di kcalRange. Tutta in carboidrati.
export function trainingKcal(state, minutes, { superset = false, hard = true } = {}) {
  if (!minutes) return 0;
  const hi = hard ? 6.0 : superset ? 5.8 : 5.0;
  return round10(((3.5 + hi) / 2 - 1) * bodyWeight(state) * minutes / 60);
}
// Calorie del giorno: base (riposo) + quota della seduta. Seduta registrata: quota sulla durata reale.
// Seduta prevista e non ancora fatta (plannedMinutes dall'app): quota stimata "dopo l'allenamento". Altrimenti solo la base.
export function dayNutrition(state, day = dayKey(), plannedMinutes = 0) {
  const n = state.nutrition;
  const s = state.sessions.find(x => x.date === day && x.items?.some(i => (i.sets || []).length));
  let extra = 0, status = 'riposo';
  if (s) {
    const all = s.items.flatMap(i => i.sets || []);
    extra = trainingKcal(state, s.minutes, { superset: s.items.some(i => i.ss), hard: all.filter(x => x.eff !== 'facile').length / Math.max(1, all.length) > 0.5 });
    status = 'fatto';
  } else if (plannedMinutes) { extra = trainingKcal(state, plannedMinutes); status = 'previsto'; }
  return { base: n.kcal, extra, total: n.kcal + extra, status, carbsBase: carbs(n), carbsExtra: Math.round(extra / 4 / 5) * 5 };
}

export const carbs = n => Math.max(0, Math.round((n.kcal - n.protein * 4 - n.fat * 9) / 4 / 10) * 10);

// ---------- Mensa (Nutreetion Lab) ----------
// mensa.json lo scrive ogni lunedì l'automazione su GitHub (tools/mensa.mjs): calorie e macro sono stime dagli ingredienti.
const monday = k => addDays(k, -((parseDay(k).getDay() + 6) % 7));
// Il menu vale per la sua settimana (week: il lunedì; un menu nuovo letto nel weekend vale dal lunedì dopo).
// I file vecchi senza week: la settimana in cui è stato letto l'ultima volta.
export function mensaFor(menu, day = dayKey()) {
  if (!menu?.dishes?.length) return null;
  if (menu.week) return menu.week === monday(day) ? menu : null;
  const ref = menu.checked || menu.updated;
  if (!ref) return null;
  return monday(dayKey(new Date(ref))) === monday(day) ? menu : null;
}
export const proteinIndex = d => d.kcal ? d.p * 100 / d.kcal : 0;   // g di proteine ogni 100 kcal
export const mensaGrade = d => !d.kcal ? null : d.f >= 30 ? 'da evitare' : proteinIndex(d) >= 6 ? 'ottimo' : proteinIndex(d) >= 4 ? 'buono' : 'da evitare';
// Piatti consigliati, il migliore per primo. Regole del personal trainer: almeno 30 g di proteine, grassi sotto 30 g,
// indice proteico ≥ 4; nel giorno di allenamento conta anche avere più carboidrati, a riposo solo le proteine.
export function mensaRank(menu, training) {
  const all = (menu?.dishes || []).filter(d => d.kcal > 0);
  const strict = all.filter(d => d.p >= 30 && d.f < 30 && proteinIndex(d) >= 4);
  const pool = strict.length ? strict : all.filter(d => proteinIndex(d) >= 4);
  const score = d => proteinIndex(d) + (training ? d.c / 15 : 0);
  return (pool.length ? pool : all).slice().sort((a, b) => score(b) - score(a));
}
export const isOfficeDay = (state, day) => (state.settings.office || [1, 2, 3, 4, 5]).includes(parseDay(day).getDay());

// ---------- Allenamento a casa ----------
// Manubri componibili: un manubrio = manico + gli stessi dischi sui due lati. In coppia ogni lato può avere
// un quarto dei dischi di ogni tipo; con un manubrio solo, la metà.
const HOME_SINGLE = ['Goblet_Squat', 'Standing_Dumbbell_Triceps_Extension', 'One-Arm_Dumbbell_Row', 'One-Arm_Side_Laterals', 'Concentration_Curls', 'Standing_Dumbbell_Calf_Raise'];
export const homeSingle = id => HOME_SINGLE.includes(id);
export function homeLoads(state, single = false) {
  const db = state.settings.homeDb || { handle: 0.5, plates: { 2: 4, 1.5: 4, 1.25: 4 } };
  const sizes = Object.entries(db.plates).map(([k, n]) => [+k, Math.floor(n / (single ? 2 : 4))]).filter(([, n]) => n > 0);
  let combos = [[]];
  for (const [p, n] of sizes) combos = combos.flatMap(c => Array.from({ length: n + 1 }, (_, i) => [...c, ...Array(i).fill(p)]));
  const by = new Map();
  for (const side of combos) {
    const kg = Math.round((db.handle + 2 * side.reduce((a, b) => a + b, 0)) * 100) / 100;
    const old = by.get(kg);
    if (!old || side.length < old.length) by.set(kg, side.sort((a, b) => b - a));   // a parità di peso, meno dischi
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([kg, side]) => ({ kg, side }));
}
// Peso più vicino fattibile con i manubri di casa
export const homeSnap = (state, id, kg) => {
  const L = homeLoads(state, homeSingle(id));
  return L.reduce((a, b) => Math.abs(b.kg - kg) < Math.abs(a.kg - kg) ? b : a).kg;
};
export const homeStep = (state, id, kg, d) => {
  const L = homeLoads(state, homeSingle(id)).map(x => x.kg);
  if (d > 0) return L.find(v => v > (kg ?? 0) + 0.01) ?? L[L.length - 1];
  return [...L].reverse().find(v => v < (kg ?? 0) - 0.01) ?? L[0];
};
// "Cambia esercizio" a casa: il prossimo esercizio di casa dello stesso muscolo (prima i più prioritari)
const homeState = state => ({ ...state, settings: { ...state.settings, plan: state.settings.homePlan || HOME_PLAN } });
export function nextHome(state, id, used = new Set()) {
  const hs = homeState(state);
  const ring = muscleList(hs, EX[id]?.muscle, x => x.home); const at = ring.indexOf(id);
  return [...ring.slice(at + 1), ...ring.slice(0, Math.max(0, at))].find(x => x !== id && !used.has(x)) || null;
}
export const homeSide = (state, id, kg) => homeLoads(state, homeSingle(id)).find(x => Math.abs(x.kg - kg) < 0.01)?.side || null;

// Carico e ripetizioni a casa: quello che direbbe la palestra, portato ai pesi dei manubri.
// Al peso massimo si sale con le ripetizioni (fino a 25): con carichi leggeri il muscolo cresce lo stesso
// se si arriva vicino al limite (meta-analisi Schoenfeld 2017).
// Primo carico a casa (stime per manubri leggeri: meglio partire facili e salire con le ripetizioni)
const HOME_START = { Dumbbell_Floor_Press: 10, Side_Lateral_Raise: 4.5, 'One-Arm_Side_Laterals': 4.5, Reverse_Flyes: 4.5, Hammer_Curls: 7,
  Dumbbell_Bicep_Curl: 7, Concentration_Curls: 7, Standing_Dumbbell_Triceps_Extension: 10, Tricep_Dumbbell_Kickback: 4.5, 'One-Arm_Dumbbell_Row': 14.5,
  Dumbbell_Shoulder_Press: 7.5, Goblet_Squat: 14.5, 'Stiff-Legged_Dumbbell_Deadlift': 10, Standing_Dumbbell_Calf_Raise: 10,
  'Seated_Dumbbell_Palms-Up_Wrist_Curl': 6, 'Seated_Dumbbell_Palms-Down_Wrist_Curl': 3 };
export function homeItem(state, id, sets, today) {
  const it = makeItem(state, id, sets, today, true);
  const e = EX[id];
  if (e.equip !== 'manubri') return { ...it, home: true };
  const r = TYPE_RULES[e.type];
  const L = homeLoads(state, homeSingle(id)).map(x => x.kg), max = L[L.length - 1];
  const hh = history(state, id).filter(p => p.home), last = hh[0];
  const prev = last?.sets?.[0]?.kg || 0;
  let kg = it.kg, reps = it.reps, note = it.note;
  if (!last) {   // prima volta a casa: carico di partenza, ripetizioni alte
    kg = homeSnap(state, id, Math.min(HOME_START[id] ?? 4.5, kg || 99));
    reps = Math.max(reps, r.min + 4); note = 'Prima volta a casa: prova il peso e fermati a 1–3 ripetizioni dal limite';
  } else if (kg > max + 0.01 || (Math.abs(prev - max) < 0.01 && kg >= max)) {
    kg = max;
    const atMax = Math.abs(prev - max) < 0.01;
    reps = atMax ? Math.min(25, Math.min(...last.sets.map(x => x.reps)) + 1) : r.max;
    note = 'Manubri al peso massimo: una ripetizione in più ogni volta, fino a 25';
  } else if (kg > prev + 0.01) kg = L.find(v => v > prev + 0.01) ?? max;
  else kg = homeSnap(state, id, kg);
  return { ...it, kg, reps, note, home: true };
}

// kind 'mini': 15–20 minuti sui muscoli più indietro nei 7 giorni, che non hanno lavorato nelle ultime 36 ore
// e che non lavoreranno in palestra domani. kind 'full': una seduta completa al posto della palestra (45').
export function composeHome(state, today = dayKey(), now = Date.now(), kind = 'mini') {
  const hs = homeState(state);
  if (kind === 'full') {
    const plan = planDay(state, today, { home: true, at: sessionTime(state, today, now) });
    const res = plan.kind === 'cardio' ? { items: [] } : dynamicSession(hs, today, now, 45, plan);
    const items = res.items.filter(i => i.id !== 'cardio').map(i => { const h = homeItem(hs, i.id, i.planSets, today); return { ...h, ss: i.ss, note: i.note?.startsWith('Per il') ? i.note : h.note }; });
    return { date: today, items, reason: 'A casa al posto della palestra · ' + reasonFor(hs, plan, items).split(' · ')[0], home: 'full', kind: plan.kind, forced: true, deload: false, cycle: state.cycle.n,
      minutes: itemMinutes(items, 5), duration: 45, cur: 0, view: 'list' };
  }
  const ctx = windowCtx(state, today);
  // muscoli della prossima seduta in palestra, se è domani
  const tomorrow = addDays(today, 1), busy = new Set();
  if (recommendedDays(state, today).includes(tomorrow)) {
    let f = null; try { f = forecast(state, tomorrow, null, today); } catch { f = null; }
    for (const it of f?.items || []) for (const [m, w] of Object.entries(EX[it.id]?.work || {})) if (w >= 1) busy.add(m);
  }
  const AESTHETIC = ['laterali', 'tricipiti', 'bicipiti', 'posteriori', 'petto', 'addome', 'polpacci', 'avambracci'];
  const cand = AESTHETIC.filter(m => !busy.has(m) && hoursSince(state, m, now) >= 36 && poolOf(hs, m).length).map(m => {
    const prio = { alta: 3, normale: 2, minima: 1 }[state.settings.priority[m] || 'normale'];
    return { m, score: (1 - ctx.win7[m] / ctx.target[m]) * (1 + prio / 3) };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  // tre esercizi da tre serie, in superserie dove si può (bicipiti + tricipiti, laterali + posteriori)
  const pick = cand.slice(0, 3).map(x => x.m);
  const items = pick.map(m => {
    const pool = poolOf(hs, m).map(id => [id, exPrio(hs, id)]).sort((a, b) => b[1] - a[1] || lastUse(state, a[0]) - lastUse(state, b[0]));
    // àncora una volta e complementare la volta dopo, come in palestra
    const top = pool.filter(([, p]) => p === pool[0][1]).map(([id]) => id);
    const comp = pool.filter(([, p]) => p === 2).map(([id]) => id);
    const used = top.some(id => sinceUse(hs, id, m) === 0);
    const id = used && comp.length ? comp[0] : top[0];
    return homeItem(hs, id, 3, today);
  });
  pairUp(hs, items, today);
  const names = pick.map(m => MUSCLES[m].name.toLowerCase());
  const reason = items.length ? `I muscoli più indietro questa settimana: ${names.join(', ').replace(/, ([^,]*)$/, ' e $1')}` : 'Oggi niente da recuperare: riposo';
  return { date: today, items, reason, home: 'mini', forced: true, deload: false, cycle: state.cycle.n,
    minutes: itemMinutes(items, 3), duration: 20, cur: 0, view: 'list' };
}
