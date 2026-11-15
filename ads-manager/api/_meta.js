// Meta (Facebook/Instagram): cijfers lezen, advertenties klaarzetten, live zetten en pauzeren.
//
// Veiligheidsregels, hier in de code vastgelegd:
// 1. Klaarzetten en live zetten gebeuren alleen met een klik van jou in de app. Pauzeren mag altijd.
// 2. Alles wordt eerst GEPAUZEERD aangemaakt. Live zetten vraagt een einddatum, en dagbudget en totaal
//    (dagbudget × dagen) blijven onder de plafonds uit Vercel (META_MAX_DAGBUDGET, META_MAX_TOTAAL).
//    Geen knop in de app kan die verhogen. Twijfel of een fout van Meta = niets doen en melden.
// 3. "Wat valt op" is rekenwerk met vaste vuistregels, geen AI-oordeel.
// 4. Alleen totalen per campagne, set, advertentie en plaatsing. Geen uitsplitsing naar leeftijd,
//    geslacht of regio, geen klantenlijsten.
// 5. Doelgroep: land(en) plus optioneel leeftijd, of Advantage+ (Meta kiest).
//
// Opbouw (19 okt 2026): per product en doel één campagne met één advertentieset, en alle ads van dat
// product en doel samen in die set. Meta leert per set; tien sets van € 10 komen nooit uit de leerfase,
// één set van € 30 met vier ads wel. Budget, looptijd en doelgroep horen dus bij de set, niet bij de ad.
import { leesBytes } from './_opslag.js';

const API = 'https://graph.facebook.com/v23.0';
const TZ = process.env.TIJDZONE || 'Europe/Amsterdam';
const getal = (x) => Number(x) || 0;
const rond = (x, d = 2) => Math.round(getal(x) * 10 ** d) / 10 ** d;
export const fout = (status, tekst) => Object.assign(new Error(tekst), { status });

export function plafonds() {
  return {
    dag: Number(process.env.META_MAX_DAGBUDGET) > 0 ? Number(process.env.META_MAX_DAGBUDGET) : 50,
    totaal: Number(process.env.META_MAX_TOTAAL) > 0 ? Number(process.env.META_MAX_TOTAAL) : 500,
  };
}

