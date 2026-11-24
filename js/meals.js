// Menu del giorno: colazione, pranzo, merenda e cena che insieme arrivano a calorie e proteine del giorno.
// Solo suggerimenti: i pasti veri si registrano in Yazio. La cena "chiude i conti" (grammature calcolate).
import { addDays, parseDay, dayKey, mensaFor, mensaRank, mensaGrade, proteinIndex, isOfficeDay } from './engine.js';

// Valori per 100 g: [kcal, proteine, carboidrati, grassi]. pc/unit: si mostra a pezzi (fette, uova).
export const FOOD = {
  yogurt: { name: 'yogurt greco 0%', v: [57, 10, 3.5, 0.2] },
  muesli: { name: 'muesli proteico', v: [420, 24, 45, 13] },
  soia: { name: 'fiocchi di soia', v: [380, 41, 12, 18] },
  whey: { name: 'whey', v: [398, 80, 8, 6] },                    // etichetta di Giabba: 30 g = 24 g di proteine
  frutto: { name: 'frutto', v: [52, 0.3, 14, 0.2], pc: 150, unit: ['frutto', 'frutti'] },
  banana: { name: 'banana', v: [89, 1.1, 23, 0.3], pc: 120, unit: ['banana', 'banane'] },
  mandorle: { name: 'mandorle', v: [580, 21, 10, 50] },
  noci: { name: 'noci', v: [650, 15, 7, 65] },
  quark: { name: 'quark magro', v: [70, 12, 4, 0.3] },
  fiocchiLatte: { name: 'fiocchi di latte', v: [100, 12, 3, 4.5] },
  pollo: { name: 'pollo o tacchino', v: [110, 23, 0, 1.5] },
  salmone: { name: 'salmone crudo', v: [208, 20, 0, 13] },
  carneSalata: { name: 'carne salata', v: [104, 22, 0, 1.5] },
  bresaola: { name: 'bresaola', v: [150, 32, 0, 2] },
  tartare: { name: 'tartare di scottona', v: [116, 21, 0, 3.5] },
  pesce: { name: 'merluzzo o pesce bianco', v: [80, 18, 0, 0.7] },
  tonno: { name: 'tonno al naturale', v: [110, 25, 0, 1] },
  uova: { name: 'uova', v: [140, 12.5, 0.5, 10], pc: 60, unit: ['uovo', 'uova'] },
  albume: { name: 'albumi', v: [50, 11, 0.7, 0.2] },
  pasta: { name: 'pasta o riso', v: [358, 11, 74, 1.2] },
  riso: { name: 'riso o spaghetti di riso', v: [360, 7, 79, 0.6] },
  pane: { name: 'pane', v: [260, 9, 50, 2.5] },
  wasa: { name: 'Wasa integrale', v: [340, 9, 65, 1.5], pc: 9, unit: ['fetta di Wasa', 'fette di Wasa'] },
  patate: { name: 'patate', v: [77, 2, 17, 0.1] },
  verdure: { name: 'verdure', v: [25, 1.5, 4, 0.2], free: true },  // a piacere: si conta una porzione da 200 g
  olio: { name: 'olio', v: [900, 0, 0, 100] },
  poke: { name: 'poke con salmone o pollo, senza salse', v: [600, 35, 70, 18], dish: true },
  panino: { name: 'panino con bresaola o pollo + 1 frutto', v: [480, 30, 62, 10], dish: true },
  insalatona: { name: 'insalatona con pollo o tonno e uova + pane', v: [520, 38, 40, 22], dish: true },
};

// Colazione di Giabba (24/11): vasetto di yogurt greco 150 g + 15 g muesli proteico + 15 g fiocchi di soia.
const COLAZIONE = [['yogurt', 150], ['muesli', 15], ['soia', 15]];
const COLAZIONE_PLUS = [...COLAZIONE, ['whey', 15]];               // "rinforzata": whey mescolata nello yogurt

