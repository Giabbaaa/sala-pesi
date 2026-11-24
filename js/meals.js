// Menu del giorno: colazione, pranzo, pomeriggio e cena che insieme arrivano a calorie e proteine del giorno.
// Solo suggerimenti: i pasti veri si registrano in Yazio. La cena "chiude i conti" (grammature calcolate).
import { addDays, parseDay, dayKey, mensaFor, mensaRank, isOfficeDay } from './engine.js';

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
};

// Colazione di Giabba (24/11): vasetto di yogurt greco 150 g + 15 g muesli proteico + 15 g fiocchi di soia.
const COLAZIONE = [['yogurt', 150], ['muesli', 15], ['soia', 15]];
const COLAZIONE_PLUS = [...COLAZIONE, ['whey', 15]];               // "rinforzata": whey mescolata nello yogurt

const POMERIGGIO = [
  [['whey', 30], ['banana', 120]],
  [['whey', 30], ['mandorle', 20]],
  [['whey', 30], ['frutto', 150]],
  [['quark', 250], ['frutto', 150]],
];

// Pranzi a casa o fuori: porzioni fisse
const PRANZI = [
  { items: [['pasta', 90], ['tonno', 120], ['verdure', 200], ['olio', 10]] },
  { items: [['wasa', 36], ['bresaola', 80], ['fiocchiLatte', 200], ['verdure', 200], ['olio', 10]] },
  { items: [['tartare', 200], ['patate', 250], ['verdure', 200], ['olio', 10]] },
  { items: [['riso', 80], ['pollo', 150], ['verdure', 200], ['olio', 10]] },
  { out: true, items: [['poke', 100]] },
  { out: true, items: [['panino', 100]] },
];

// Cene: la proteina e i carboidrati si adattano a quanto manca. carb: [allenamento, riposo]
// L'olio (oil) si adatta ai grassi che mancano per arrivare al minimo del giorno.
const CENE = [
  { prot: ['pollo', 150, 300], carb: [['pasta', 60, 150], ['pane', 50, 130]], fixed: [['verdure', 200]], oil: [5, 20] },
  { prot: ['salmone', 100, 175], carb: [['riso', 60, 150], ['wasa', 18, 72]], fixed: [['carneSalata', 50], ['verdure', 200]], oil: [0, 15] },
  { prot: ['tartare', 150, 300], carb: [['pasta', 60, 150], ['patate', 150, 400]], fixed: [['verdure', 200]], oil: [5, 20] },
  { prot: ['pesce', 200, 400], carb: [['riso', 60, 150], ['patate', 150, 400]], fixed: [['verdure', 200]], oil: [10, 20] },
  { prot: ['albume', 100, 300], carb: [['pane', 50, 150], ['pane', 50, 130]], fixed: [['uova', 120], ['verdure', 200]], oil: [5, 20] },
  { prot: ['quark', 150, 300], carb: [['pane', 50, 130], ['wasa', 18, 72]], fixed: [['salmone', 100], ['verdure', 200]], oil: [0, 15] },
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

// Il menu di un giorno. target: { kcal, protein, training }. mensaMenu: il contenuto di mensa.json (o null).
export function dayMenu(state, day, target, mensaMenu) {
  const m = state.meals || {}, alt = m.alt?.[day] || {}, n = dayNum(day);
  const training = !!target.training;

  // Pranzo: mensa nei giorni d'ufficio (se c'è il menu della settimana), altrimenti a casa o fuori
  let pranzo;
  const ordered = m.ordered?.[day];
  const where = m.where?.[day] || (isOfficeDay(state, day) ? 'mensa' : 'casa');
  const menu = mensaFor(mensaMenu, day);
  if (ordered || (where === 'mensa' && menu)) {
    const ranked = menu ? mensaRank(menu, training) : [];
    const d = ordered || ranked[(alt.pranzo || 0) % Math.max(1, Math.min(3, ranked.length))];
    if (d) {
      const v = [d.kcal + 78, d.p, d.c + 21, d.f];   // + 1 frutto
      pranzo = { key: 'pranzo', label: 'Pranzo', mensa: true, ordered: !!ordered, dish: d, text: `${d.name} + 1 frutto`, v: v.map(Math.round) };
    }
  }
  if (!pranzo) {
    const p = PRANZI[(n + (alt.pranzo || 0)) % PRANZI.length];
    pranzo = meal('pranzo', 'Pranzo', p.items, { out: p.out });
  }

  const pomItems = POMERIGGIO[((training ? 0 : 1) + (alt.pomeriggio || 0)) % POMERIGGIO.length];
  // la cena non ripete la proteina del pranzo
  const lunchFoods = new Set((pranzo.items || []).map(x => x[0]));
  let ci = n + (alt.cena || 0);
  for (let i = 0; i < CENE.length && lunchFoods.has(CENE[ci % CENE.length].prot[0]); i++) ci++;
  const cena = CENE[ci % CENE.length];
  const fat = target.fat || 60;

  const tot = list => list.reduce((t, x) => t.map((y, i) => y + x.v[i]), [0, 0, 0, 0]);
  const build = (plus, extra = []) => {
    const col = meal('colazione', 'Colazione', plus ? COLAZIONE_PLUS : COLAZIONE);
    const pom = meal('pomeriggio', 'Pomeriggio', [...pomItems, ...extra]);
    const before = tot([col, pranzo, pom]);
    const din = meal('cena', 'Cena', dinner(cena, training, target.kcal - before[0], target.protein - before[1], fat - before[3]));
    const meals = [col, pranzo, pom, din];
    return { meals, total: tot(meals).map(Math.round) };
  };
  // Colazione rinforzata quando le proteine non bastano (o se scelta per oggi)
  const plus = alt.colazione != null ? alt.colazione % 2 === 1 : build(false).total[1] < target.protein - 8;
  let r = build(plus);
  // la cena è al massimo e mancano ancora calorie: un frutto e, se serve, qualche fetta di Wasa nel pomeriggio
  if (r.total[0] < target.kcal - 120) r = build(plus, [['frutto', 150]]);
  const short = target.kcal - r.total[0];
  if (short > 90) {   // ancora poco: pane a cena (o un frutto, se il pane c'è già)
    const din = r.meals[3], hasPane = din.items.some(x => x[0] === 'pane');
    const add = hasPane ? ['frutto', 150] : ['pane', clamp(round(short / 2.6, 10), 30, 80)];
    r.meals[3] = meal('cena', 'Cena', [...din.items, add]);
    r.total = tot(r.meals).map(Math.round);
  }
  return { ...r, training, where: ordered ? 'mensa' : pranzo.mensa ? 'mensa' : where, hasMensa: !!menu };
}

// Scelte vecchie di più di 2 settimane: via
export function pruneMeals(state, today = dayKey()) {
  const m = state.meals; if (!m) return;
  const old = addDays(today, -14);
  for (const k of ['alt', 'where', 'ordered']) for (const d of Object.keys(m[k] || {})) if (d < old) delete m[k][d];
}