async function meta(token, pad, opties) {
  opties = opties || {};
  const url = pad.startsWith('http') ? pad : `${API}${pad}`;
  const r = await fetch(url, {
    method: opties.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(opties.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opties.body ? JSON.stringify(opties.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    const e = data.error || {};
    throw Object.assign(new Error(e.error_user_msg || e.error_user_title || e.message || `Meta gaf ${r.status}`), { meta: e });
  }
  return data;
}
async function alles(token, pad) {
  let uit = [], volgende = pad, n = 0;
  while (volgende && n < 10) {
    const d = await meta(token, volgende);
    uit = uit.concat(d.data || []);
    volgende = d.paging && d.paging.next; n++;
  }
  return uit;
}

// ————— Cijfers —————
const ACTIES = {
  linkklikken: ['link_click'],
  bezoeken: ['landing_page_view'],
  leads: ['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration'],
  aankopen: ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'],
  interacties: ['post_engagement'],
};
function telActies(lijst) {
  const uit = {};
  for (const [naam, soorten] of Object.entries(ACTIES)) {
    const hit = soorten.map((s) => (lijst || []).find((a) => a.action_type === s)).find(Boolean);
    uit[naam] = hit ? getal(hit.value) : 0;
  }
  return uit;
}
function cijfers(rij) {
  const a = telActies(rij.actions);
  return {
    uitgegeven: rond(rij.spend), impressies: getal(rij.impressions), bereik: getal(rij.reach), frequentie: rond(rij.frequency),
    klikken: getal(rij.inline_link_clicks || a.linkklikken), ctr: rond(rij.inline_link_click_ctr), cpc: rond(rij.cost_per_inline_link_click), cpm: rond(rij.cpm), ...a,
  };
}
function bereikVan(periode) {
  if (periode === 'max') return 'date_preset=maximum';
  const n = Math.max(1, Math.min(365, Number(periode) || 30));
  const fmt = (d) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
  return 'time_range=' + encodeURIComponent(JSON.stringify({ since: fmt(new Date(Date.now() - (n - 1) * 86400000)), until: fmt(new Date()) }));
}
const stapVan = (periode) => (periode === 'max' ? 'monthly' : Number(periode) > 90 ? 7 : 1);
const STAP_NAAM = { 1: 'dag', 7: 'week', monthly: 'maand' };
const VELDEN = 'spend,impressions,reach,frequency,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,cpm,actions';

export async function analyse(token, account, periode) {
  const tijd = bereikVan(periode);
  const ins = (extra) => alles(token, `/${account}/insights?${tijd}&fields=${VELDEN}${extra}&limit=500`);
  const fouten = [];
  const veilig = (p, wat) => p.catch((e) => { fouten.push(`${wat}: ${e.message}`); return []; });
  const adVelden = 'id,name,adset_id,campaign_id,status,effective_status,created_time';
  const [acc, totaal, perDag, perCampagne, perSet, perAd, plaats, campagnes, sets, ads] = await Promise.all([
    meta(token, `/${account}?fields=name,currency,account_status`).catch((e) => { fouten.push(`Account: ${e.message}`); return {}; }),
    veilig(ins(''), 'Totaal'),
    veilig(ins(`&time_increment=${stapVan(periode)}`), 'Per dag'),
    veilig(ins('&level=campaign&fields=campaign_id,' + VELDEN), 'Per campagne'),
    veilig(ins('&level=adset&fields=adset_id,' + VELDEN), 'Per set'),
    veilig(ins('&level=ad&fields=ad_id,' + VELDEN), 'Per advertentie'),
    veilig(ins('&breakdowns=publisher_platform,platform_position'), 'Plaatsingen'),
    veilig(alles(token, `/${account}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time&limit=200`), 'Campagnes'),
    veilig(alles(token, `/${account}/adsets?fields=id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,optimization_goal&limit=300`), 'Advertentiesets'),
    veilig(alles(token, `/${account}/ads?fields=${adVelden},creative{id,thumbnail_url,object_type}&limit=300`), 'Advertenties'),
  ]);
  const kaart = (l, k) => Object.fromEntries(l.map((r) => [r[k], cijfers(r)]));
  const cC = kaart(perCampagne, 'campaign_id'), cS = kaart(perSet, 'adset_id'), cA = kaart(perAd, 'ad_id');
  const budget = (x) => (x.daily_budget ? { soort: 'dag', bedrag: getal(x.daily_budget) / 100 } : x.lifetime_budget ? { soort: 'totaal', bedrag: getal(x.lifetime_budget) / 100 } : null);
  const nu = Date.now();
  const stand = (x, start) => { const e = x.effective_status || x.status; return e === 'ACTIVE' && start && new Date(start).getTime() > nu ? 'INGEPLAND' : e; };
  const weg = (x) => ['DELETED', 'ARCHIVED'].includes(x.effective_status);
  const boom = campagnes.filter((c) => !weg(c)).map((c) => ({
    id: c.id, naam: c.name, doel: c.objective, stand: stand(c), aan: c.status === 'ACTIVE', budget: budget(c), gemaakt: c.created_time, cijfers: cC[c.id] || null,
    sets: sets.filter((s) => s.campaign_id === c.id && !weg(s)).map((s) => ({
      id: s.id, naam: s.name, stand: stand(s, s.start_time), aan: s.status === 'ACTIVE', budget: budget(s), start: s.start_time, eind: s.end_time, optimalisatie: s.optimization_goal, cijfers: cS[s.id] || null,
      ads: ads.filter((a) => a.adset_id === s.id && !weg(a)).map((a) => ({
        id: a.id, naam: a.name, stand: stand(a, s.start_time), aan: a.status === 'ACTIVE', beeld: a.creative && a.creative.thumbnail_url, video: a.creative && a.creative.object_type === 'VIDEO', cijfers: cA[a.id] || null,
      })),
    })),
  })).filter((c) => c.cijfers || ['ACTIVE', 'INGEPLAND', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES'].includes(c.stand) || c.sets.some((s) => s.cijfers))
    .sort((a, b) => ((b.stand === 'ACTIVE') - (a.stand === 'ACTIVE')) || (getal(b.cijfers && b.cijfers.uitgegeven) - getal(a.cijfers && a.cijfers.uitgegeven)) || String(b.gemaakt).localeCompare(String(a.gemaakt)));
  const NAAM = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads' };
  const plaatsingen = plaats.map((p) => ({ platform: NAAM[p.publisher_platform] || p.publisher_platform, plek: String(p.platform_position || '').replace(/^(instagram|facebook)_/, '').replace(/_/g, ' '), ...cijfers(p) }))
    .filter((p) => p.impressies > 0).sort((a, b) => b.uitgegeven - a.uitgegeven);
  return {
    bron: 'meta', opgehaald: new Date().toISOString(), periode, fouten,
    account: { id: String(account).replace(/^act_/, ''), naam: acc.name, munt: acc.currency || 'EUR' },
    totaal: totaal[0] ? cijfers(totaal[0]) : null,
    perDag: perDag.map((d) => ({ datum: d.date_start, ...cijfers(d) })), stap: STAP_NAAM[stapVan(periode)],
    campagnes: boom, plaatsingen,
  };
}

// ————— Instellingen —————
export const DOELEN = {
  verkeer: { objective: 'OUTCOME_TRAFFIC', optimalisatie: 'LINK_CLICKS', naam: 'Verkeer' },
  bereik: { objective: 'OUTCOME_AWARENESS', optimalisatie: 'REACH', naam: 'Bereik' },
  aanmeldingen: { objective: 'OUTCOME_LEADS', optimalisatie: 'OFFSITE_CONVERSIONS', event: 'COMPLETE_REGISTRATION', pixel: true, naam: 'Aanmeldingen' },
  aankopen: { objective: 'OUTCOME_SALES', optimalisatie: 'OFFSITE_CONVERSIONS', event: 'PURCHASE', pixel: true, naam: 'Aankopen' },
};
export const KNOPPEN = ['LEARN_MORE', 'SIGN_UP', 'BOOK_NOW', 'SHOP_NOW', 'SUBSCRIBE', 'APPLY_NOW'];
export const LANDEN = ['NL', 'BE', 'DE', 'LU'];

function naarUtc(naief) {
  if (!naief) return null;
  if (/Z$|[+-]\d\d:?\d\d$/.test(naief)) return new Date(naief).toISOString();
  const [d, t] = String(naief).split('T');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, m] = (t || '00:00').split(':').map(Number);
  const gok = Date.UTC(Y, M - 1, D, h || 0, m || 0);
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(gok)).map((x) => [x.type, x.value]));
  const lok = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return new Date(gok - (lok - gok)).toISOString();
}
const nlTijd = (iso) => new Date(iso).toLocaleString('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function schoonInstellingen(i) {
  i = i || {};
  const leeftijd = (x, std) => Math.max(18, Math.min(65, Math.round(Number(x) || std)));
  return {
    doel: DOELEN[i.doel] ? i.doel : 'verkeer',
    url: String(i.url || '').trim().slice(0, 500),
    knop: KNOPPEN.includes(i.knop) ? i.knop : 'LEARN_MORE',
    kop: String(i.kop || '').trim().slice(0, 80),
    kop2: String(i.kop2 || '').trim().slice(0, 80),
    omschrijving: String(i.omschrijving || '').trim().slice(0, 120),
    dagbudget: Math.round(Math.max(0, Number(i.dagbudget) || 0) * 100) / 100,
    start: /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(i.start || '') ? i.start : '',
    eind: /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(i.eind || '') ? i.eind : '',
    landen: (Array.isArray(i.landen) ? i.landen : ['NL']).filter((l) => LANDEN.includes(l)).slice(0, 4),
    advantage: i.advantage !== false,
    leeftijdMin: leeftijd(i.leeftijdMin, 25),
    leeftijdMax: leeftijd(i.leeftijdMax, 65),
  };
}
export function toetsBudget(i) {
  const p = plafonds();
  if (!i.eind) throw fout(400, 'Een einddatum is verplicht: een advertentie loopt nooit zonder eind.');
  if (!(i.dagbudget >= 1)) throw fout(400, 'Geef een dagbudget van minstens € 1.');
  if (i.dagbudget > p.dag) throw fout(400, `Dagbudget € ${i.dagbudget} ligt boven het plafond van € ${p.dag} per dag (instelbaar in Vercel: META_MAX_DAGBUDGET).`);
  const start = i.start ? new Date(naarUtc(i.start)).getTime() : Date.now();
  const eind = new Date(naarUtc(i.eind)).getTime();
  if (!(eind > Math.max(start, Date.now()) + 3600000)) throw fout(400, 'De einddatum moet minstens een uur na de start en na nu liggen.');
  const dagen = Math.ceil((eind - Math.max(start, Date.now())) / 86400000);
  const totaal = Math.round(dagen * i.dagbudget * 100) / 100;
  if (totaal > p.totaal) throw fout(400, `Totaal € ${totaal} (${dagen} dagen × € ${i.dagbudget}) ligt boven het plafond van € ${p.totaal} (instelbaar in Vercel: META_MAX_TOTAAL).`);
  return { dagen, totaal };
}

async function paginaId(token, account) {
  if (process.env.META_PAGE_ID) return process.env.META_PAGE_ID;
  const d = await meta(token, `/${account}/promote_pages?fields=id,name&limit=5`);
  const p = (d.data || [])[0];
  if (!p) throw new Error('Geen Facebook-pagina gevonden bij het advertentie-account. Zet META_PAGE_ID in Vercel.');
  return p.id;
}

// ————— Klaarzetten: alles GEPAUZEERD —————
// ad = de advertentie uit de opslag; groepen = { [product]: { [doel]: { campagneId, adsetId } } }.
// Een oude opslag met alleen een campagne-id (tekst) wordt vanzelf aangevuld met een set.
// Geeft { meta, groep, doel, ids, waarschuwingen } terug; de aanroeper slaat op.
const naarLokaal = (iso) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const weg = (x) => !x || ['DELETED', 'ARCHIVED'].includes(x.effective_status);

export async function klaarzetten(token, account, ad, groepen, merkNaam) {
  const m = ad.meta || {};
  const i = schoonInstellingen(m.instellingen);
  if (!/^https:\/\/[^\s]+\.[^\s]+/.test(i.url)) throw fout(400, 'Vul de link in waar de advertentie naartoe gaat (https://…).');
  if (!i.landen.length) throw fout(400, 'Kies minstens één land.');
  let budget = toetsBudget(i);
  const doel = DOELEN[i.doel];
  const pixel = process.env.META_PIXEL_ID;
  if (doel.pixel && !pixel) throw fout(400, `Sturen op ${doel.naam.toLowerCase()} kan pas als de Meta-pixel op je site staat (META_PIXEL_ID). Kies Verkeer of Bereik.`);
  if (m.stand === 'live') throw fout(409, 'Deze advertentie loopt al. Pauzeer hem eerst als je iets wilt veranderen.');
  const beeldPad = String(ad.beeld || '').replace(/^opslag\//, '');
  const bytes = beeldPad ? await leesBytes(beeldPad) : null;
  if (!bytes) throw fout(400, 'Er staat nog geen vastgelegd beeld op de advertentie. Bewaar eerst het ontwerp.');

  const dsa = process.env.META_DSA_NAAM || merkNaam || 'Onbekend';
  const pagina = await paginaId(token, account);
  const waarschuwingen = [];
  const groep = ad.product || 'los';
  const groepNaam = ad.productNaam || 'Losse advertenties';
  const vorige = (groepen[groep] || {})[i.doel];
  let campagneId = typeof vorige === 'string' ? vorige : vorige && vorige.campagneId;
  let adsetId = vorige && typeof vorige === 'object' ? vorige.adsetId : null;

  // 1. De campagne: één per product per doel, wordt hergebruikt.
  if (campagneId && weg(await meta(token, `/${campagneId}?fields=effective_status`).catch(() => null))) { campagneId = null; adsetId = null; }
  if (!campagneId) {
    const c = await meta(token, `/${account}/campaigns`, { method: 'POST', body: {
      name: `${merkNaam || 'Ads'} · ${groepNaam} · ${doel.naam}`, objective: doel.objective, status: 'PAUSED', buying_type: 'AUCTION',
      special_ad_categories: [], is_adset_budget_sharing_enabled: false,
    } });
    campagneId = c.id;
  }

  // 2. De advertentieset: één per product per doel, met het budget, de looptijd en de doelgroep.
  //    Loopt de set al (met andere ads), dan sluit deze ad aan en blijven budget en looptijd zoals ze zijn.
  const targeting = { geo_locations: { countries: i.landen }, targeting_automation: { advantage_audience: i.advantage ? 1 : 0 } };
  if (!i.advantage) { targeting.age_min = i.leeftijdMin; targeting.age_max = Math.max(i.leeftijdMin, i.leeftijdMax); }
  const setVelden = {
    name: `${groepNaam} · ${doel.naam}`.slice(0, 200), daily_budget: Math.round(i.dagbudget * 100),
    billing_event: 'IMPRESSIONS', optimization_goal: doel.optimalisatie, bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting, end_time: naarUtc(i.eind), dsa_beneficiary: dsa, dsa_payor: dsa,
  };
  if (i.start && new Date(naarUtc(i.start)).getTime() > Date.now() + 60000) setVelden.start_time = naarUtc(i.start);
  if (doel.objective === 'OUTCOME_TRAFFIC') setVelden.destination_type = 'WEBSITE';
  if (doel.pixel) setVelden.promoted_object = { pixel_id: pixel, custom_event_type: doel.event };
  let bestaand = null;
  if (adsetId) {
    bestaand = await meta(token, `/${adsetId}?fields=effective_status,status,campaign_id,daily_budget,start_time,end_time`).catch(() => null);
    if (weg(bestaand) || bestaand.campaign_id !== campagneId) { bestaand = null; adsetId = null; }
  }
  if (bestaand && bestaand.status === 'ACTIVE') {
    i.dagbudget = getal(bestaand.daily_budget) / 100;
    i.eind = bestaand.end_time ? naarLokaal(bestaand.end_time) : i.eind;
    i.start = bestaand.start_time && new Date(bestaand.start_time).getTime() > Date.now() ? naarLokaal(bestaand.start_time) : '';
    budget = toetsBudget(i);
    waarschuwingen.push(`Deze ad sluit aan bij de lopende set "${groepNaam} · ${doel.naam}" (€ ${i.dagbudget} per dag tot ${nlTijd(bestaand.end_time)}). Budget en looptijd veranderen niet; Meta verdeelt het over alle ads in de set.`);
  } else if (bestaand) {
    const { name, billing_event, optimization_goal, destination_type, promoted_object, ...bij } = setVelden;
    await meta(token, `/${adsetId}`, { method: 'POST', body: { ...bij, status: 'PAUSED' } });
  } else {
    adsetId = (await meta(token, `/${account}/adsets`, { method: 'POST', body: { ...setVelden, campaign_id: campagneId, status: 'PAUSED' } })).id;
  }

  // 3. Beeld en creative. Twee teksten of twee koppen: Meta toont per persoon de combinatie die het
  //    best werkt. Neemt Meta dat niet aan, dan gaat de ad met de eerste tekst en kop.
  const up = await meta(token, `/${account}/adimages`, { method: 'POST', body: { bytes: bytes.toString('base64'), name: `${ad.id}.jpg` } });
  const img = Object.values(up.images || {})[0];
  if (!img || !img.hash) throw new Error('Meta gaf geen beeld-id terug.');
  const ig = process.env.META_IG_USER_ID;
  const kop = i.kop || String(ad.hook || ad.titel || '').slice(0, 40);
  const kop2 = i.kop2 && i.kop2 !== kop ? i.kop2 : '';
  const tekst = ad.caption || '';
  const tekst2 = String(ad.caption2 || '').trim() && ad.caption2 !== tekst ? ad.caption2 : '';
  // Meta's automatische "verbeteringen" (tekst herschrijven, beeld bijwerken) uit: de stem blijft van jou.
  const geenAi = { degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } } } };
  const maak = (velden) => meta(token, `/${account}/adcreatives`, { method: 'POST', body: { name: `${ad.id} · ${new Date().toISOString().slice(0, 16)}`, ...velden } });
  let creative = null;
  if (tekst2 || kop2) {
    const feed = {
      images: [{ hash: img.hash }], bodies: [tekst, tekst2].filter(Boolean).map((text) => ({ text })), titles: [kop, kop2].filter(Boolean).map((text) => ({ text })),
      link_urls: [{ website_url: i.url }], call_to_action_types: [i.knop], ad_formats: ['SINGLE_IMAGE'], optimization_type: 'DEGREES_OF_FREEDOM',
    };
    if (i.omschrijving) feed.descriptions = [{ text: i.omschrijving }];
    const os = { page_id: pagina, ...(ig ? { instagram_user_id: ig } : {}) };
    creative = await maak({ object_story_spec: os, asset_feed_spec: feed, ...geenAi })
      .catch(() => maak({ object_story_spec: os, asset_feed_spec: feed }))
      .catch((e) => { waarschuwingen.push(`Meta nam de tweede tekst of kop niet aan (${e.message}); de ad gaat met de eerste tekst en kop.`); return null; });
  }
  if (!creative) {
    const spec = { page_id: pagina, link_data: { link: i.url, message: tekst, name: kop, description: i.omschrijving || undefined, image_hash: img.hash, call_to_action: { type: i.knop, value: { link: i.url } } } };
    if (ig) spec.instagram_user_id = ig;
    try { creative = await maak({ object_story_spec: spec, ...geenAi }); } catch (e) {
      if (ig && /instagram/i.test(e.message)) {
        delete spec.instagram_user_id;
        waarschuwingen.push('Instagram-account niet geaccepteerd; de advertentie toont op Instagram met de Facebook-pagina als afzender.');
        creative = await maak({ object_story_spec: spec, ...geenAi }).catch(() => maak({ object_story_spec: spec }));
      } else if (/degrees_of_freedom|enhancement|creative_features/i.test(e.message)) {
        waarschuwingen.push('Meta accepteerde het uitzetten van de AI-verbeteringen niet; check in Ads Manager onder "Advantage+ creative".');
        creative = await maak({ object_story_spec: spec });
      } else throw e;
    }
  }

  // 4. De advertentie zelf, in de set van dit product en doel. Een oude versie gaat weg.
  const nieuw = await meta(token, `/${account}/ads`, { method: 'POST', body: { name: `${ad.titel || ad.id}`.slice(0, 200), adset_id: adsetId, creative: { creative_id: creative.id }, status: 'PAUSED' } });
  if (m.adId && m.adId !== nieuw.id) await meta(token, `/${m.adId}`, { method: 'POST', body: { status: 'DELETED' } }).catch(() => {});
  return {
    groep, doel: i.doel, ids: { campagneId, adsetId }, waarschuwingen,
    meta: { instellingen: i, campagneId, adsetId, adId: nieuw.id, creativeId: creative.id, stand: 'klaar', klaargezet: new Date().toISOString(), tekstHash: ad.akkoordHash, budget, teksten: (tekst2 ? 2 : 1), koppen: (kop2 ? 2 : 1) },
  };
}

