// De Ads Manager-API. Alles achter het wachtwoord (middleware.js).
//
// GET                         → { ads, beeldbank, producten, kan }
// GET ?cijfers=1&periode=30   → cijfers uit Meta (alleen als META_TOKEN en META_AD_ACCOUNT_ID er zijn)
// POST { actie, ... }:
//   maak {opdracht, product, hoeken, fotos}  zet per hoek een ad in de wachtrij voor je Claude-routine
//   nieuw {}                                 een lege advertentie, zelf invullen
//   opnieuw {itemId, wens}                   terug naar de routine voor een nieuwe versie volgens jouw wens
//
// De routine "Ads schrijven" draait op je eigen Claude-account (claude.ai/code/routines), start bij een
// push met een commit die begint met "Ads: schrijf", en volgt ROUTINE.md. Zij schrijft in data/ads/.
//   tekst {itemId, titel, hook, caption, caption2, advoorstel}
//   akkoord {itemId}                         jouw ja op de tekst (vingerafdruk wordt vastgelegd)
//   ontwerp {itemId, ontwerp, beelden}       ontwerp + de twee jpg's (4:5 en 9:16) bewaren
//   foto {naam, beschrijving, data, staand}  foto toevoegen aan de beeldbank
//   verwijder {itemId}
//   instellingen / klaarzetten / live / pauzeer   (Meta)
//   schakel {niveau: 'campagne'|'set'|'ad', id, aan}   aan/uit zoals de schakelaar in Meta Ads Manager (met dagplafond)
import crypto from 'node:crypto';
import { leesJson, schrijfJson, schrijfBytes, leesMap, verwijder, opslagSoort } from './_opslag.js';
import { huisstijl, producten, vasteBeeldbank, sjablonen } from './_merk.js';
import { analyse, klaarzetten, zetLive, pauzeer, schakel, schoonInstellingen, toetsBudget, plafonds, DOELEN, KNOPPEN, LANDEN, fout } from './_meta.js';

const cache = new Map();
const nu = () => new Date().toISOString();
// De tweede tekst telt alleen mee als hij er is, zodat oude akkoorden geldig blijven.
const vingerafdruk = (ad) => crypto.createHash('sha256').update(`${ad.titel || ''}\n${ad.caption || ''}\n${ad.hook || ''}${ad.caption2 ? '\n' + ad.caption2 : ''}`, 'utf8').digest('hex').slice(0, 16);
const isAkkoord = (ad) => ad.status === 'akkoord' && ad.akkoordHash === vingerafdruk(ad);
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto';
const nieuwId = (i = 0) => `ad-${Date.now().toString(36)}${i}`;
const HOEKEN = ['geld', 'tijd', 'bewijs', 'identiteit', 'vrij'];

async function beeldbank() {
  const extra = await leesJson('beeldbank/lijst.json', { fotos: [] });
  return [...vasteBeeldbank(), ...(extra.fotos || [])];
}
async function alleAds() {
  const ads = (await leesMap('ads/')).filter((a) => a && /^ad-[a-z0-9]+$/.test(a.id || ''));
  return ads.sort((a, b) => String(b.gemaakt || '').localeCompare(String(a.gemaakt || '')));
}
const leesAd = async (id) => {
  if (!/^ad-[a-z0-9]+$/.test(String(id || ''))) throw fout(400, 'Onbekende advertentie.');
  const ad = await leesJson(`ads/${id}.json`, null);
  if (!ad) throw fout(404, 'Advertentie niet gevonden.');
  return ad;
};
const bewaarAd = (ad, boodschap) => schrijfJson(`ads/${ad.id}.json`, ad, boodschap || `Ads Manager: ${String(ad.titel || ad.id).slice(0, 60)}`);
async function werkBij(id, wijzig) { const ad = await leesAd(id); await wijzig(ad); ad.gewijzigd = nu(); await bewaarAd(ad); return ad; }
const nietLive = (ad) => { if (ad.meta && ad.meta.stand === 'live') throw fout(409, 'Deze advertentie loopt. Pauzeer hem eerst.'); };

