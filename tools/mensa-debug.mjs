// Debug: stampa la struttura della pagina menu e di una scheda piatto
const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'accept-language': 'it-IT,it' };
const BASE = 'https://www.nutreetionlab.com';
const get = async u => { const r = await fetch(u, { headers: UA, redirect: 'follow' }); console.log('GET', u, r.status, r.url); return r.text(); };
const menu = await get(BASE + '/it/piatti/ca-326');
console.log('LEN', menu.length);
const links = [...new Set([...menu.matchAll(/href="([^"]*\/pr-\d+[^"]*)"/g)].map(m => m[1]))];
console.log('LINKS', links.length, links.slice(0, 20));
const text = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/\n\s*\n+/g, '\n');
console.log('MENUTEXT', text(menu).slice(0, 3000));
if (links[0]) {
  const p = await get(new URL(links[0], BASE).href);
  const t = text(p); const i = t.search(/ingredient/i);
  console.log('DISH', t.slice(Math.max(0, i - 1500), i + 2500));
  const j = p.search(/ingredient/i); console.log('DISHHTML', p.slice(Math.max(0, j - 500), j + 2500));
}