// Merende (id stabili: la lista si può allungare, mai rinumerare)
const MERENDE = [
  { id: 'whey-banana', name: 'Whey e banana', items: [['whey', 30], ['banana', 120]] },
  { id: 'whey-mandorle', name: 'Whey e mandorle', items: [['whey', 30], ['mandorle', 20]] },
  { id: 'whey-frutto', name: 'Whey e frutto', items: [['whey', 30], ['frutto', 150]] },
  { id: 'yogurt-frutto', name: 'Yogurt greco e frutto', items: [['yogurt', 150], ['frutto', 150]] },
  { id: 'quark-frutto', name: 'Quark e frutto', items: [['quark', 250], ['frutto', 150]] },
  { id: 'wasa-bresaola', name: 'Wasa e bresaola', items: [['wasa', 18], ['bresaola', 50]] },
  { id: 'frutto-noci', name: 'Frutto e noci', items: [['frutto', 150], ['noci', 15]] },
];

// Pranzi a casa o fuori: porzioni fisse
const PRANZI = [
  { id: 'pasta-tonno', name: 'Pasta al tonno', items: [['pasta', 90], ['tonno', 120], ['verdure', 200], ['olio', 10]] },
  { id: 'wasa-bresaola', name: 'Wasa, bresaola e fiocchi di latte', items: [['wasa', 36], ['bresaola', 80], ['fiocchiLatte', 200], ['verdure', 200], ['olio', 10]] },
  { id: 'tartare-patate', name: 'Tartare e patate', items: [['tartare', 200], ['patate', 250], ['verdure', 200], ['olio', 10]] },
  { id: 'riso-pollo', name: 'Riso e pollo', items: [['riso', 80], ['pollo', 150], ['verdure', 200], ['olio', 10]] },
  { id: 'poke', name: 'Poke, fuori', out: true, items: [['poke', 100]] },
  { id: 'panino', name: 'Panino, fuori', out: true, items: [['panino', 100]] },
  { id: 'insalatona', name: 'Insalatona, fuori', out: true, items: [['insalatona', 100]] },
];

// Cene: la proteina e i carboidrati si adattano a quanto manca. carb: [allenamento, riposo]
// L'olio (oil) si adatta ai grassi che mancano per arrivare al minimo del giorno.
const CENE = [
  { id: 'pollo', name: 'Pollo o tacchino', prot: ['pollo', 150, 300], carb: [['pasta', 60, 150], ['pane', 50, 130]], fixed: [['verdure', 200]], oil: [5, 20] },
  { id: 'salmone', name: 'Salmone crudo e carne salata', prot: ['salmone', 100, 175], carb: [['riso', 60, 150], ['wasa', 18, 72]], fixed: [['carneSalata', 50], ['verdure', 200]], oil: [0, 15] },
  { id: 'tartare', name: 'Tartare di scottona', prot: ['tartare', 150, 300], carb: [['pasta', 60, 150], ['patate', 150, 400]], fixed: [['verdure', 200]], oil: [5, 20] },
  { id: 'pesce', name: 'Pesce bianco', prot: ['pesce', 200, 400], carb: [['riso', 60, 150], ['patate', 150, 400]], fixed: [['verdure', 200]], oil: [10, 20] },
  { id: 'uova', name: 'Uova e albumi', prot: ['albume', 100, 300], carb: [['pane', 50, 150], ['pane', 50, 130]], fixed: [['uova', 120], ['verdure', 200]], oil: [5, 20] },
  { id: 'quark', name: 'Quark e salmone', prot: ['quark', 150, 300], carb: [['pane', 50, 130], ['wasa', 18, 72]], fixed: [['salmone', 100], ['verdure', 200]], oil: [0, 15] },
];

const sum = items => items.reduce((t, [k, g]) => { const v = FOOD[k].v; return t.map((x, i) => x + v[i] * g / 100); }, [0, 0, 0, 0]);
const round = (g, step) => Math.max(step, Math.round(g / step) * step);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const dayNum = k => Math.round(parseDay(k).getTime() / 864e5);

// "pollo o tacchino 250 g" · "2 uova" · "4 fette di Wasa" · "verdure a piacere"
export function itemText([k, g]) {
  const f = FOOD[k];
  if (f.dish) return f.name;
  if (f.free) return `${f.name} a piacere`;
  if (k === 'olio') return g < 10 ? '1 cucchiaino d’olio' : `${Math.round(g / 10)} ${g < 15 ? 'cucchiaio' : 'cucchiai'} d’olio`;
  if (f.pc) { const n = Math.max(1, Math.round(g / f.pc)); return `${n} ${f.unit[n === 1 ? 0 : 1]}`; }
  return `${f.name} ${g} g`;
}