function jpgUitDataUrl(d, max) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(d || ''));
  if (!m) throw fout(400, 'Beeld moet een jpg zijn.');
  const b = Buffer.from(m[1], 'base64');
  if (b.length > max) throw fout(400, `Beeld is te groot (${Math.round(b.length / 1048576)} MB).`);
  return b;
}
function schoonOntwerp(o, bank) {
  o = o || {};
  if (!sjablonen()[o.sjabloon]) throw fout(400, 'Onbekend sjabloon.');
  const foto = String(o.foto || '');
  if (foto && !bank.some((f) => f.pad === foto)) throw fout(400, 'De foto moet uit de beeldbank komen.');
  const velden = {};
  Object.keys(o.velden || {}).slice(0, 20).forEach((k) => { if (/^[a-z]{1,20}$/.test(k)) velden[k] = String(o.velden[k] || '').slice(0, 1500); });
  const perFmt = (x, toets) => { const u = {}; ['4x5', '9x16'].forEach((f) => { if (x && x[f] !== undefined && toets(x[f])) u[f] = x[f]; }); return u; };
  return {
    sjabloon: o.sjabloon, foto, velden,
    pos: perFmt(o.pos, (v) => /^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/.test(v)),
    zoom: perFmt(o.zoom, (v) => Number(v) >= 1 && Number(v) <= 2),
    kopY: perFmt(o.kopY, (v) => Number(v) >= 0 && Number(v) <= 1900),
  };
}
// Wat de routine schreef, netjes maken voor de app: foto moet uit de beeldbank komen, uitsnede valt
// terug op die van de foto, onbekend sjabloon wordt "woord". Verandert niets in de opslag.
function normaal(ad, bank) {
  if (!ad.ontwerp) return ad;
  const o = ad.ontwerp;
  if (!sjablonen()[o.sjabloon]) o.sjabloon = 'woord';
  const f = bank.find((x) => x.pad === o.foto);
  if (o.foto && !f) o.foto = '';
  if (f && (!o.pos || !o.pos['4x5'])) o.pos = { ...(f.pos || {}) };
  o.velden = o.velden && typeof o.velden === 'object' ? o.velden : {};
  return ad;
}

