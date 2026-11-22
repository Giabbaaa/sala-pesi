// Logica dell'app: composizione dinamica della seduta, progressione dei carichi,
// calendario consigliato, cicli, stime. Nessun accesso al DOM: testabile in Node.
import { EX, MUSCLES, MUSCLE_ORDER, TYPE_RULES, TARGETS, DEFAULT_PRIORITY, DEFAULT_PLAN, START_LOADS, SEED } from './catalog.js';

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
export function initialState() {
  return {
    v: 1,
    settings: {
      freq: 3,
      unavailable: [],
      priority: { ...DEFAULT_PRIORITY },
      plan: JSON.parse(JSON.stringify(DEFAULT_PLAN)),
      ex: {},                        // per esercizio: { inc, plates, base, note }
      plates: [20, 10, 5, 2.5, 1.25],
      sessionMinutes: 65,
    },
    sessions: [],
    current: null,
    cycle: { n: 1, level: 0, startCount: 0, length: 16, deloadLeft: 0, goal: 'Chest press da 55 a 60 kg × 10 · peso medio −3 kg', history: [] },
    body: { weights: [], waist: [] },
    nutrition: { kcal: 2150, protein: 160, fat: 60, last: '', lastAdj: null, proteinBaseWeight: null },
  };
}

export function migrate(s) {
  const base = initialState();
  if (!s || typeof s !== 'object') return base;
  const out = { ...base, ...s };
  out.settings = { ...base.settings, ...(s.settings || {}) };
  out.settings.priority = { ...base.settings.priority, ...(out.settings.priority || {}) };
  out.settings.plan = { ...base.settings.plan, ...(out.settings.plan || {}) };
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
  return { inc: s.inc ?? defInc, incSet: s.inc != null, plates: !!s.plates, base: s.base ?? 0, note: s.note || '' };
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

export function recommendedDays(state, today = dayKey()) {
  const freq = state.settings.freq || 3;
  const minGap = Math.max(1, Math.floor(7 / freq));
  const late = Math.ceil(7 / freq);
  const unav = state.settings.unavailable || [];
  const taken = doneDays(state);
  const inWindow = k => { let n = 0; for (let i = 1; i <= 6; i++) if (taken.has(addDays(k, -i))) n++; return n; };
  const fits = k => !unav.includes(weekday(k)) && !(taken.has(addDays(k, -1)) && taken.has(addDays(k, -2))) && inWindow(k) < freq;
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
  while (cand && out.length < 6) {
    out.push(cand); taken.add(cand);
    cand = next(cand, addDays(cand, 1));
  }
  return out;
}

export function strip(state, today = dayKey()) {
  const rec = new Set(recommendedDays(state, today));
  const done = doneDays(state);
  const days = [];
  for (let i = -3; i <= 3; i++) {
    const k = addDays(today, i);
    const s = state.sessions.find(x => x.date === k);
    const frac = s && !s.free ? s.frac ?? 1 : null;      // seduta del piano: anello pieno o parziale
    days.push({ key: k, label: DAY_SHORT[weekday(k)], num: parseDay(k).getDate(), today: i === 0, done: done.has(k), frac, extra: !!s?.free, rec: !done.has(k) && rec.has(k) && i >= 0 });
  }
  return days;
}

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
  const ref = bestE1rm(h[3].sets);
  return h.slice(0, 3).every(p => bestE1rm(p.sets) <= ref + 0.01);
}

// Pausa più lunga (in giorni) tra due sedute qualsiasi, da una data fino a oggi
export function longestBreak(state, from, today = dayKey()) {
  const days = [...new Set(state.sessions.map(s => s.date).filter(d => d > from && d < today))].sort();
  let prev = from, max = 0;
  for (const d of [...days, today]) { max = Math.max(max, diffDays(d, prev)); prev = d; }
  return max;
}

export function suggestion(state, id, today = dayKey()) {
  const e = EX[id]; const r = TYPE_RULES[e.type]; const { inc } = exSettings(state, id);
  const h = history(state, id).filter(p => !p.deload);
  const isTime = e.type === 'time';
  if (!h.length) {
    const kg = isTime ? 0 : (START_LOADS[id] ?? null);
    return { kg, reps: r.min, note: kg == null ? 'Prima serie di prova: scegli tu il carico' : '', last: null };
  }
  const last = h[0]; const sets = last.sets;
  const kg0 = sets[0].kg || 0;
  const minReps = Math.min(...sets.map(s => s.reps));
  const gap = longestBreak(state, last.date, today);
  let kg = kg0, reps = Math.max(r.min, Math.min(r.max, minReps + (isTime ? 5 : 1))), note = '';
  const allTop = sets.every(s => s.reps >= r.max) && sets.every(s => s.eff !== 'limite');
  const allEasy = sets.every(s => s.eff === 'facile');
  if (gap >= 28) { kg = roundTo(kg0 * 0.8, inc); reps = r.min; note = 'Ripresa dopo una pausa: −20%'; }
  else if (gap >= 14) { kg = roundTo(kg0 * 0.9, inc); reps = r.min; note = 'Ripresa dopo una pausa: −10%'; }
  else if (stalled(state, id)) { kg = roundTo(kg0 * 0.9, inc); reps = r.min; note = 'Fermo da 3 sedute: −10% e si risale'; }
  else if (allTop) {
    if (isTime) { reps = r.max; note = 'Tempo al massimo: prova una variante più dura'; }
    else {
      const steps = allEasy ? 2 : 1;
      kg = Math.min(kg0 + steps * inc, Math.max(kg0 + inc, roundTo(kg0 * 1.1, inc)));
      reps = r.min; note = `Sali di carico: +${fmtKg(kg - kg0)} kg`;
    }
  } else if (sets[0].reps < r.min && sets[0].eff === 'limite' && !isTime) {
    kg = Math.max(inc, roundTo(kg0 * 0.925, inc)); reps = r.min; note = 'Troppo pesante l’ultima volta: carico ridotto';
  }
  if (isTime) kg = 0;
  return { kg, reps, note, last };
}

