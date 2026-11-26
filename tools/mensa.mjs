// Menu della mensa (Nutreetion Lab): legge i piatti della settimana, stima calorie e macro dagli ingredienti
// (il sito dà i grammi crudi ma nessun valore nutrizionale) e scrive mensa.json, che l'app scarica.
// Gira su GitHub Actions ogni lunedì (.github/workflows/mensa.yml); a mano: node tools/mensa.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const BASE = 'https://www.nutreetionlab.com';
const MENU = BASE + '/it/piatti/ca-326';
const HEAD = { 'user-agent': 'Mozilla/5.0 (compatible; sala-pesi menu reader)', 'accept-language': 'it-IT,it' };

// Valori per 100 g di alimento crudo: [nome, kcal, proteine, carboidrati, grassi].
const FOODS = [
  ['salmone affumicato', 147, 25, 0, 5], ['tonno affumicato', 120, 25, 0, 2], ['pesce spada', 120, 19, 0, 4],
  ['salmone', 180, 20, 0, 11], ['tonno', 130, 25, 0, 3], ['merluzzo', 80, 18, 0, 0.7], ['baccala', 95, 21, 0, 0.7],
  ['branzino', 120, 20, 0, 4], ['orata', 120, 20, 0, 4], ['spigola', 120, 20, 0, 4], ['mazzancolle', 80, 18, 0, 1],
  ['gamber', 80, 18, 0, 1], ['cozze', 85, 12, 3, 2], ['vongole', 75, 13, 3, 1], ['polpo', 60, 11, 1, 1],
  ['calamar', 70, 13, 1, 1.5], ['seppi', 70, 14, 1, 1], ['acciughe', 130, 20, 0, 5], ['alici', 130, 20, 0, 5],
  ['petto di pollo', 110, 23, 0, 1.5], ['sovracosc', 160, 18, 0, 9], ['pollo', 120, 22, 0, 3], ['tacchino', 107, 24, 0, 1],
  ['bresaola', 150, 32, 0, 2], ['prosciutto cotto', 140, 20, 1, 6], ['prosciutto crudo', 270, 26, 0, 18], ['prosciutto', 220, 24, 0, 13],
  ['speck', 300, 28, 0, 20], ['nduja', 500, 12, 1, 49], ['salame', 400, 25, 1, 33], ['salsiccia', 300, 15, 0, 26],
  ['pancetta', 450, 13, 0, 45], ['guanciale', 650, 9, 0, 69], ['mortadella', 310, 15, 1, 28],
  ['ragu', 150, 10, 4, 10], ['carne mista', 200, 19, 0, 13], ['macinato', 200, 19, 0, 13], ['hamburger di', 200, 19, 0, 13],
  ['manzo', 160, 21, 0, 8], ['vitello', 110, 21, 0, 3], ['bovino', 160, 21, 0, 8], ['maiale', 150, 21, 0, 7], ['lonza', 150, 21, 0, 7],
  ['agnello', 200, 19, 0, 14], ['tofu', 120, 13, 2, 7], ['seitan', 120, 25, 4, 2], ['tempeh', 190, 19, 9, 11],
  ['uov', 140, 12.5, 0.5, 10], ['albume', 50, 11, 0.7, 0.2],
  ['parmigiano', 390, 33, 0, 28], ['grana', 390, 33, 0, 28], ['pecorino', 390, 26, 0, 32], ['mozzarella', 250, 18, 2, 19],
  ['burrata', 300, 15, 2, 25], ['stracciatella', 280, 12, 3, 25], ['ricotta', 150, 9, 4, 11], ['feta', 260, 14, 4, 21],
  ['scamorza', 330, 25, 1, 25], ['provola', 330, 25, 1, 25], ['gorgonzola', 330, 19, 0, 28], ['robiola', 280, 13, 3, 24],
  ['philadelphia', 250, 6, 4, 23], ['alpigiana', 250, 6, 4, 23], ['formaggio', 300, 20, 2, 24], ['yogurt greco', 100, 9, 4, 5],
  ['yogurt', 65, 4, 5, 3], ['latte', 64, 3.3, 5, 3.6], ['panna', 340, 2, 3, 35], ['besciamella', 130, 4, 10, 8], ['burro', 750, 1, 0, 83],
  ['lenticch', 116, 9, 20, 0.4], ['ceci', 120, 7, 20, 2], ['fagiolini', 31, 2, 7, 0.2], ['fagioli', 100, 7, 17, 0.5],
  ['piselli', 80, 5, 14, 0.4], ['edamame', 120, 11, 9, 5], ['hummus', 170, 8, 14, 10],
  ['pasta sfoglia', 280, 11, 50, 3], ['sfoglia', 280, 11, 50, 3], ['lasagn', 280, 11, 50, 3], ['tagliatelle', 280, 11, 50, 3],
  ['tortelli', 250, 10, 35, 8], ['tortellini', 300, 12, 40, 10], ['ravioli', 250, 10, 35, 8], ['cappelletti', 300, 12, 40, 10],
  ['gnocchi', 150, 3, 33, 0.3], ['riso venere', 350, 8, 76, 2.5], ['riso', 350, 7.5, 78, 1], ['quinoa', 370, 14, 64, 6],
  ['farro', 340, 15, 67, 2.5], ['orzo', 350, 10, 73, 1.5], ['cous cous', 360, 12, 73, 1], ['couscous', 360, 12, 73, 1],
  ['bulgur', 340, 12, 69, 1.5], ['avena', 380, 13, 60, 7], ['pasta', 355, 12, 72, 1.5], ['caserecce', 355, 12, 72, 1.5],
  ['spaghetti', 355, 12, 72, 1.5], ['penne', 355, 12, 72, 1.5], ['fusilli', 355, 12, 72, 1.5], ['rigatoni', 355, 12, 72, 1.5],
  ['paccheri', 355, 12, 72, 1.5], ['orecchiette', 355, 12, 72, 1.5], ['trofie', 355, 12, 72, 1.5], ['maccheroni', 355, 12, 72, 1.5],
  ['linguine', 355, 12, 72, 1.5], ['mezze maniche', 355, 12, 72, 1.5], ['farina', 340, 11, 73, 1],
  ['panino al latte', 330, 9, 55, 8], ['crostini', 400, 11, 70, 8], ['grissini', 410, 12, 68, 10], ['piadina', 330, 8, 50, 10],
  ['focaccia', 300, 7, 45, 10], ['pan grattato', 350, 12, 70, 3], ['pangrattato', 350, 12, 70, 3], ['treccia', 330, 9, 55, 8],
  ['panino', 290, 9, 55, 4], ['pane', 270, 9, 55, 1.5], ['tortilla', 310, 8, 50, 8],
  ['patate dolci', 86, 1.6, 20, 0.1], ['patat', 77, 2, 17, 0.1], ['mais', 86, 3, 19, 1.2],
  ['zucca', 26, 1, 6, 0.1], ['spinac', 23, 3, 1, 0.4], ['zucchin', 17, 1.2, 3, 0.3], ['carot', 41, 1, 9, 0.2],
  ['cipoll', 40, 1, 9, 0.1], ['scalogno', 72, 2.5, 17, 0.1], ['pomodori secchi', 213, 5, 23, 14], ['pomodor', 18, 1, 4, 0.2],
  ['passata', 30, 1.5, 5, 0.2], ['cavol', 25, 1.3, 6, 0.1], ['verza', 25, 2, 5, 0.1], ['funghi', 22, 3, 3, 0.3], ['champignon', 22, 3, 3, 0.3],
  ['melanzan', 25, 1, 6, 0.2], ['peperon', 30, 1, 6, 0.3], ['broccol', 34, 3, 7, 0.4], ['asparag', 20, 2, 4, 0.1],
  ['valeriana', 20, 2, 3, 0.4], ['rucola', 25, 2.6, 3.6, 0.7], ['insalat', 15, 1.4, 3, 0.2], ['lattuga', 15, 1.4, 3, 0.2],
  ['finocchi', 31, 1.2, 7, 0.2], ['sedano', 16, 0.7, 3, 0.2], ['porri', 61, 1.5, 14, 0.3], ['radicchio', 23, 1.4, 4.5, 0.3],
  ['barbabietol', 43, 1.6, 10, 0.2], ['cetriol', 15, 0.7, 3.6, 0.1], ['avocado', 160, 2, 9, 15], ['olive', 145, 1, 4, 15],
  ['guacamole', 160, 2, 9, 15], ['limone', 29, 1, 9, 0.3], ['arancia', 47, 0.9, 12, 0.1], ['mela', 52, 0.3, 14, 0.2],
  ['noci', 650, 15, 14, 65], ['mandorl', 580, 21, 22, 50], ['pinoli', 670, 14, 13, 68], ['sesamo', 570, 18, 23, 50],
  ['anacardi', 550, 18, 30, 44], ['pistacchi', 560, 20, 28, 45], ['nocciol', 630, 15, 17, 61], ['semi', 550, 20, 20, 45],
  ['pesto', 450, 5, 6, 45], ['maionese', 700, 1, 1, 75], ['salsa di soia', 60, 8, 6, 0], ['salsa yogurt', 80, 4, 5, 5],
  ['olio', 900, 0, 0, 100], ['zucchero', 400, 0, 100, 0], ['miele', 300, 0, 80, 0], ['uvetta', 300, 3, 79, 0.5],
  ['brodo', 5, 0.5, 0.5, 0.1], ['acqua', 0, 0, 0, 0], ['aceto', 20, 0, 1, 0], ['curry', 0, 0, 0, 0], ['sale', 0, 0, 0, 0],
];
const FALLBACK = [50, 2, 7, 1.5];   // ingrediente sconosciuto: una via di mezzo tra verdura e condimento

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&euro;/g, '€').replace(/&([a-z])grave;/gi, '$1')
  .replace(/&([a-z])acute;/gi, '$1').replace(/&[a-z]+;/gi, ' ');