// Cena: prima la proteina che manca, poi l'olio per i grassi minimi, poi i carboidrati per le calorie che restano
function dinner(tpl, training, needK, needP, needF) {
  const [ck, cmin, cmax] = tpl.carb[training ? 0 : 1];
  const [pk, pmin, pmax] = tpl.prot;
  const fx = sum(tpl.fixed), cs = FOOD[ck].pc ? FOOD[ck].pc : 10;
  let gc = (cmin + cmax) / 2, gp = pmin, go = tpl.oil[0];
  for (let i = 0; i < 3; i++) {
    gp = clamp(round((needP - fx[1] - FOOD[ck].v[1] * gc / 100) * 100 / FOOD[pk].v[1], 10), pmin, pmax);
    go = clamp(Math.round((needF - fx[3] - FOOD[pk].v[3] * gp / 100 - FOOD[ck].v[3] * gc / 100) / 5) * 5, tpl.oil[0], tpl.oil[1]);
    gc = clamp(round((needK - fx[0] - 9 * go - FOOD[pk].v[0] * gp / 100) * 100 / FOOD[ck].v[0], cs), cmin, cmax);
  }
  return [[pk, gp], [ck, gc], ...tpl.fixed, ...(go ? [['olio', go]] : [])];
}

const meal = (key, label, items, extra = {}) => ({ key, label, items, v: sum(items).map(Math.round), ...extra });
const tot = list => list.reduce((t, x) => t.map((y, i) => y + x.v[i]), [0, 0, 0, 0]);
const mensaMeal = (d, extra = {}) => ({ key: 'pranzo', label: 'Pranzo', mensa: true, dish: d, text: `${d.name} + 1 frutto`, v: [d.kcal + 78, d.p, d.c + 21, d.f].map(Math.round), ...extra });

// Il menu di un giorno. target: { kcal, protein, fat, training }. mensaMenu: il contenuto di mensa.json (o null).
// Le scelte di Giabba stanno in state.meals.pick[giorno]: { colazione, pranzo ('m:<id>' mensa | id), dish, merenda, cena }.
// over: scelte provvisorie (per mostrare nella lista come verrebbe ogni possibilità).
export function dayMenu(state, day, target, mensaMenu, over = {}) {
  const pick = { ...(state.meals?.pick?.[day] || {}), ...over }, n = dayNum(day);
  const training = !!target.training;
  const menu = mensaFor(mensaMenu, day);

  // Pranzo: quello scelto; se non c'è, si fanno i conti con il consigliato e la scheda mostra "Scegli"
  let pranzo = null;
  if (pick.pranzo?.startsWith('m:')) {
    const d = (pick.dish && 'm:' + pick.dish.id === pick.pranzo) ? pick.dish : menu?.dishes.find(x => 'm:' + x.id === pick.pranzo);
    if (d) pranzo = mensaMeal(d, { chosen: true });
  } else if (pick.pranzo) {
    const p = PRANZI.find(x => x.id === pick.pranzo);
    if (p) pranzo = meal('pranzo', 'Pranzo', p.items, { out: p.out, chosen: true });
  }
  if (!pranzo) {
    const best = menu && isOfficeDay(state, day) ? mensaRank(menu, training)[0] : null;
    const p = PRANZI[n % PRANZI.length];
    pranzo = best ? mensaMeal(best, { choose: true }) : meal('pranzo', 'Pranzo', p.items, { out: p.out, choose: true });
  }

  const mer = MERENDE.find(x => x.id === pick.merenda);
  const merItems = (mer || MERENDE[training ? 0 : 1]).items;
  // cena scelta, oppure a rotazione senza ripetere la proteina del pranzo
  let cena = CENE.find(x => x.id === pick.cena);
  if (!cena) {
    const lunchFoods = new Set((pranzo.items || []).map(x => x[0]));
    let ci = n;
    for (let i = 0; i < CENE.length && lunchFoods.has(CENE[ci % CENE.length].prot[0]); i++) ci++;
    cena = CENE[ci % CENE.length];
  }
  const fat = target.fat || 60;

  const build = (plus, extra = []) => {
    const col = meal('colazione', 'Colazione', plus ? COLAZIONE_PLUS : COLAZIONE, { chosen: pick.colazione != null });
    const mer2 = meal('merenda', 'Merenda', [...merItems, ...extra], { chosen: !!mer });
    const before = tot([col, pranzo, mer2]);
    const din = meal('cena', 'Cena', dinner(cena, training, target.kcal - before[0], target.protein - before[1], fat - before[3]), { chosen: !!pick.cena, id: cena.id });
    const meals = [col, pranzo, mer2, din];
    return { meals, total: tot(meals).map(Math.round) };
  };
  // Colazione rinforzata quando le proteine non bastano (o se scelta)
  const plus = pick.colazione != null ? pick.colazione === 'rinforzata' : build(false).total[1] < target.protein - 8;
  let r = build(plus);
  // la cena è al massimo e mancano ancora calorie: un frutto in più a merenda (se non l'hai scelta tu), poi pane a cena
  if (!mer && r.total[0] < target.kcal - 120) r = build(plus, [['frutto', 150]]);
  const short = target.kcal - r.total[0];
  if (short > 90) {
    const din = r.meals[3], hasPane = din.items.some(x => x[0] === 'pane');
    const add = hasPane ? ['frutto', 150] : ['pane', clamp(round(short / 2.6, 10), 30, 80)];
    r.meals[3] = { ...din, ...meal('cena', 'Cena', [...din.items, add]), chosen: din.chosen, id: din.id };
    r.total = tot(r.meals).map(Math.round);
  }
  return { ...r, training, hasMensa: !!menu };
}