export function warmups(state, id, kg) {
  const e = EX[id];
  if (e.type !== 'multi' || !kg) return [];
  const { inc } = exSettings(state, id);
  return [{ kg: roundTo(kg * 0.5, inc), reps: 10 }, { kg: roundTo(kg * 0.75, inc), reps: 5 }];
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

export function itemMinutes(items) {
  let sets = 0;
  const groups = groupItems(items);
  for (const g of groups) {
    if (g.cardio) { sets += g.items[0].minutes / 2.5; continue; }
    if (g.items.length > 1) sets += Math.max(...g.items.map(i => i.planSets)) * 1.5;
    else sets += g.items[0].planSets;
  }
  return Math.round(8 + sets * 2.5); // 8 min di cardio leggero iniziale
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

function anchorDue(state, m) {
  const anchor = state.settings.plan[m].anchor;
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    const trained = s.items.some(it => (EX[it.id]?.work[m] || 0) >= 1 && workSets(it).length);
    if (trained) return !s.items.some(it => it.id === anchor);
  }
  return true;
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

export function compose(state, today = dayKey(), now = Date.now()) {
  const cyc = cycleInfo(state);
  const deload = state.cycle.deloadLeft > 0;
  const nonDeload = state.sessions.filter(s => !s.deload && counts(s)).length;
  let res;
  if (nonDeload < 4) res = seedSession(state, today);
  else res = dynamicSession(state, today, now);
  if (deload) {
    res.items.forEach(it => { if (it.id !== 'cardio') it.planSets = Math.max(1, Math.round(it.planSets / 2)); });
    res.reason = `Scarico (${4 - state.cycle.deloadLeft} di 3): metà serie, stessi carichi, sforzo facile o giusto`;
  }
  const minutes = itemMinutes(res.items);
  return { date: today, items: res.items, reason: res.reason, seed: res.seed || null, deload, cycle: cyc.n, minutes, cur: 0, view: 'list' };
}

function dynamicSession(state, today, now) {
  const { settings } = state;
  const freq = settings.freq;
  const done = setsByMuscle(state, addDays(today, -3), today);
  const future = recommendedDays(state, today).filter(k => k > today && diffDays(k, today) <= 3).length;
  const need = {}, target = {}, light = [];
  for (const m of MUSCLE_ORDER) {
    target[m] = targetFor(state, m);
    const quota = target[m] / freq;
    let n = target[m] - done[m] - quota * future;
    n = Math.min(n, target[m] * 0.6, 10);
    // Recupero: allenato ieri (o oggi) → al massimo un terzo della quota; tra 24 e 36 ore → metà
    const h = hoursSince(state, m, now);
    const d = daysSince(state, m, today);
    if (d <= 1 && h < 24) { n = Math.min(n, quota / 3); if (done[m] >= 2) light.push(m); }
    else if (d <= 1) { n = Math.min(n, quota / 2); if (done[m] >= 2) light.push(m); }
    need[m] = Math.max(0, n);
  }
  const start = { ...need };

  // Ordine di lavoro: prima i muscoli con multiarticolari (danno serie indirette), poi priorità e arretrato
  const hasCompoundAnchor = m => EX[settings.plan[m].anchor]?.type === 'multi';
  const order = [...MUSCLE_ORDER].sort((a, b) =>
    (hasCompoundAnchor(b) - hasCompoundAnchor(a)) ||
    (PRIO_RANK[settings.priority[a]] - PRIO_RANK[settings.priority[b]]) ||
    (need[b] - need[a]));

  const items = []; const used = new Set();
  for (const m of order) {
    let r = need[m];
    if (r < 1) continue;
    let total = Math.min(10, Math.max(2, Math.round(r)));
    const plan = settings.plan[m];
    const comps = plan.comp.filter(id => EX[id] && !used.has(id)).sort((a, b) => lastUse(state, a) - lastUse(state, b));
    let cands = anchorDue(state, m) ? [plan.anchor, ...comps] : [...comps, plan.anchor];
    cands = cands.filter(id => EX[id] && !used.has(id));
    // 1 esercizio fino a 4 serie, 2 fino a 8, poi 3 (se ce ne sono abbastanza); max 5 serie per esercizio
    const want = total <= 4 ? 1 : total <= 8 ? 2 : 3;
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

  // Tempo: si taglia prima la priorità normale, poi l'alta; ogni muscolo tiene almeno
  // le serie della priorità minima (2 a seduta); i muscoli a priorità minima non si toccano
  const limit = settings.sessionMinutes + 3;
  const prioOf = it => settings.priority[EX[it.id].muscle];
  const muscleSets = m => items.filter(it => EX[it.id].muscle === m).reduce((a, it) => a + it.planSets, 0);
  // Taglio di una serie: dal muscolo con più serie; prima si accorcia l'esercizio più lungo,
  // poi si toglie un complementare (l'àncora resta sempre)
  const cutOne = level => {
    const muscles = [...new Set(items.filter(it => prioOf(it) === level).map(it => EX[it.id].muscle))]
      .filter(m => muscleSets(m) > 2).sort((a, b) => muscleSets(b) - muscleSets(a));
    for (const m of muscles) {
      const exs = items.filter(it => EX[it.id].muscle === m);
      const big = [...exs].sort((a, b) => b.planSets - a.planSets)[0];
      if (big.planSets > 2) { big.planSets--; return true; }
      if (exs.length > 1) {
        const drop = exs.find(it => it.id !== settings.plan[m].anchor) || exs[exs.length - 1];
        items.splice(items.indexOf(drop), 1); return true;
      }
    }
    return false;
  };
  for (const level of ['normale', 'alta']) {
    let guard = 0;
    while (itemMinutes(items) > limit && guard++ < 80 && cutOne(level));
  }

  // Superserie: bicipiti + tricipiti, laterali + posteriori (solo isolamenti)
  const pair = (m1, m2, tag) => {
    const a = items.find(it => EX[it.id].muscle === m1 && EX[it.id].type === 'iso' && !it.ss);
    const b = items.find(it => EX[it.id].muscle === m2 && EX[it.id].type === 'iso' && !it.ss);
    if (a && b) { a.ss = b.ss = tag; a.planSets = b.planSets = Math.max(a.planSets, b.planSets); }
  };
  pair('bicipiti', 'tricipiti', 's1'); pair('bicipiti', 'tricipiti', 's2');
  pair('laterali', 'posteriori', 's3');

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

  // Cardio extra se il volume è coperto e avanza tempo
  const mins = itemMinutes(sorted);
  if (mins < settings.sessionMinutes - 15) {
    const extra = Math.min(25, Math.max(15, settings.sessionMinutes - mins));
    sorted.push({ id: 'cardio', minutes: extra, planSets: 0, sets: [], skipped: false, ss: null });
  }

  // Una riga che spiega il perché
  const behind = MUSCLE_ORDER.filter(m => settings.priority[m] !== 'minima' && start[m] >= 2)
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
  if (!sorted.filter(i => i.id !== 'cardio').length) parts.push('Volume già coperto: oggi cardio e recupero');
  else if (sorted.some(i => i.id === 'cardio')) parts.push('cardio extra in coda');
  return { items: sorted, reason: parts.join(' · ') || 'Seduta bilanciata su tutti i muscoli' };
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
  // record: miglior massimale stimato rispetto allo storico precedente
  const records = [];
  for (const it of items) {
    if (!EX[it.id] || !it.sets.length || EX[it.id].type === 'time') continue;
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
    c.levelUp = !!sets.length && sets.filter(x => x.eff === 'giusto').length / sets.length >= 0.5 && stalls < 3;
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
  const items = cur.items.map(it => ({ id: it.id, ss: it.ss || null, planSets: it.planSets, sets: (it.sets || []).filter(Boolean), skipped: !!it.skipped, minutes: it.minutes }));
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
    const ts = all.map(x => x.t || now);
    const start = Math.min(...ts) - 4 * 60000, end = Math.max(...ts) + 2 * 60000;
    const minutes = Math.max(1, Math.round((end - start) / 60000));
    const hard = all.filter(x => x.eff !== 'facile').length / all.length > 0.5;
    const planned = work.filter(i => !i.skipped || i.sets.length);
    Object.assign(s, { items, start, end, minutes, deload: !!cur.deload, seed: cur.seed || null, mini: nWork < MINI_SETS, free: !!cur.free,
      frac: planned.length ? planned.filter(isItemDone).length / planned.length : 1,
      kcal: kcalRange(state, minutes, { superset: items.some(i => i.ss), hard }) });
    const others = { sessions: state.sessions.filter(x => x !== s) };
    s.records = [];
    for (const it of items) {
      if (!EX[it.id] || !it.sets.length || EX[it.id].type === 'time') continue;
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