// Alimenti riconosciuti in un ingrediente, in ordine di posizione: a parità di posizione vince il nome più lungo
// ("panino al latte" batte "latte"). "Spinaci con burro e parmigiano": spinaci 85%, il resto si divide il 15%.
function parts(name) {
  const n = norm(name);
  const hits = FOODS.map(f => ({ f, at: n.indexOf(f[0]) })).filter(h => h.at >= 0).sort((a, b) => a.at - b.at || b.f[0].length - a.f[0].length);
  const out = [];
  for (const h of hits) if (!out.some(o => h.at < o.at + o.f[0].length && o.at < h.at + h.f[0].length)) out.push(h);
  if (!out.length) return [];
  if (out.length === 1 || !/ con /.test(' ' + n + ' ')) return [{ v: out[0].f, w: 1 }];
  return out.map((h, i) => ({ v: h.f, w: i ? 0.15 / (out.length - 1) : 0.85 }));
}

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: HEAD }); if (r.ok) return await r.text(); } catch {}
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error('non raggiungibile: ' + url);
}

function parseDish(html) {
  const m = html.match(/<meta name="description" content="([^"]*)"/);
  const text = decode(m ? m[1] : '').replace(/\s+/g, ' ').trim();
  const desc = (text.split(/INGREDIENTI|Porzione\s*:/i)[0] || '').replace(/^DESCRIZIONE\s*:\s*/i, '').trim();
  // due formati: "INGREDIENTI (GRAMMATURA ALIMENTI CRUDI) : Zucca 288 g; ..." oppure "Porzione : grammatura alimenti crudi Riso 70 g Tonno 40 g"
  const ingPart = (text.split(/INGREDIENTI[^:]*:|GRAMMATURA ALIMENTI CRUDI\)?\s*:?/i)[1] || '').split(/Porzione da|ALLERGENI|DICHIARAZIONE|\d+\s*kcal/i)[0];
  const portion = +(text.match(/Porzione da\s*([\d.,]+)\s*g/i)?.[1] || '0').replace(',', '.');
  const ing = [];
  for (const mm of ingPart.matchAll(/((?:[^;\d]|\d(?![\d.,]*\s*g\b))+?)\s+(\d+(?:[.,]\d+)?)\s*g\b/gi)) {
    const name = mm[1].replace(/^[\s.:;,]+|[\s.:;,]+$/g, '').trim();
    if (name && !/^q\.?b/i.test(name)) ing.push({ name, g: +mm[2].replace(',', '.') });
  }
  // a volte il sito dà le calorie della porzione ("460 kcal 1942 kj"): più affidabili della stima
  const kcal = +(text.match(/(\d{2,4})\s*kcal\s*\d+\s*kj/i)?.[1] || 0);
  return { desc, portion, ing, kcal };
}