// ————— Rem op stapelen —————
// Een campagne aanzetten neemt elke set eronder mee die zelf nog op aan staat. En het dagplafond geldt voor
// alles wat in het account loopt, niet per set. Dus vóór live: geen tweede set die meeloopt, en het hele
// account samen onder META_MAX_DAGBUDGET.
async function remOpStapelen(token, campagneId, adsetId, dagbudget) {
  const account = `act_${String(process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '')}`;
  const p = plafonds();
  const euro = (c) => getal(c) / 100;
  const meelopers = (await alles(token, `/${campagneId}/adsets?fields=id,name,status,daily_budget&limit=100`)).filter((x) => x.id !== adsetId && x.status === 'ACTIVE');
  if (meelopers.length) {
    throw fout(409, `In deze campagne staat nog ${meelopers.length === 1 ? 'een andere set' : meelopers.length + ' andere sets'} aan: ${meelopers.map((x) => `"${x.name}" (€ ${euro(x.daily_budget)} per dag)`).join(', ')}. Die zou meelopen zodra de campagne aangaat. Zet ${meelopers.length === 1 ? 'die set' : 'die sets'} eerst uit met de schakelaar onder Cijfers, dan kan deze live.`);
  }
  const lopend = (await alles(token, `/${account}/adsets?fields=id,name,daily_budget,effective_status&effective_status=${encodeURIComponent('["ACTIVE"]')}&limit=200`)).filter((x) => x.id !== adsetId);
  const elders = lopend.reduce((t, x) => t + euro(x.daily_budget), 0);
  if (elders + dagbudget > p.dag) {
    throw fout(409, `Er loopt al € ${elders} per dag in je account (${lopend.map((x) => `"${x.name}" € ${euro(x.daily_budget)}`).join(', ')}). Met deze € ${dagbudget} erbij kom je op € ${elders + dagbudget} per dag, boven je plafond van € ${p.dag} per dag voor het hele account (META_MAX_DAGBUDGET).`);
  }
}

