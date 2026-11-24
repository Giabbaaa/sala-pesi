const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'accept-language': 'it-IT,it' };
const BASE = 'https://www.nutreetionlab.com';
const get = async u => { const r = await fetch(u, { headers: UA, redirect: 'follow' }); console.log('GET', u, r.status, r.url); return r.text(); };
const menu = await get(BASE + '/it/piatti/ca-326');
const links = [...new Set([...menu.matchAll(/<h3[^>]*><a href='([^']*pr-\d+)'>/g)].map(m => m[1]))];
console.log('LINKS', JSON.stringify(links));
for (const l of links.slice(0, 3)) {
  const p = await get(BASE + l);
  const i = p.indexOf('INGREDIENTI');
  console.log('DISHHTML', p.slice(i - 300, i + 3000));
}
