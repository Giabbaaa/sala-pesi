// Copia dei dati su GitHub: il file salapesi.json nel ramo "dati" del repository dell'app.
// Ogni salvataggio è un commit, quindi la cronologia conserva tutte le versioni.
// La chiave di accesso resta solo su questo telefono (localStorage 'salapesi.gh'):
// non entra mai nei dati, nelle copie automatiche o nei file esportati.
const CONF = 'salapesi.gh';
const API = 'https://api.github.com';
export const DEFAULTS = { repo: 'Giabbaaa/sala-pesi', branch: 'dati', path: 'salapesi.json' };
// Pagina di GitHub per creare la chiave (senza valori precompilati: con la scadenza precompilata la conferma non partiva)
export const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function ghConf() {
  try { const c = JSON.parse(localStorage.getItem(CONF) || 'null'); return c && c.token ? { ...DEFAULTS, ...c } : null; } catch { return null; }
}
export function ghStore(c) {
  try { if (c) localStorage.setItem(CONF, JSON.stringify(c)); else localStorage.removeItem(CONF); } catch {}
}

const enc = s => { const b = new TextEncoder().encode(s); let out = ''; for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(out); };
const dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, '')), ch => ch.charCodeAt(0)));
export const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; };

const MSG = {
  0: 'nessuna connessione',
  401: 'chiave non valida o scaduta',
  403: 'la chiave non può scrivere nel repository (serve Contents: lettura e scrittura su sala-pesi)',
  404: 'repository o ramo non trovato (la chiave deve includere sala-pesi)',
};
export class GhError extends Error { constructor(status, detail = '') { super(MSG[status] || `errore di GitHub (${status})`); this.status = status; this.detail = detail; } }

async function req(c, method, url, body) {
  let r;
  try {
    r = await fetch(API + url, {
      method, cache: 'no-store',
      headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new GhError(0); }
  if (r.ok) return r.json();
  let detail = ''; try { detail = (await r.json()).message || ''; } catch {}
  throw new GhError(r.status, detail);
}

// Legge il file: { sha, text }, oppure null se non c'è ancora
export async function ghRead(c) {
  try {
    const j = await req(c, 'GET', `/repos/${c.repo}/contents/${c.path}?ref=${encodeURIComponent(c.branch)}`);
    let text = j.content ? dec(j.content) : null;
    if (text == null) text = dec((await req(c, 'GET', `/repos/${c.repo}/git/blobs/${j.sha}`)).content);   // file oltre 1 MB
    return { sha: j.sha, text };
  } catch (e) { if (e.status === 404 && /not found/i.test(e.detail) && !/ref|branch|commit/i.test(e.detail)) return null; throw e; }
}

// Scrive il file al posto della versione sha (null se è nuovo) e restituisce la versione nuova
export async function ghWrite(c, text, sha, message) {
  const j = await req(c, 'PUT', `/repos/${c.repo}/contents/${c.path}`, { message, content: enc(text), branch: c.branch, ...(sha ? { sha } : {}) });
  return j.content.sha;
}