// Le possibilità di un pasto, ognuna con i numeri che avrebbe se scelta (la cena con le grammature del giorno)
export function mealOptions(state, day, target, mensaMenu, key) {
  const cur = state.meals?.pick?.[day]?.[key];
  const one = (id, over, title) => {
    const x = dayMenu(state, day, target, mensaMenu, over).meals.find(m => m.key === key);
    return { id, title, sub: x.text || x.items.map(itemText).join(' + '), v: x.v, chosen: cur === id };
  };
  if (key === 'colazione') return [{ title: '', items: [one('semplice', { colazione: 'semplice' }, 'Semplice'), one('rinforzata', { colazione: 'rinforzata' }, 'Rinforzata, con 15 g di whey')] }];
  if (key === 'merenda') return [{ title: '', items: MERENDE.map(x => one(x.id, { merenda: x.id }, x.name)) }];
  if (key === 'cena') return [{ title: '', items: CENE.map(x => one(x.id, { cena: x.id }, x.name)) }];
  const out = [];
  const menu = mensaFor(mensaMenu, day);
  if (menu) {
    const rec = new Set(mensaRank(menu, !!target.training).slice(0, 2).map(d => d.id));
    const order = d => (rec.has(d.id) ? 0 : 1) * 10 + ({ ottimo: 0, buono: 1, 'da evitare': 2 }[mensaGrade(d)] ?? 3);
    const ds = menu.dishes.slice().sort((a, b) => order(a) - order(b) || proteinIndex(b) - proteinIndex(a));
    out.push({ title: 'Mensa', items: ds.map(d => ({ id: 'm:' + d.id, title: d.name, sub: d.kcal ? `${d.kcal} kcal · P ${d.p} · C ${d.c} · G ${d.f} g` : 'valori non disponibili',
      v: null, chosen: cur === 'm:' + d.id, rec: rec.has(d.id), grade: mensaGrade(d), dish: d })) });
  }
  out.push({ title: 'A casa o fuori', items: PRANZI.map(p => ({ ...one(p.id, { pranzo: p.id }, p.name), out: p.out })) });
  return out;
}

// Scelte vecchie di più di 2 settimane: via
export function pruneMeals(state, today = dayKey()) {
  const m = state.meals; if (!m?.pick) return;
  const old = addDays(today, -14);
  for (const d of Object.keys(m.pick)) if (d < old) delete m.pick[d];
}