// ————— Live zetten of inplannen —————
export async function zetLive(token, ad, bevestig) {
  const m = ad.meta || {};
  if (!m.adId || !m.adsetId || !m.campagneId) throw fout(400, 'Zet de advertentie eerst klaar in Meta.');
  if (m.tekstHash !== ad.akkoordHash) throw fout(409, 'De tekst is veranderd sinds het klaarzetten. Zet hem opnieuw klaar.');
  const i = schoonInstellingen(m.instellingen);
  const budget = toetsBudget(i);
  // De klik bevestigt precies de bedragen die op het scherm stonden.
  if (!bevestig || Number(bevestig.dagbudget) !== i.dagbudget || String(bevestig.eind) !== i.eind) throw fout(409, 'De instellingen zijn veranderd sinds je ze zag. Herlaad en bevestig opnieuw.');
  const set = await meta(token, `/${m.adsetId}?fields=daily_budget,end_time,start_time`);
  const metaEind = set.end_time && new Date(set.end_time).getTime();
  if (getal(set.daily_budget) !== Math.round(i.dagbudget * 100) || !metaEind || Math.abs(metaEind - new Date(naarUtc(i.eind)).getTime()) > 120000) {
    throw fout(409, `De set van dit product staat in Meta op € ${getal(set.daily_budget) / 100} per dag${set.end_time ? ' tot ' + nlTijd(set.end_time) : ''}, de app op iets anders (waarschijnlijk door een andere ad in dezelfde set). Zet hem opnieuw klaar: dan nemen de app en Meta hetzelfde over.`);
  }
  await remOpStapelen(token, m.campagneId, m.adsetId, i.dagbudget);
  await meta(token, `/${m.campagneId}`, { method: 'POST', body: { status: 'ACTIVE' } });
  await meta(token, `/${m.adId}`, { method: 'POST', body: { status: 'ACTIVE' } });
  await meta(token, `/${m.adsetId}`, { method: 'POST', body: { status: 'ACTIVE' } });
  const terug = await meta(token, `/${m.adId}?fields=effective_status`).catch(() => ({}));
  const startIso = set.start_time || (i.start ? naarUtc(i.start) : null);
  const later = startIso && new Date(startIso).getTime() > Date.now() ? startIso : null;
  const review = /PENDING_REVIEW|IN_PROCESS/.test(terug.effective_status || '') ? ' Meta keurt hem eerst (meestal binnen een paar uur).' : '';
  return {
    meta: { ...m, stand: 'live', live: new Date().toISOString(), budget },
    gedaan: `${later ? 'ingepland vanaf ' + nlTijd(later) : 'aan'}, € ${i.dagbudget} per dag voor de hele set tot ${nlTijd(naarUtc(i.eind))} (max. € ${budget.totaal}).${review}`,
  };
}

