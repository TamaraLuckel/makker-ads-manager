// Opslag voor de Ads Manager: de map data/ in je eigen GitHub-repo (mijn-ai-team).
// Zo staan je ads naast je team, kan je eigen Claude-routine ze schrijven, en zit alles in je kluis.
//
// Op Vercel: via de GitHub-API, met GITHUB_TOKEN (alleen toegang tot jouw repo) en GITHUB_REPO
// ("naam/mijn-ai-team"). ADS_PAD is de map van de Ads Manager in die repo (standaard "ads-manager").
// Lokaal (npm run lokaal): rechtstreeks in de map data/ hier; je teamsync zet het daarna op GitHub.
//
// Wat erin staat:
//   data/ads/<id>.json              één bestand per advertentie
//   data/beelden/<id>-<fmt>-<v>.jpg de vastgelegde beelden (4:5 en 9:16)
//   data/beeldbank/<naam>.jpg       foto's die je via de app toevoegt (+ data/beeldbank/lijst.json)
//   data/instellingen/meta.json     campagne-id's in Meta, per product en doel
import fs from 'node:fs';
import path from 'node:path';

const github = () => !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
const LOKAAL = () => process.env.OPSLAG_MAP || path.join(process.cwd(), 'data');
const TAK = () => process.env.GITHUB_BRANCH || 'main';
const repoPad = (pad) => [String(process.env.ADS_PAD ?? 'ads-manager').replace(/^\/+|\/+$/g, ''), 'data', pad].filter(Boolean).join('/');
const fout = (status, tekst) => Object.assign(new Error(tekst), { status });
const veilig = (pad) => { const p = String(pad || '').replace(/^\/+/, ''); if (!p || p.includes('..')) throw fout(400, 'Ongeldig pad.'); return p; };

const kop = (accept) => ({ Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ads-manager' });
const url = (pad) => `${process.env.GITHUB_API || 'https://api.github.com'}/repos/${process.env.GITHUB_REPO}/contents/${repoPad(pad).split('/').map(encodeURIComponent).join('/')}`;
async function gh(pad, opties) {
  const r = await fetch(url(pad) + (opties && opties.method ? '' : `?ref=${encodeURIComponent(TAK())}`), opties);
  if (r.status === 401 || r.status === 403) throw fout(502, 'GitHub weigert de toegang. Klopt GITHUB_TOKEN, en mag hij in deze repo lezen en schrijven?');
  return r;
}
async function shaVan(pad) {
  const r = await gh(pad, { headers: kop() });
  if (r.status === 404) return null;
  if (!r.ok) throw fout(502, `GitHub gaf ${r.status} bij ${pad}.`);
  const d = await r.json();
  return Array.isArray(d) ? null : d.sha;
}

// Kleine cache op inhoud per sha: een lijst ophalen geeft de sha's, dan hoeven ongewijzigde ads niet opnieuw.
const cache = new Map();

export async function leesBytes(pad) {
  pad = veilig(pad);
  if (!github()) { const f = path.join(LOKAAL(), pad); return fs.existsSync(f) ? fs.readFileSync(f) : null; }
  const r = await gh(pad, { headers: kop('application/vnd.github.raw') });
  if (r.status === 404) return null;
  if (!r.ok) throw fout(502, `GitHub gaf ${r.status} bij ${pad}.`);
  return Buffer.from(await r.arrayBuffer());
}
export async function schrijfBytes(pad, bytes, contentType, boodschap) {
  pad = veilig(pad);
  if (!github()) { const f = path.join(LOKAAL(), pad); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); return; }
  for (let poging = 0; poging < 3; poging++) {
    const sha = await shaVan(pad);
    const r = await gh(pad, { method: 'PUT', headers: { ...kop(), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: boodschap || `Ads Manager: ${pad}`, content: Buffer.from(bytes).toString('base64'), branch: TAK(), ...(sha ? { sha } : {}) }) });
    if (r.ok) return;
    if (r.status !== 409 && r.status !== 422) throw fout(502, `GitHub gaf ${r.status} bij het opslaan van ${pad}.`);
  }
  throw fout(409, 'Het bestand werd net ook ergens anders gewijzigd. Probeer het opnieuw.');
}
export async function leesJson(pad, standaard) {
  const b = await leesBytes(pad);
  if (!b) return standaard;
  try { return JSON.parse(b.toString('utf8')); } catch { return standaard; }
}
export async function schrijfJson(pad, data, boodschap) {
  await schrijfBytes(pad, Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8'), 'application/json', boodschap);
}
// Alle JSON-bestanden in een map, met cache op sha.
export async function leesMap(prefix) {
  prefix = veilig(prefix).replace(/\/?$/, '/');
  if (!github()) {
    const d = path.join(LOKAAL(), prefix);
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((n) => n.endsWith('.json')).map((n) => { try { return JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')); } catch { return null; } }).filter(Boolean);
  }
  const r = await gh(prefix.replace(/\/$/, ''), { headers: kop() });
  if (r.status === 404) return [];
  if (!r.ok) throw fout(502, `GitHub gaf ${r.status} bij ${prefix}.`);
  const lijst = (await r.json()).filter((x) => x.type === 'file' && x.name.endsWith('.json'));
  return (await Promise.all(lijst.map(async (x) => {
    if (!cache.has(x.sha)) {
      const b = await leesBytes(prefix + x.name);
      try { cache.set(x.sha, b ? JSON.parse(b.toString('utf8')) : null); } catch { cache.set(x.sha, null); }
    }
    return cache.get(x.sha) && JSON.parse(JSON.stringify(cache.get(x.sha)));
  }))).filter(Boolean);
}
export async function verwijder(pad, boodschap) {
  pad = veilig(pad);
  if (!github()) { const f = path.join(LOKAAL(), pad); if (fs.existsSync(f)) fs.unlinkSync(f); return; }
  const sha = await shaVan(pad);
  if (!sha) return;
  await gh(pad, { method: 'DELETE', headers: { ...kop(), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: boodschap || `Ads Manager: ${pad} weg`, sha, branch: TAK() }) }).catch(() => {});
}
export const opslagSoort = () => (github() ? 'github' : 'lokaal');