function estimate(ing) {
  let k = 0, p = 0, c = 0, f = 0; const unknown = [];
  for (const x of ing) {
    let ps = parts(x.name);
    if (!ps.length) { unknown.push(x.name); ps = [{ v: [null, ...FALLBACK], w: 1 }]; }
    for (const { v, w } of ps) { const g = x.g * w / 100; k += v[1] * g; p += v[2] * g; c += v[3] * g; f += v[4] * g; }
  }
  const r = n => Math.round(n);
  return { kcal: Math.round(k / 10) * 10, p: r(p), c: r(c), f: r(f), unknown, ok: ing.length > 0 };
}

const menu = await get(MENU);
const cards = [...menu.matchAll(/<h3[^>]*><a href='([^']*pr-(\d+))'>([^<]*)<\/a><\/h3>\s*<div class="defTxt thumbPrezzo">([^<]*)</g)];
if (!cards.length) throw new Error('menu senza piatti: forse il sito è cambiato');
const dishes = [];
for (const [, href, id, name, price] of cards) {
  const d = parseDish(await get(BASE + href));
  const e = estimate(d.ing);
  if (d.kcal) e.kcal = d.kcal;
  dishes.push({ id: +id, name: decode(name).trim(), price: decode(price).trim(), url: BASE + href, desc: d.desc, portion: d.portion, ...e, ing: d.ing });
}
const out = { source: MENU, dishes };
const file = new URL('../mensa.json', import.meta.url);
const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
const same = old && JSON.stringify(old.dishes) === JSON.stringify(dishes);
out.updated = same ? old.updated : new Date().toISOString();
out.checked = new Date().toISOString();   // l'app mostra il menu solo se letto da poco
// La settimana del menu (il suo lunedì, ora italiana). Il sito cambia menu già il sabato:
// un menu nuovo letto sabato o domenica vale per la settimana che inizia lunedì.
const romeDay = d => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const plusDays = (k, n) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekFor = d => { const k = romeDay(d), w = new Date(k + 'T12:00:00Z').getUTCDay(); return w === 6 || w === 0 ? plusDays(k, w === 6 ? 2 : 1) : plusDays(k, 1 - w); };
const thisWeek = weekFor(Date.now()), weekend = [0, 6].includes(new Date(romeDay(Date.now()) + 'T12:00:00Z').getUTCDay());
out.week = !same ? thisWeek : weekend ? (old.week || weekFor(old.updated)) : thisWeek;
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(same ? 'Menu invariato' : 'Menu aggiornato');
for (const d of dishes) console.log(`${d.name} · ${d.kcal} kcal · P ${d.p} · C ${d.c} · G ${d.f}${d.unknown.length ? ' · sconosciuti: ' + d.unknown.join(', ') : ''}`);