async function admaker(body) {
  const bank = await beeldbank();
  const prods = producten();
  if (body.actie === 'nieuw') {
    const ad = { id: nieuwId(), gemaakt: nu(), status: 'idee', titel: 'Nieuwe advertentie', hook: '', caption: '', advoorstel: { kop: '', omschrijving: '', url: '' },
      ontwerp: { sjabloon: 'woord', foto: (bank[0] && bank[0].pad) || '', pos: (bank[0] && bank[0].pos) || {}, velden: {} } };
    await bewaarAd(ad);
    return { ok: true, ad };
  }
  if (body.actie === 'maak') {
    const opdracht = String(body.opdracht || '').trim().slice(0, 2000);
    if (opdracht.length < 15) throw fout(400, 'Vertel in een paar zinnen waar de ads over gaan: wat wil je zeggen, aan wie?');
    const hoeken = (Array.isArray(body.hoeken) ? body.hoeken : []).filter((h) => HOEKEN.includes(h)).slice(0, 5);
    if (!hoeken.length) throw fout(400, 'Kies minstens één hoek.');
    const product = prods.find((p) => p.id === body.product) || null;
    const fotos = (Array.isArray(body.fotos) ? body.fotos : []).filter((f) => bank.some((x) => x.pad === f)).slice(0, 12);
    const ads = hoeken.map((h, i) => ({
      id: nieuwId(i), gemaakt: nu(), status: 'idee', titel: `Ad · ${h} · ${opdracht.slice(0, 40)}${opdracht.length > 40 ? '…' : ''}`, opdracht,
      product: product ? product.id : null, productNaam: product ? product.naam : null, admaker: { status: 'wacht', hoek: h, fotos, gevraagd: nu() },
    }));
    // Eén voor één opslaan; de laatste commit start de routine (die pakt dan alle wachtende ads op).
    for (let i = 0; i < ads.length; i++) await bewaarAd(ads[i], i === ads.length - 1 ? `Ads: schrijf ${ads.length} ${ads.length === 1 ? 'ad' : 'ads'}` : `Ads Manager: wachtrij ${ads[i].id}`);
    return { ok: true, ads };
  }
  if (body.actie === 'opnieuw') {
    const wens = String(body.wens || '').trim().slice(0, 1000);
    if (!wens) throw fout(400, 'Schrijf wat er anders moet.');
    const ad = await leesAd(body.itemId);
    nietLive(ad);
    ad.admaker = { ...(ad.admaker || { hoek: 'vrij', fotos: [] }), status: 'wacht', gevraagd: nu(), wens };
    delete ad.admaker.vraag;
    if (!ad.opdracht) ad.opdracht = ad.titel;
    // Het oude beeld past straks niet meer bij het nieuwe ontwerp; de app legt het nieuwe vanzelf vast.
    await Promise.all((ad.beelden || []).map((p) => verwijder(String(p).replace(/^opslag\//, ''), 'Ads Manager: oud beeld weg')));
    ad.beeld = null; ad.beelden = [];
    ad.gewijzigd = nu();
    await bewaarAd(ad, 'Ads: schrijf 1 ad (nieuwe versie)');
    return { ok: true, ad };
  }
  if (body.actie === 'tekst') {
    const ad = await werkBij(body.itemId, (a) => {
      nietLive(a);
      ['titel', 'hook', 'caption', 'caption2'].forEach((k) => { if (typeof body[k] === 'string') a[k] = body[k].slice(0, k.startsWith('caption') ? 3000 : 300); });
      if (body.advoorstel) a.advoorstel = { kop: String(body.advoorstel.kop || '').slice(0, 80), kop2: String(body.advoorstel.kop2 || '').slice(0, 80), omschrijving: String(body.advoorstel.omschrijving || '').slice(0, 120), url: String(body.advoorstel.url || '').slice(0, 500) };
      if (a.status === 'akkoord' && a.akkoordHash !== vingerafdruk(a)) a.status = 'ingevuld';
      if (a.status === 'idee' && a.caption) a.status = 'ingevuld';
    });
    return { ok: true, ad };
  }
  if (body.actie === 'akkoord') {
    const ad = await werkBij(body.itemId, (a) => {
      if (!a.caption || !a.beeld) throw fout(400, 'Eerst een tekst en een bewaard ontwerp.');
      a.status = 'akkoord'; a.akkoordHash = vingerafdruk(a); a.akkoordOp = nu();
    });
    return { ok: true, ad };
  }
  if (body.actie === 'ontwerp') {
    const o = schoonOntwerp(body.ontwerp, bank);
    const b4 = jpgUitDataUrl(body.beelden && body.beelden['4x5'], 3 * 1048576), b9 = jpgUitDataUrl(body.beelden && body.beelden['9x16'], 3 * 1048576);
    const ad = await leesAd(body.itemId);
    nietLive(ad);
    const v = Date.now();
    const p4 = `beelden/${ad.id}-4x5-${v}.jpg`, p9 = `beelden/${ad.id}-9x16-${v}.jpg`;
    await schrijfBytes(p4, b4, 'image/jpeg');
    await schrijfBytes(p9, b9, 'image/jpeg');
    const oud = [...(ad.beelden || [])];
    ad.ontwerp = o; ad.beeld = `opslag/${p4}`; ad.beelden = [`opslag/${p4}`, `opslag/${p9}`]; ad.gewijzigd = nu();
    if (ad.meta && ad.meta.stand === 'klaar') ad.meta.verouderd = true;
    await bewaarAd(ad);
    // Oude beelden opruimen, behalve wat er nog in Meta staat (dat is daar al geüpload, dus mag ook weg).
    await Promise.all(oud.map((p) => verwijder(String(p).replace(/^opslag\//, ''))));
    return { ok: true, ad };
  }
  if (body.actie === 'foto') {
    const bytes = jpgUitDataUrl(body.data, 4 * 1048576);
    const beschrijving = String(body.beschrijving || '').trim().slice(0, 300);
    if (!beschrijving) throw fout(400, 'Geef de foto een korte beschrijving, dan kan Claude hem goed kiezen.');
    const pad = `beeldbank/${slug(String(body.naam || '').replace(/\.[a-z]+$/i, ''))}-${Date.now().toString(36)}.jpg`;
    await schrijfBytes(pad, bytes, 'image/jpeg');
    const l = await leesJson('beeldbank/lijst.json', { fotos: [] });
    l.fotos = l.fotos || [];
    l.fotos.push({ pad: `opslag/${pad}`, beschrijving, staand: !!body.staand, pos: { '4x5': '50% 40%', '9x16': '50% 40%' }, toegevoegd: nu().slice(0, 10) });
    await schrijfJson('beeldbank/lijst.json', l);
    return { ok: true, pad: `opslag/${pad}` };
  }
  if (body.actie === 'verwijder') {
    const ad = await leesAd(body.itemId);
    if (ad.meta && ad.meta.adId) throw fout(409, 'Deze advertentie staat in Meta. Pauzeer of verwijder hem daar eerst; hier blijft hij als archief.');
    await Promise.all((ad.beelden || []).map((p) => verwijder(String(p).replace(/^opslag\//, ''))));
    await verwijder(`ads/${ad.id}.json`);
    return { ok: true };
  }
  return null;
}

export default async function handler(req, res) {
  const lees = process.env.META_TOKEN || process.env.META_ADS_TOKEN;
  const metaSchrijf = process.env.META_ADS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID ? `act_${String(process.env.META_AD_ACCOUNT_ID).replace(/^act_/, '')}` : '';
  const kan = {
    lezen: !!(lees && account), schrijven: !!(metaSchrijf && account),
    pixel: !!process.env.META_PIXEL_ID, plafond: plafonds(), doelen: DOELEN, knoppen: KNOPPEN, landen: LANDEN, opslag: opslagSoort(),
  };
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (req.query.cijfers) {
        if (!kan.lezen) return res.status(200).json({ bron: 'geen', kan });
        const periode = ['7', '14', '30', '90', '365', 'max'].includes(String(req.query.periode)) ? String(req.query.periode) : '30';
        const c = cache.get(periode);
        if (c && !req.query.vers && Date.now() - c.tijd < 5 * 60 * 1000) return res.status(200).json({ ...c.data, kan });
        const data = await analyse(lees, account, periode);
        if (data.totaal || data.campagnes.length) cache.set(periode, { tijd: Date.now(), data });
        return res.status(200).json({ ...data, kan });
      }
      const [ads, bank] = await Promise.all([alleAds(), beeldbank()]);
      ads.forEach((a) => { normaal(a, bank); a.tekstVeranderd = a.status === 'akkoord' && a.akkoordHash !== vingerafdruk(a); });
      return res.status(200).json({ ads, beeldbank: bank, producten: producten(), kan });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ fout: 'Alleen GET en POST.' }); }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const uit = await admaker(body);
    if (uit) return res.status(200).json(uit);

    const { actie, itemId } = body;
    if (actie === 'instellingen') {
      const i = schoonInstellingen(body.instellingen);
      const ad = await werkBij(itemId, (a) => { nietLive(a); a.meta = { ...(a.meta || {}), instellingen: i }; if (a.meta.stand === 'klaar') a.meta.verouderd = true; });
      let check = null; try { check = i.eind ? toetsBudget(i) : null; } catch (e) { check = { fout: e.message }; }
      return res.status(200).json({ ok: true, ad, check });
    }
    if (actie === 'schakel') {
      if (!kan.schrijven) return res.status(400).json({ fout: 'De schrijfsleutel voor Meta (META_ADS_TOKEN) staat nog niet in Vercel.' });
      cache.clear();
      const r = await schakel(metaSchrijf, account, body);
      // Eigen advertenties die onder het uitgezette onderdeel vallen, staan daarna op gepauzeerd.
      if (r.uit) {
        const veld = { campagne: 'campagneId', set: 'adsetId', ad: 'adId' }[r.uit.niveau];
        for (const ad of await alleAds()) {
          if (!ad.meta || ad.meta.stand !== 'live' || ad.meta[veld] !== r.uit.id) continue;
          ad.meta = { ...ad.meta, stand: 'gepauzeerd', gepauzeerd: nu() };
          await bewaarAd(ad, `Ads Manager: ${r.uit.niveau} uitgezet`);
        }
      }
      return res.status(200).json({ ok: true, gedaan: r.gedaan });
    }
    if (!['klaarzetten', 'live', 'pauzeer'].includes(actie)) return res.status(400).json({ fout: `Onbekende actie '${actie}'.` });
    if (!kan.schrijven) return res.status(400).json({ fout: 'De schrijfsleutel voor Meta (META_ADS_TOKEN) staat nog niet in Vercel.' });
    cache.clear();
    const ad = await leesAd(itemId);
    if (actie === 'pauzeer') {
      const r = await pauzeer(metaSchrijf, ad);
      ad.meta = r.meta; await bewaarAd(ad);
      return res.status(200).json({ ok: true, gedaan: 'gepauzeerd', ad });
    }
    // Klaarzetten en live: alleen met een geldig akkoord op precies deze tekst.
    if (!isAkkoord(ad)) return res.status(403).json({ fout: 'Geef eerst akkoord op de tekst (of opnieuw, als je hem na je akkoord hebt aangepast).' });
    if (actie === 'klaarzetten') {
      // Per product en doel één campagne met één set: { [product]: { [doel]: { campagneId, adsetId } } }.
      const groepen = await leesJson('instellingen/meta.json', {});
      const r = await klaarzetten(metaSchrijf, account, ad, groepen, huisstijl().naam);
      groepen[r.groep] = { ...(groepen[r.groep] || {}), [r.doel]: r.ids };
      await schrijfJson('instellingen/meta.json', groepen);
      ad.meta = r.meta; await bewaarAd(ad);
      return res.status(200).json({ ok: true, gedaan: 'staat klaar in Meta, gepauzeerd', waarschuwingen: r.waarschuwingen, ad });
    }
    const r = await zetLive(metaSchrijf, ad, body.bevestig);
    ad.meta = r.meta; ad.status = 'akkoord'; await bewaarAd(ad);
    return res.status(200).json({ ok: true, gedaan: r.gedaan, ad });
  } catch (e) {
    if (!e.status) console.error(e);
    return res.status(e.status || 502).json({ fout: e.message });
  }
}
