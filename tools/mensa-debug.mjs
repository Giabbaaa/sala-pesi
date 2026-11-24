const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'accept-language': 'it-IT,it' };
const BASE = 'https://www.nutreetionlab.com';
const get = async u => { const r = await fetch(u, { headers: UA, redirect: 'follow' }); console.log('GET', u, r.status, r.url); return r.text(); };
const menu = await get(BASE + '/it/piatti/ca-326');
const hrefs = [...new Set([...menu.matchAll(/(?:href|data-[a-z-]+|onclick)="([^"]*)"/g)].map(m => m[1]).filter(h => /piatt|pr-|prod/i.test(h)))];
console.log('HREFS', JSON.stringify(hrefs));
const i = menu.indexOf('Spiedini di Pollo');
console.log('HTML1', menu.slice(i - 1500, i + 2500));