// Pauzeren zet deze ad uit. Loopt er in de set daarna niets meer, dan gaat de set ook op pauze.
export async function pauzeer(token, ad) {
  const m = ad.meta || {};
  if (!m.adsetId) throw fout(404, 'Deze advertentie staat niet in Meta.');
  if (m.adId) await meta(token, `/${m.adId}`, { method: 'POST', body: { status: 'PAUSED' } });
  const anderen = await alles(token, `/${m.adsetId}/ads?fields=id,status&limit=100`).catch(() => null);
  if (!m.adId || !anderen || !anderen.some((a) => a.id !== m.adId && a.status === 'ACTIVE')) {
    await meta(token, `/${m.adsetId}`, { method: 'POST', body: { status: 'PAUSED' } });
  }
  return { meta: { ...m, stand: 'gepauzeerd', gepauzeerd: new Date().toISOString() } };
}

// ————— Aan/uit per campagne, set of advertentie, zoals de schakelaar in Meta Ads Manager —————
// Uit gaat meteen. Aan kost geld, dus eerst de rem: wat er na het aanzetten in het hele account per dag
// loopt (alleen sets waarvan set én campagne aan staan), mag niet boven het dagplafond (META_MAX_DAGBUDGET).
// Een campagne uitzetten zet ook de sets eronder uit, anders lopen ze mee zodra iemand de campagne weer aanzet.
// Geeft { gedaan, uit: { niveau, id } | null } terug; de aanroeper zet de eigen advertenties dan op gepauzeerd.
export async function schakel(token, account, body) {
  const niveau = String(body.niveau || ''), id = String(body.id || ''), aan = body.aan === true;
  if (!['campagne', 'set', 'ad'].includes(niveau) || !/^\d{6,25}$/.test(id)) throw fout(400, 'Geen geldig onderdeel.');
  const acc = String(account).replace(/^act_/, '');
  const x = await meta(token, `/${id}?fields=id,name,account_id,status`);
  if (String(x.account_id) !== acc) throw fout(403, 'Dit onderdeel hoort niet bij jouw advertentieaccount.');
  if (aan) {
    const p = plafonds();
    const sets = await alles(token, `/${account}/adsets?fields=id,name,status,daily_budget,campaign{id,status}&limit=300`);
    const straks = sets.filter((st) => {
      const campAan = st.campaign && st.campaign.status === 'ACTIVE';
      if (niveau === 'set' && st.id === id) return campAan;
      if (niveau === 'campagne' && st.campaign && st.campaign.id === id) return st.status === 'ACTIVE';
      return st.status === 'ACTIVE' && campAan;
    });
    const euro = (c) => getal(c) / 100;
    const totaal = straks.reduce((t, st) => t + euro(st.daily_budget), 0);
    if (totaal > p.dag) throw fout(409, `Na aanzetten loopt er € ${totaal} per dag in je account (${straks.map((st) => `"${st.name}" € ${euro(st.daily_budget)}`).join(', ')}), boven je plafond van € ${p.dag} per dag (META_MAX_DAGBUDGET). Zet eerst iets anders uit.`);
  }
  await meta(token, `/${id}`, { method: 'POST', body: { status: aan ? 'ACTIVE' : 'PAUSED' } });
  if (niveau === 'campagne' && !aan) {
    for (const st of await alles(token, `/${id}/adsets?fields=id,status&limit=100`).catch(() => [])) {
      if (st.status === 'ACTIVE') await meta(token, `/${st.id}`, { method: 'POST', body: { status: 'PAUSED' } });
    }
  }
  const woord = { campagne: 'campagne', set: 'set', ad: 'advertentie' }[niveau];
  return { gedaan: `${woord} "${x.name}" staat ${aan ? 'aan' : 'uit'}`, uit: aan ? null : { niveau, id } };
}
