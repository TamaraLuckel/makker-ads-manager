// De Ads Manager: maken (tekst + ontwerp), cijfers en planning.
// De server (api/ads.js) bewaakt de poort en de plafonds; deze pagina toont en vraagt.
(function () {
  'use strict';
  const S = window.SJABLONEN;
  const esc = S.esc;
  let H = S.huisstijl(null);
  let data = { ads: [], beeldbank: [], producten: [], kan: {} };
  let cijferData = null, periode = '30';
  let tab = 'maken', gekozen = null, fmt = '4x5', wachtBevestig = false, staat = null;

  // ————— Hulpjes —————
  const url = (pad) => (!pad ? '' : /^(data:|https?:|blob:)/.test(pad) ? pad : pad.startsWith('opslag/') ? '/api/beeld?pad=' + encodeURIComponent(pad.slice(7)) : '/' + String(pad).replace(/^\/+/, ''));
  const eur = (x, d) => '€ ' + (Number(x) || 0).toLocaleString('nl-NL', { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d });
  const n0 = (x) => (Number(x) || 0).toLocaleString('nl-NL');
  const pct = (x) => (Number(x) || 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 }) + '%';
  const p2 = (n) => (n < 10 ? '0' : '') + n;
  const lokaalIso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const kortDag = (s) => (s ? new Date(String(s).length <= 10 ? s + 'T12:00:00' : s).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
  const kortTijd = (s) => (s ? new Date(s).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  let meldTimer = null;
  function melding(t, soort) {
    const m = $('#melding');
    m.textContent = t || ''; m.className = t ? 'aan ' + (soort || '') : '';
    clearTimeout(meldTimer);
    if (t && soort !== 'fout' && soort !== 'bezig') meldTimer = setTimeout(() => { m.className = ''; }, 5000);
  }
  async function haal(pad) {
    const r = await fetch(pad, { credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.fout || `Fout ${r.status}`);
    return j;
  }
  async function stuur(body) {
    const r = await fetch('/api/ads', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.fout || `Fout ${r.status}`);
    return j;
  }
  const laad = () => haal('/api/ads').then((d) => { data = d; return d; });
  const adVan = (id) => data.ads.find((a) => a.id === id);

  // ————— Start —————
  async function start() {
    try { H = S.huisstijl(await haal('/merk/huisstijl.json')); } catch (e) { /* standaard huisstijl */ }
    document.documentElement.style.setProperty('--accent', H.kleuren.accent);
    $('#merkNaam').textContent = H.naam || 'Ads Manager';
    if (H.logo && H.logo.app) { const l = $('#merkLogo'); l.src = url(H.logo.app); l.hidden = false; }
    try { await laad(); } catch (e) { $('#blad').innerHTML = `<div class="kaart"><p>Kon de advertenties niet laden: ${esc(e.message)}</p></div>`; return; }
    window.addEventListener('hashchange', route);
    route();
  }
  function route() {
    const [, t, id] = (location.hash || '#/maken').split('/');
    tab = ['maken', 'cijfers', 'planning'].includes(t) ? t : 'maken';
    if (id) gekozen = id;
    $$('.tabs a').forEach((a) => a.classList.toggle('aan', a.dataset.tab === tab));
    teken();
  }
  function teken() {
    const el = $('#blad');
    if (tab === 'maken') return maken(el);
    if (!data.kan.lezen) { el.innerHTML = nietGekoppeld(); return; }
    if (cijferData && cijferData.periode === periode) return tab === 'cijfers' ? cijfers(el) : planning(el);
    el.innerHTML = '<p class="leeg">Cijfers ophalen uit Meta…</p>';
    haal(`/api/ads?cijfers=1&periode=${periode}`).then((d) => { cijferData = d; teken(); })
      .catch((e) => { el.innerHTML = `<div class="kaart"><p>Meta gaf geen antwoord: ${esc(e.message)}</p></div>`; });
  }
  function nietGekoppeld() {
    return `<div class="kaart"><h3>Meta is nog niet gekoppeld</h3><p>Cijfers en planning komen rechtstreeks uit je advertentie-account. Daarvoor zijn <code>META_TOKEN</code> en <code>META_AD_ACCOUNT_ID</code> nodig in Vercel. Vraag Claude Code: <i>"koppel Meta aan mijn Ads Manager"</i>; het stappenplan staat in <code>META-KOPPELEN.md</code>.</p><p class="leeg">Maken werkt ook zonder Meta: je downloadt de beelden en zet ze zelf in Ads Manager.</p></div>`;
  }

  // ————— Maken —————
  function standVan(ad) {
    const m = ad.meta || {};
    if (ad.admaker && ['wacht', 'bezig', 'vraag'].includes(ad.admaker.status)) return 'bezig';
    if (m.stand === 'live') return 'live';
    if (m.stand === 'klaar' || m.stand === 'gepauzeerd') return 'meta';
    if (ad.status === 'akkoord' && !ad.tekstVeranderd) return 'akkoord';
    return 'concept';
  }
  const KOLOMMEN = [['bezig', 'Bij je Claude-routine'], ['live', 'Loopt of ingepland'], ['meta', 'In Meta, gepauzeerd'], ['akkoord', 'Akkoord'], ['concept', 'Concept']];
  function maken(el) {
    const ads = data.ads;
    el.innerHTML = `${paneel()}<div class="maak-kop"><button class="knop rand" id="nieuwe" type="button">+ Zelf een advertentie maken</button><span class="leeg">${ads.length} ${ads.length === 1 ? 'advertentie' : 'advertenties'}</span></div>
      <div class="maken"><div class="lijst">${KOLOMMEN.map(([k, t]) => { const l = ads.filter((a) => standVan(a) === k); return l.length ? `<div class="groep"><h4>${t} <span>${l.length}</span></h4>${l.map(kaartje).join('')}</div>` : ''; }).join('') || '<p class="leeg">Nog geen advertenties. Laat Claude er een paar schrijven, of maak er zelf een.</p>'}</div>
      <div id="detail">${uitleg()}</div></div>`;
    koppelPaneel(el);
    $('#nieuwe').onclick = () => actie(() => stuur({ actie: 'nieuw' }).then((j) => { gekozen = j.ad.id; return laad(); }), 'Nieuwe advertentie staat klaar. Kies een sjabloon en een foto.');
    $$('[data-kaart]', el).forEach((k) => { k.onclick = () => { gekozen = k.dataset.kaart; wachtBevestig = false; staat = null; maken(el); if (window.innerWidth <= 1000) $('#detail').scrollIntoView({ behavior: 'smooth' }); }; });
    const ad = gekozen && adVan(gekozen);
    if (ad) detail($('#detail'), ad);
    // Zolang de routine schrijft: elke 30 seconden kijken of er iets klaar is.
    clearTimeout(window.__poll);
    if (ads.some((a) => a.admaker && ['wacht', 'bezig'].includes(a.admaker.status))) {
      window.__poll = setTimeout(() => { if (tab === 'maken' && !(staat && staat.vuil)) laad().then(() => { if (tab === 'maken') maken($('#blad')); }); }, 30000);
    }
  }
  function uitleg() {
    const pl = data.kan.plafond || { dag: 50, totaal: 500 };
    return `<div class="kaart uitleg"><span class="label">Zo werkt het</span><h3>Van idee tot advertentie</h3><ol>
      <li><b>Jij geeft de vonk</b>: wat wil je zeggen, aan wie? Je Claude-routine schrijft per hoek een concept met sjabloon en foto, op je eigen Claude-account.</li>
      <li><b>Jij maakt hem af</b>: tekst, foto, uitsnede en sjabloon wisselen tot het klopt. Bewaar het ontwerp: dan liggen er een 4:5 (feed) en een 9:16 (stories en reels) klaar.</li>
      <li><b>Jouw akkoord</b> op de tekst. Daarna downloaden, of (met Meta gekoppeld) klaarzetten in Meta: alles gepauzeerd, kost niets.</li>
      <li><b>Live zetten</b> is het enige moment waarop geld uitgaat. Je bevestigt bedrag en einddatum, binnen het plafond van ${eur(pl.dag, 0)} per dag en ${eur(pl.totaal, 0)} totaal.</li></ol>
      <p class="leeg">Kies links een advertentie.</p></div>`;
  }
  function kaartje(ad) {
    const b = ad.beeld ? url(ad.beeld) : '';
    const i = (ad.meta && ad.meta.instellingen) || {};
    const a = ad.admaker || {};
    const chip = a.status === 'wacht' ? '<small class="chip">in de wachtrij</small>' : a.status === 'bezig' ? '<small class="chip">Claude schrijft…</small>' : a.status === 'vraag' ? '<small class="chip vraag">Claude heeft een vraag</small>'
      : ad.tekstVeranderd ? '<small class="chip vraag">tekst gewijzigd na akkoord</small>' : (ad.ontwerp && !ad.beeld) ? '<small class="chip">ontwerp nog niet bewaard</small>'
      : (ad.meta && ad.meta.verouderd) ? '<small class="chip vraag">opnieuw klaarzetten in Meta</small>' : '';
    return `<button type="button" class="kaartje${gekozen === ad.id ? ' aan' : ''}" data-kaart="${esc(ad.id)}">${b ? `<img src="${esc(b)}" alt="" loading="lazy">` : '<span class="geen">Aa</span>'}<span><b>${esc(ad.titel || 'Zonder titel')}</b><small>${esc([ad.productNaam, i.dagbudget ? eur(i.dagbudget, 0) + '/dag' : '', kortDag(ad.gemaakt)].filter(Boolean).join(' · '))}</small>${chip}</span></button>`;
  }

  // Het paneel "Laat Claude ads schrijven"
  const HOEKEN = [['geld', 'Geld', 'wat het oplevert of bespaart, met een echt getal'], ['tijd', 'Tijd', 'een herkenbaar moment, wat er van je bord gaat'],
    ['bewijs', 'Bewijs', 'een echte review, woordelijk'], ['identiteit', 'Identiteit', 'een stevige stelling over wie je bent'], ['vrij', 'Laat Claude kiezen', 'de sterkste hoek']];
  function paneel() {
    return `<details class="kaart paneel" open><summary><span class="label">Nieuwe ads</span><h3>Laat Claude ads schrijven</h3></summary>
      <form id="maakForm" class="form">
        <label class="breed">Waar gaat het over? Jouw vonk: wat wil je zeggen, aan wie, wat heb je meegemaakt?<textarea name="opdracht" rows="3" required placeholder="Bijvoorbeeld: nog één week inschrijven. Ik wil dat ondernemers die nu alles zelf doen voelen dat het lichter kan."></textarea></label>
        <label>Product<select name="product">${data.producten.map((p) => `<option value="${esc(p.id)}">${esc(p.naam)}</option>`).join('')}<option value="">Geen product (losse ad)</option></select></label>
        <div class="breed"><span class="lab">Hoeken, één ad per hoek</span><div class="hoeken">${HOEKEN.map((h, i) => `<label class="hoek"><input type="checkbox" name="hoek" value="${h[0]}"${i < 3 ? ' checked' : ''}><span><b>${h[1]}</b><small>${h[2]}</small></span></label>`).join('')}</div></div>
        <div class="breed"><span class="lab">Foto's om uit te kiezen <small>(niets aangevinkt: Claude kiest uit de hele beeldbank)</small></span>
          <div class="fotos">${data.beeldbank.map((f) => `<label class="foto" title="${esc(f.beschrijving)}"><input type="checkbox" name="foto" value="${esc(f.pad)}"><img src="${esc(url(f.pad))}" alt="" loading="lazy"></label>`).join('')}
          <label class="foto plus" title="Foto toevoegen aan de beeldbank"><input type="file" accept="image/jpeg,image/png" class="upload" hidden><span>+ foto</span></label></div></div>
        <div class="breed knoppen"><button class="knop" type="submit">Schrijf de ads</button><span class="leeg">Je Claude-routine pakt ze op; binnen een paar minuten staan ze hieronder. Deze pagina ververst vanzelf.</span></div>
      </form></details>`;
  }
  function koppelPaneel(el) {
    const form = $('#maakForm', el);
    $$('.upload', el).forEach((u) => { u.onchange = () => { const f = u.files[0]; if (f) uploadFoto(f).then(() => teken()); }; });
    if (!form) return;
    form.onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const hoeken = f.getAll('hoek');
      if (!hoeken.length) return melding('Kies minstens één hoek.', 'fout');
      $('button[type=submit]', form).disabled = true;
      melding('Opdracht naar je Claude-routine sturen…', 'bezig');
      stuur({ actie: 'maak', opdracht: f.get('opdracht'), product: f.get('product'), hoeken, fotos: f.getAll('foto') })
        .then((j) => { gekozen = j.ads[0] && j.ads[0].id; return laad().then(() => j); })
        .then((j) => { melding(`${j.ads.length} ${j.ads.length === 1 ? 'ad staat' : 'ads staan'} in de wachtrij. Je routine begint binnen een paar minuten.`, 'info'); teken(); })
        .catch((e2) => { melding(e2.message, 'fout'); laad().then(teken); });
    };
  }
  function uploadFoto(file) {
    const beschrijving = window.prompt('Korte beschrijving van de foto (wie staat erop, waar, wat doen ze?)', '');
    if (beschrijving === null) return Promise.resolve();
    melding('Foto verkleinen en opslaan…', 'bezig');
    return new Promise((ok, nee) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 2500 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        stuur({ actie: 'foto', naam: file.name, beschrijving, data: c.toDataURL('image/jpeg', 0.86), staand: c.height > c.width })
          .then(laad).then(() => { melding('Foto staat in de beeldbank.', 'info'); ok(); }).catch((e) => { melding(e.message, 'fout'); nee(e); });
      };
      img.onerror = () => { melding('Kon de foto niet lezen.', 'fout'); nee(new Error('foto')); };
      img.src = URL.createObjectURL(file);
    });
  }

  // ————— Detail van één advertentie —————
  function standaard(ad) {
    const s = new Date(); s.setDate(s.getDate() + 1); s.setHours(9, 0, 0, 0);
    const e = new Date(s); e.setDate(e.getDate() + 7); e.setHours(23, 0, 0, 0);
    const v = ad.advoorstel || {};
    return { doel: data.kan.pixel ? 'aanmeldingen' : 'verkeer', url: v.url || '', knop: 'LEARN_MORE', kop: String(v.kop || ad.hook || '').slice(0, 40), kop2: String(v.kop2 || '').slice(0, 40), omschrijving: v.omschrijving || '', dagbudget: 10, start: lokaalIso(s), eind: lokaalIso(e), landen: ['NL', 'BE'], advantage: true, leeftijdMin: 25, leeftijdMax: 65 };
  }
  function reken(i) {
    if (!i.eind || !i.dagbudget) return null;
    const start = Math.max(i.start ? new Date(i.start).getTime() : Date.now(), Date.now());
    const dagen = Math.ceil((new Date(i.eind).getTime() - start) / 86400000);
    return dagen > 0 ? { dagen, totaal: Math.round(dagen * i.dagbudget * 100) / 100 } : null;
  }
  const KNOP = { LEARN_MORE: 'Meer informatie', SIGN_UP: 'Aanmelden', BOOK_NOW: 'Nu boeken', SHOP_NOW: 'Nu kopen', SUBSCRIBE: 'Abonneren', APPLY_NOW: 'Nu aanvragen' };

  function detail(vak, ad) {
    const a = ad.admaker || {};
    if (a.status === 'wacht' || a.status === 'bezig') {
      const minuten = Math.round((Date.now() - new Date(a.gevraagd || ad.gemaakt).getTime()) / 60000);
      vak.innerHTML = `<div class="kaart wacht"><span class="lamp"></span><div><b>${a.status === 'bezig' ? 'Je Claude-routine schrijft deze ad' : 'In de wachtrij bij je Claude-routine'}</b><p class="leeg">Hoek: ${esc(a.hoek || 'vrij')} · ${minuten} min geleden gevraagd. De pagina ververst vanzelf.${minuten > 20 ? ' Duurt het langer dan 20 minuten, kijk dan op claude.ai/code/routines of de routine draait, of start hem daar met de hand.' : ''}</p><div class="knoppen"><button class="knop klein rand" id="ververs" type="button">Ververs</button><button class="knop klein stil" id="weg" type="button">Verwijder</button></div></div></div>`;
      $('#ververs').onclick = () => laad().then(teken);
      $('#weg').onclick = () => verwijderAd(ad);
      return;
    }
    const m = ad.meta || {};
    const kan = data.kan;
    const i = Object.assign(standaard(ad), m.instellingen || {});
    const stand = standVan(ad);
    const live = m.stand === 'live';
    const akkoord = ad.status === 'akkoord' && !ad.tekstVeranderd;
    const r = reken(i);
    const pl = kan.plafond || { dag: 50, totaal: 500 };
    const boven = i.dagbudget > pl.dag || (r && r.totaal > pl.totaal);
    const dis = live ? ' disabled' : '';
    const domein = (() => { try { return new URL(i.url || (ad.advoorstel || {}).url).hostname.replace(/^www\./, ''); } catch (e) { return 'jouw-site.nl'; } })();
    const meta = kan.lezen || kan.schrijven;
    if (!staat || staat.id !== ad.id) staat = { id: ad.id, o: JSON.parse(JSON.stringify(ad.ontwerp || { sjabloon: 'woord', foto: '', velden: {} })), vuil: false };

    let h = `<div class="kaart detail"><div class="detail-kop"><div><span class="label">${esc(ad.productNaam || 'Advertentie')}</span><h3>${esc(ad.titel || 'Zonder titel')}</h3></div><button class="kruis" type="button" id="dicht" aria-label="Sluiten">×</button></div>`;
    if (a.status === 'vraag') h += `<div class="kaart zacht vraag"><b>Je Claude-routine heeft een vraag</b><p>${esc(a.vraag || '')}</p><div class="knoppen"><button class="knop klein" type="button" id="antwoord">Beantwoord en laat opnieuw schrijven</button></div></div>`;
    if (ad.inhoud || ad.nodig || ad.notitie) h += `<div class="notities">${ad.inhoud ? `<p><b>Waarom zo:</b> ${esc(ad.inhoud)}</p>` : ''}${ad.nodig ? `<p class="let"><b>Nog nodig vóór het live kan:</b> ${esc(ad.nodig)}</p>` : ''}${ad.notitie ? `<p class="leeg">${esc(ad.notitie)}</p>` : ''}</div>`;

    // Ontwerper
    h += `<section class="stap"><div class="stap-kop"><h4><span>1</span>Beeld</h4><div class="schakel"><a data-fmt="4x5">4:5 feed</a><a data-fmt="9x16">9:16 stories</a></div></div>
      <div class="ontwerp"><div class="links"><div class="vb"><iframe id="frame" title="Voorvertoning" sandbox="allow-same-origin"></iframe></div>
        <p class="leeg tip">Dit is het echte beeld. Wat je rechts verandert, zie je meteen.</p>
        ${ad.beelden && ad.beelden.length ? `<div class="knoppen"><a class="knop klein rand" href="${esc(url(ad.beelden[0]))}&download=${esc(ad.id)}-4x5.jpg">Download 4:5</a><a class="knop klein rand" href="${esc(url(ad.beelden[1] || ad.beelden[0]))}&download=${esc(ad.id)}-9x16.jpg">Download 9:16</a></div>` : ''}</div>
        <div class="rechts" id="velden"></div></div>
      <div class="knoppen"><button class="knop" type="button" id="bewaar"${live ? ' disabled' : ''}>Bewaar ontwerp</button>${!live ? '<button class="knop klein stil" type="button" id="opnieuw">Vraag Claude om een nieuwe versie</button>' : ''}<span class="vuil" id="vuil">${ad.ontwerp && !ad.beeld ? 'Nog niet bewaard' : ''}</span></div></section>`;

    // Tekst
    h += `<section class="stap"><h4><span>2</span>Tekst</h4><div class="tekst-grid"><form id="tekstForm" class="form">
      <label class="breed">Werktitel (alleen voor jou)<input name="titel" value="${esc(ad.titel)}"${dis}></label>
      <label class="breed">Primaire tekst (de eerste 125 tekens zijn je hook)<textarea name="caption" rows="9"${dis}>${esc(ad.caption)}</textarea><small id="teller"></small></label>
      <label class="breed">Tweede primaire tekst (mag leeg; zelfde boodschap, ander begin of korter. Meta toont per persoon de tekst die het best werkt)<textarea name="caption2" rows="5"${dis}>${esc(ad.caption2 || '')}</textarea></label>
      <label class="breed">Kop onder het beeld (max 40 tekens)<input name="kop" maxlength="80" value="${esc((ad.advoorstel || {}).kop)}"${dis}></label>
      <label class="breed">Tweede kop (mag leeg; bijvoorbeeld je hook in zes woorden)<input name="kop2" maxlength="80" value="${esc((ad.advoorstel || {}).kop2 || '')}"${dis}></label>
      <label class="breed">Regel onder de kop (mag leeg)<input name="omschrijving" maxlength="120" value="${esc((ad.advoorstel || {}).omschrijving)}"${dis}></label>
      <label class="breed">Link<input name="url" type="url" placeholder="https://" value="${esc((ad.advoorstel || {}).url)}"${dis}></label>
      ${live ? '' : '<div class="breed knoppen"><button class="knop klein" type="submit">Bewaar tekst</button><button class="knop klein stil" type="button" id="kopieer">Kopieer tekst</button></div>'}
      </form>
      <div class="feed" aria-label="Zo ziet hij eruit in de feed"><div class="feed-kop"><span class="feed-logo">${esc((H.naam || 'A').slice(0, 1))}</span><span><b>${esc(H.naam || 'Jouw pagina')}</b><small>Gesponsord</small></span></div>
        <div class="feed-tekst">${ad.caption ? esc(ad.caption) : '<span class="leeg">Hier komt je primaire tekst.</span>'}</div>
        <div class="feed-beeld">${ad.beeld ? `<img src="${esc(url(ad.beeld))}" alt="">` : '<span>Nog geen bewaard beeld</span>'}</div>
        <div class="feed-onder"><span><small>${esc(domein.toUpperCase())}</small><b>${esc((ad.advoorstel || {}).kop || 'Kop')}</b></span><span class="feed-knop">${esc(KNOP[i.knop] || 'Meer informatie')}</span></div></div></div></section>`;

    // Akkoord
    h += `<section class="stap${akkoord ? ' af' : ''}"><h4><span>3</span>Akkoord</h4>
      <p>${akkoord ? `Akkoord gegeven ${esc(kortTijd(ad.akkoordOp))}. Verander je de tekst, dan vervalt het akkoord vanzelf.` : ad.tekstVeranderd ? '<span class="let">De tekst is gewijzigd na je akkoord.</span> Lees hem nog eens en geef opnieuw akkoord.' : 'Lees tekst en beeld nog één keer. Jouw akkoord is de poort: zonder akkoord gaat er niets naar Meta.'}</p>
      ${!akkoord && !live ? `<div class="knoppen"><button class="knop klein" type="button" id="akkoord"${ad.caption && ad.beeld ? '' : ' disabled title="Eerst een tekst en een bewaard ontwerp"'}>Geef akkoord</button></div>` : ''}</section>`;

    // Meta
    if (!meta) {
      h += `<section class="stap"><h4><span>4</span>Naar Meta</h4><p>Download de twee beelden hierboven, kopieer de tekst, en zet ze in Meta Ads Manager. Of koppel Meta aan deze app (vraag Claude Code: <i>"koppel Meta aan mijn Ads Manager"</i>), dan zet je hem vanaf hier klaar, live en zie je de cijfers.</p></section>`;
    } else {
      const doelen = Object.entries(kan.doelen || {});
      h += `<section class="stap${m.instellingen ? ' af' : ''}"><h4><span>4</span>Doel, budget en looptijd</h4><form id="adForm" class="form">
        <label>Doel<select name="doel"${dis}>${doelen.map(([k, d]) => `<option value="${k}"${k === i.doel ? ' selected' : ''}${d.pixel && !kan.pixel ? ' disabled' : ''}>${esc(d.naam)}${d.pixel && !kan.pixel ? ' (pixel nodig)' : ''}</option>`).join('')}</select></label>
        <p class="breed leeg" id="doelUitleg">${esc(doelUitleg(i.doel))}</p>
        <label>Knop<select name="knop"${dis}>${Object.keys(KNOP).map((k) => `<option value="${k}"${k === i.knop ? ' selected' : ''}>${KNOP[k]}</option>`).join('')}</select></label>
        <label class="breed">Link (waar gaat de klik heen)<input name="url" type="url" value="${esc(i.url)}"${dis}></label>
        <label class="breed">Kop onder het beeld<input name="kop" maxlength="80" value="${esc(i.kop)}"${dis}></label>
        <label class="breed">Tweede kop (mag leeg)<input name="kop2" maxlength="80" value="${esc(i.kop2 || '')}"${dis}></label>
        <label class="breed">Regel onder de kop<input name="omschrijving" maxlength="120" value="${esc(i.omschrijving)}"${dis}></label>
        <p class="breed leeg">Budget, looptijd en doelgroep gelden voor de hele set: alle ads van <b>${esc(ad.productNaam || 'losse advertenties')}</b> met dit doel staan samen in één set en delen één budget. Meta schuift het geld zelf naar de ad die het best werkt. Vuistregel: liever één set van € 20 tot € 40 per dag met 3 tot 6 ads dan veel kleine sets.</p>
        <label>Dagbudget voor de set (€)<input name="dagbudget" type="number" min="1" step="1" max="${pl.dag}" value="${esc(i.dagbudget)}"${dis}></label>
        <label>Landen<span class="landen">${(kan.landen || ['NL', 'BE']).map((l) => `<label><input type="checkbox" name="land" value="${l}"${i.landen.includes(l) ? ' checked' : ''}${dis}>${l}</label>`).join('')}</span></label>
        <label>Start<input name="start" type="datetime-local" value="${esc(i.start)}"${dis}></label>
        <label>Eind (verplicht)<input name="eind" type="datetime-local" value="${esc(i.eind)}" required${dis}></label>
        <label class="breed vink"><input type="checkbox" name="advantage"${i.advantage ? ' checked' : ''}${dis}> Laat Meta de doelgroep zoeken (Advantage+). Uit: zelf een leeftijd kiezen.</label>
        <label class="leeftijd"${i.advantage ? ' hidden' : ''}>Leeftijd van<input name="leeftijdMin" type="number" min="18" max="65" value="${esc(i.leeftijdMin)}"${dis}></label>
        <label class="leeftijd"${i.advantage ? ' hidden' : ''}>tot en met<input name="leeftijdMax" type="number" min="18" max="65" value="${esc(i.leeftijdMax)}"${dis}></label>
        <div class="breed som${boven ? ' te' : ''}" id="som">${somTekst(i, r, pl)}</div>
        ${live ? '<p class="breed leeg">Loopt nu. Pauzeer om iets te veranderen.</p>' : '<div class="breed knoppen"><button class="knop klein" type="submit">Bewaar instellingen</button></div>'}
      </form></section>`;
      const kanKlaar = kan.schrijven && akkoord && m.instellingen && !live;
      h += `<section class="stap${stand === 'meta' || stand === 'live' ? ' af' : ''}"><h4><span>5</span>Klaarzetten in Meta</h4>
        <p>${m.adId ? `Staat in Meta (${m.stand === 'live' ? 'aan' : 'gepauzeerd'}), klaargezet ${esc(kortTijd(m.klaargezet))}.${m.verouderd ? ' <b>Gewijzigd sinds het klaarzetten</b>: zet opnieuw klaar.' : ''}` : 'Zet de ad in de set van dit product en doel (die maakt de app de eerste keer aan). Alles gepauzeerd: het kost niets en niemand ziet iets. Loopt de set al, dan sluit de ad aan bij het budget dat er staat.'}</p>
        <div class="knoppen"><button class="knop klein${m.adId ? ' rand' : ''}" type="button" id="klaar"${kanKlaar ? '' : ' disabled'}>${m.adId ? 'Opnieuw klaarzetten' : 'Zet klaar in Meta'}</button>${m.adId && cijferData && cijferData.account ? `<a class="knop klein stil" target="_blank" rel="noopener" href="https://adsmanager.facebook.com/adsmanager/manage/ads?act=${esc(cijferData.account.id)}&selected_ad_ids=${esc(m.adId)}">Bekijk in Meta ↗</a>` : ''}</div>
        ${!kan.schrijven ? '<p class="leeg">Wacht op de schrijfsleutel (META_ADS_TOKEN).</p>' : !akkoord ? '<p class="leeg">Eerst akkoord (stap 3).</p>' : !m.instellingen ? '<p class="leeg">Eerst de instellingen bewaren (stap 4).</p>' : ''}</section>`;
      const kanLive = kan.schrijven && m.adId && !live && !m.verouderd && !boven && r && akkoord;
      const later = i.start && new Date(i.start).getTime() > Date.now() + 60000;
      h += `<section class="stap${live ? ' af' : ''}"><h4><span>6</span>${later ? 'Inplannen' : 'Live zetten'}</h4>`;
      if (live) h += `<p>${later ? 'Ingepland vanaf ' + esc(kortTijd(i.start)) : 'Loopt'} tot ${esc(kortTijd(i.eind))}, ${eur(i.dagbudget, 0)} per dag.</p><div class="knoppen"><button class="knop klein rand" type="button" id="pauze">Pauzeer</button></div>`;
      else if (wachtBevestig && kanLive) h += `<div class="bevestig"><p>${later ? 'Inplannen vanaf <b>' + esc(kortTijd(i.start)) + '</b>' : 'Nu aanzetten'}, <b>${eur(i.dagbudget, 0)} per dag</b> tot <b>${esc(kortTijd(i.eind))}</b>.<br>Dat is ${r.dagen} dagen, <b>maximaal ${eur(r.totaal)}</b>. Meta keurt de advertentie eerst.</p><div class="knoppen"><button class="knop klein" type="button" id="ja">Ja, ${later ? 'plan in' : 'zet live'}</button><button class="knop klein stil" type="button" id="nee">Annuleer</button></div></div>`;
      else h += `<p>${m.stand === 'gepauzeerd' ? 'Gepauzeerd. ' : ''}Het enige moment waarop er geld uitgaat. Je bevestigt bedrag en einddatum.</p><div class="knoppen"><button class="knop klein" type="button" id="live"${kanLive ? '' : ' disabled'}>${m.stand === 'gepauzeerd' ? 'Weer aanzetten' : later ? 'Plan in' : 'Zet live'}</button></div>`;
      h += '</section>';
    }
    h += `<div class="voet-detail"><button class="knop klein stil" type="button" id="weg">Verwijder deze advertentie</button></div></div>`;
    vak.innerHTML = h;
    koppelOntwerper(vak, ad);
    // Net geschreven door de routine: de beelden meteen vastleggen, dan kan hij door naar akkoord.
    if (ad.ontwerp && !ad.beeld && !staat.vuil && a.status === 'klaar' && !ad.__vastgelegd && !live) { ad.__vastgelegd = true; const b = $('#bewaar', vak); if (b) b.click(); }

    const knop = (id, f) => { const k = $('#' + id, vak); if (k) k.onclick = f; };
    knop('dicht', () => { gekozen = null; staat = null; maken($('#blad')); });
    knop('weg', () => verwijderAd(ad));
    knop('antwoord', () => { const w = window.prompt('Je antwoord aan Claude:', ''); if (w) opnieuw(ad, w); });
    knop('opnieuw', () => { const w = window.prompt('Wat moet er anders? Claude maakt dan een nieuwe versie van deze ad.', ''); if (w) opnieuw(ad, w); });
    knop('akkoord', () => actie(() => stuur({ actie: 'akkoord', itemId: ad.id }).then(laad), 'Akkoord gegeven.'));
    knop('klaar', () => actie(() => stuur({ actie: 'klaarzetten', itemId: ad.id }).then((j) => laad().then(() => j)), (j) => 'Staat klaar in Meta, gepauzeerd.' + ((j.waarschuwingen || []).length ? ' Let op: ' + j.waarschuwingen.join(' ') : ''), 'Bezig: beeld uploaden en klaarzetten in Meta…'));
    knop('live', () => { wachtBevestig = true; detail(vak, ad); });
    knop('nee', () => { wachtBevestig = false; detail(vak, ad); });
    knop('ja', () => { wachtBevestig = false; actie(() => stuur({ actie: 'live', itemId: ad.id, bevestig: { dagbudget: i.dagbudget, eind: i.eind } }).then((j) => { cijferData = null; return laad().then(() => j); }), (j) => j.gedaan); });
    knop('pauze', () => actie(() => stuur({ actie: 'pauzeer', itemId: ad.id }).then(() => { cijferData = null; return laad(); }), 'Gepauzeerd.'));
    knop('kopieer', () => {
      const t = [ad.caption, '', ...(ad.caption2 ? ['Tweede tekst:', ad.caption2, ''] : []), 'Kop: ' + ((ad.advoorstel || {}).kop || ''), ...((ad.advoorstel || {}).kop2 ? ['Tweede kop: ' + ad.advoorstel.kop2] : []), 'Regel: ' + ((ad.advoorstel || {}).omschrijving || ''), 'Link: ' + ((ad.advoorstel || {}).url || '')].join('\n');
      navigator.clipboard.writeText(t).then(() => melding('Tekst gekopieerd.', 'info'), () => melding('Kopiëren lukte niet; selecteer de tekst zelf.', 'fout'));
    });

    const tf = $('#tekstForm', vak);
    const teller = () => { const c = $('textarea[name=caption]', tf).value; $('#teller', vak).textContent = `${c.length} tekens${c.length > 125 ? ` · hook: "${c.slice(0, 125).split('\n')[0].slice(0, 60)}…"` : ''}`; };
    teller(); $('textarea[name=caption]', tf).oninput = teller;
    tf.onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(tf);
      const caption = String(f.get('caption') || '');
      actie(() => stuur({ actie: 'tekst', itemId: ad.id, titel: f.get('titel'), caption, caption2: String(f.get('caption2') || ''), hook: caption.split('\n')[0].slice(0, 300), advoorstel: { kop: f.get('kop'), kop2: f.get('kop2'), omschrijving: f.get('omschrijving'), url: f.get('url') } }).then(laad), 'Tekst bewaard.');
    };

    const form = $('#adForm', vak);
    if (!form) return;
    const lees = () => { const f = new FormData(form); return { doel: f.get('doel'), knop: f.get('knop'), url: String(f.get('url') || '').trim(), kop: String(f.get('kop') || '').trim(), kop2: String(f.get('kop2') || '').trim(), omschrijving: String(f.get('omschrijving') || '').trim(), dagbudget: Number(f.get('dagbudget')) || 0, start: f.get('start') || '', eind: f.get('eind') || '', landen: f.getAll('land'), advantage: !!f.get('advantage'), leeftijdMin: Number(f.get('leeftijdMin')) || 25, leeftijdMax: Number(f.get('leeftijdMax')) || 65 }; };
    form.oninput = () => {
      const x = lees(); const rr = reken(x);
      const som = $('#som', vak); som.innerHTML = somTekst(x, rr, pl); som.classList.toggle('te', x.dagbudget > pl.dag || (rr && rr.totaal > pl.totaal));
      $$('.leeftijd', vak).forEach((l) => { l.hidden = x.advantage; });
      const u = $('#doelUitleg', vak); if (u) u.textContent = doelUitleg(x.doel);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const x = lees();
      if (!x.landen.length) return melding('Kies minstens één land.', 'fout');
      actie(() => stuur({ actie: 'instellingen', itemId: ad.id, instellingen: x }).then((j) => laad().then(() => j)), (j) => (j.check && j.check.fout ? 'Bewaard, maar: ' + j.check.fout : 'Instellingen bewaard.'));
    };
  }
  // Wat het doel betekent; Meta leert per set pas goed bij zo'n 50 resultaten per week.
  function doelUitleg(doel) {
    return ({
      verkeer: 'Verkeer: Meta zoekt mensen die klikken. Goed om te beginnen zonder pixel; zegt nog niets over wie zich aanmeldt of koopt.',
      bereik: 'Bereik: zoveel mogelijk mensen één keer laten zien. Voor bekendheid, niet voor aanmeldingen.',
      aanmeldingen: 'Aanmeldingen: Meta zoekt mensen die zich aanmelden (pixel-gebeurtenis CompleteRegistration op je bedankpagina). Meestal de beste keuze: een masterclass of weggever, en daarna verkopen.',
      aankopen: 'Aankopen: alleen als er zo\'n 50 aankopen per week uit deze set kunnen komen. Verkoop je iets duurs aan mensen die je nog niet kennen, kies dan aanmeldingen: Meta krijgt anders te weinig signaal om van te leren.',
    })[doel] || '';
  }
  function somTekst(i, r, pl) {
    if (!r) return 'Kies een einddatum na de start om het totaal te zien.';
    const te = i.dagbudget > pl.dag ? `Boven het plafond van ${eur(pl.dag, 0)} per dag.` : r.totaal > pl.totaal ? `Boven het plafond van ${eur(pl.totaal, 0)} totaal.` : '';
    return `${r.dagen} dagen × ${eur(i.dagbudget, 0)} = <b>maximaal ${eur(r.totaal)}</b>. ${te || `Plafond ${eur(pl.dag, 0)}/dag en ${eur(pl.totaal, 0)} totaal.`}`;
  }
  function actie(doe, klaarTekst, bezigTekst) {
    $$('#detail button').forEach((b) => { b.disabled = true; });
    melding(bezigTekst || 'Bezig…', 'bezig');
    return doe().then((j) => { melding(typeof klaarTekst === 'function' ? klaarTekst(j || {}) : klaarTekst, 'info'); staat = null; teken(); })
      .catch((e) => { melding(e.message, 'fout'); teken(); });
  }
  function opnieuw(ad, wens) {
    melding('Terug naar je Claude-routine…', 'bezig');
    return stuur({ actie: 'opnieuw', itemId: ad.id, wens }).then(laad).then(() => { staat = null; melding('Staat in de wachtrij. Binnen een paar minuten is de nieuwe versie er.', 'info'); teken(); })
      .catch((e) => { melding(e.message, 'fout'); laad().then(teken); });
  }
  function verwijderAd(ad) {
    if (!window.confirm('Deze advertentie verwijderen? Tekst en beelden gaan weg.')) return;
    actie(() => stuur({ actie: 'verwijder', itemId: ad.id }).then(() => { gekozen = null; return laad(); }), 'Verwijderd.');
  }

  // ————— De ontwerper —————
  function veldenHtml() {
    const o = staat.o, sj = S.SJ[o.sjabloon] || S.SJ.woord, v = Object.assign(S.standaardVelden(o.sjabloon), o.velden || {});
    const pos = String((o.pos && o.pos[fmt]) || '50% 40%').split(' ').map((x) => parseFloat(x));
    const zoom = Number(o.zoom && o.zoom[fmt]) || 1;
    const ky = S.kopY(o, fmt === '9x16', 330, 112);
    const toegestaan = (H.sjablonen && H.sjablonen.length ? H.sjablonen : Object.keys(S.SJ)).filter((k) => S.SJ[k]);
    if (!toegestaan.includes(o.sjabloon)) toegestaan.unshift(o.sjabloon);
    return `<label>Sjabloon<select data-x="sjabloon">${toegestaan.map((k) => `<option value="${k}"${k === o.sjabloon ? ' selected' : ''}>${esc(S.SJ[k].naam)}</option>`).join('')}</select><small>${esc(sj.uitleg)}</small></label>
      <div><span class="lab">Foto</span><div class="fotos klein">${data.beeldbank.map((f) => `<button type="button" class="foto${f.pad === o.foto ? ' aan' : ''}" data-foto="${esc(f.pad)}" title="${esc(f.beschrijving)}"><img src="${esc(url(f.pad))}" alt="" loading="lazy"></button>`).join('')}
        <label class="foto plus" title="Foto toevoegen"><input type="file" accept="image/jpeg,image/png" class="upload" hidden><span>+</span></label></div></div>
      <div class="schuiven"><label>Uitsnede links ↔ rechts<input type="range" min="0" max="100" data-x="px" value="${pos[0] || 50}"></label>
      <label>Uitsnede boven ↕ onder<input type="range" min="0" max="100" data-x="py" value="${isNaN(pos[1]) ? 40 : pos[1]}"></label>
      <label>Inzoomen<input type="range" min="100" max="180" data-x="zoom" value="${Math.round(zoom * 100)}"></label>
      ${['bon', 'labels', 'notitie'].includes(o.sjabloon) ? `<label>Kop hoger ↕ lager<input type="range" min="60" max="${fmt === '9x16' ? 900 : 500}" data-x="kopY" value="${ky}"></label>` : ''}
      <small class="leeg">De uitsnede geldt voor ${fmt === '4x5' ? '4:5' : '9:16'}; schakel bovenaan om de andere te zetten.</small></div>
      ${sj.velden.map((f) => `<label>${esc(f[1])}${f[2] === 'regel' ? `<input data-v="${f[0]}" value="${esc(v[f[0]])}">` : `<textarea data-v="${f[0]}" rows="${f[2] === 'lijst' ? Math.min(8, S.regels(v[f[0]]).length + 1) : 3}">${esc(v[f[0]])}</textarea>`}</label>`).join('')}`;
  }
  function koppelOntwerper(vak, ad) {
    const velden = $('#velden', vak), frame = $('#frame', vak);
    let t = null;
    const tekenVb = () => { clearTimeout(t); t = setTimeout(() => S.zetVoorbeeld(frame, staat.o, fmt, H, url), 120); };
    const vuil = () => { staat.vuil = true; $('#vuil', vak).textContent = 'Niet bewaard'; const k = $('#akkoord', vak); if (k) { k.disabled = true; k.title = 'Eerst het ontwerp bewaren'; } };
    const tekenVelden = () => {
      velden.innerHTML = veldenHtml();
      $$('.schakel a', vak).forEach((a) => a.classList.toggle('aan', a.dataset.fmt === fmt));
      $$('[data-v]', velden).forEach((i) => { i.oninput = () => { staat.o.velden = Object.assign(S.standaardVelden(staat.o.sjabloon), staat.o.velden || {}, { [i.dataset.v]: i.value }); vuil(); tekenVb(); }; });
      $$('[data-foto]', velden).forEach((k) => { k.onclick = () => { staat.o.foto = k.dataset.foto; const f = data.beeldbank.find((x) => x.pad === k.dataset.foto); if (f && f.pos) staat.o.pos = Object.assign({}, f.pos); vuil(); tekenVelden(); tekenVb(); }; });
      $$('.upload', velden).forEach((u) => { u.onchange = () => { const f = u.files[0]; if (f) uploadFoto(f).then(() => tekenVelden()); }; });
      const sj = $('[data-x=sjabloon]', velden);
      sj.onchange = () => { staat.o.sjabloon = sj.value; staat.o.velden = Object.assign(S.standaardVelden(sj.value), staat.o.velden || {}); vuil(); tekenVelden(); tekenVb(); };
      const schuif = () => {
        staat.o.pos = Object.assign({}, staat.o.pos, { [fmt]: `${$('[data-x=px]', velden).value}% ${$('[data-x=py]', velden).value}%` });
        staat.o.zoom = Object.assign({}, staat.o.zoom, { [fmt]: Number($('[data-x=zoom]', velden).value) / 100 });
        const ky = $('[data-x=kopY]', velden); if (ky) staat.o.kopY = Object.assign({}, staat.o.kopY, { [fmt]: Number(ky.value) });
        vuil(); tekenVb();
      };
      $$('input[type=range]', velden).forEach((r) => { r.oninput = schuif; });
    };
    $$('.schakel a', vak).forEach((a) => { a.onclick = () => { fmt = a.dataset.fmt; tekenVelden(); tekenVb(); }; });
    tekenVelden(); S.zetVoorbeeld(frame, staat.o, fmt, H, url);
    window.addEventListener('resize', tekenVb, { once: true });
    if (staat.vuil) $('#vuil', vak).textContent = 'Niet bewaard';
    const b = $('#bewaar', vak);
    if (b) b.onclick = () => {
      b.disabled = true;
      melding('Beelden tekenen (4:5 en 9:16)…', 'bezig');
      S.vastleggen(staat.o, H, url)
        .then((beelden) => { melding('Beelden opslaan…', 'bezig'); return stuur({ actie: 'ontwerp', itemId: ad.id, ontwerp: staat.o, beelden }); })
        .then(laad).then(() => { staat = null; melding('Ontwerp en beelden bewaard.', 'info'); teken(); })
        .catch((e) => { melding(e.message, 'fout'); b.disabled = false; });
    };
  }

  // ————— Cijfers —————
  const STAND = {
    ACTIVE: ['Loopt', 'live'], INGEPLAND: ['Ingepland', 'klaar'], PAUSED: ['Gepauzeerd', 'pauze'], CAMPAIGN_PAUSED: ['Gepauzeerd', 'pauze'], ADSET_PAUSED: ['Gepauzeerd', 'pauze'],
    PENDING_REVIEW: ['In review', 'concept'], IN_PROCESS: ['Wordt verwerkt', 'concept'], WITH_ISSUES: ['Probleem', 'fout'], DISAPPROVED: ['Afgekeurd', 'fout'], PREAPPROVED: ['Goedgekeurd', 'klaar'],
    PENDING_BILLING_INFO: ['Betaalgegevens nodig', 'fout'], ARCHIVED: ['Gearchiveerd', 'pauze'],
  };
  const DOEL_NL = { OUTCOME_TRAFFIC: 'verkeer', OUTCOME_AWARENESS: 'bereik', OUTCOME_LEADS: 'aanmeldingen', OUTCOME_SALES: 'aankopen', OUTCOME_ENGAGEMENT: 'interactie' };
  const standChip = (s, blok) => {
    if (blok) return `<span class="stand fout" title="Staat zelf aan, maar draait niet omdat de ${esc(blok)} uit staat">Aan, maar ${esc(blok)} uit</span>`;
    const x = STAND[s] || [String(s || '').toLowerCase().replace(/_/g, ' '), 'pauze']; return `<span class="stand ${x[1]}">${esc(x[0])}</span>`;
  };
  // Staat iets zelf aan, maar houdt een niveau erboven het tegen? Dan levert het niets op. Geeft 'campagne' of 'set' terug.
  const blokkade = (x, s, c) => (!x || !x.aan ? null : c && !c.aan ? 'campagne' : s && !s.aan ? 'set' : null);
  function blokkadeBalk() {
    const g = [];
    ((cijferData && cijferData.campagnes) || []).forEach((c) => c.sets.forEach((s) => { const ads = s.ads.filter((a) => blokkade(a, s, c)); if (ads.length) g.push({ c, s, n: ads.length, door: blokkade(ads[0], s, c) }); }));
    if (!g.length) return '';
    const n = g.reduce((t, x) => t + x.n, 0);
    return `<div class="kaart blok"><b>${n} ${n === 1 ? 'advertentie staat' : 'advertenties staan'} aan, maar ${n === 1 ? 'draait' : 'draaien'} niet.</b><ul>${g.map((x) => `<li>${x.n}× in ${x.door === 'campagne' ? `campagne <b>${esc(x.c.naam)}</b>: de campagne staat uit` : `set <b>${esc(x.s.naam)}</b>: de set staat uit`}</li>`).join('')}</ul><small>Zet het onderdeel aan met de schakelaar hieronder.</small></div>`;
  }
  // Aan/uit-schakelaar zoals in Meta Ads Manager. Eerste klik vraagt "zeker?", de tweede voert uit.
  const schakelaar = (niveau, x) => (data.kan && data.kan.schrijven ? `<button type="button" class="schakel-knop${x.aan ? ' aan' : ''}" data-schakel="${niveau}" data-id="${esc(x.id)}" data-aan="${x.aan ? '1' : '0'}" title="${x.aan ? 'Uitzetten' : 'Aanzetten'}" aria-pressed="${x.aan ? 'true' : 'false'}"><i></i></button>` : '');
  // Campagnes waar iets aan staat klappen vanzelf open; wat je zelf open- of dichtklikt, blijft zo.
  const isOpen = (id) => {
    if (id in open) return open[id];
    const c = ((cijferData && cijferData.campagnes) || []).find((x) => x.id === id);
    return !!c && (c.aan || c.sets.some((s) => s.aan || s.ads.some((a) => a.aan)));
  };
  const resVan = (x, doel) => (!x ? 0 : doel === 'OUTCOME_SALES' ? x.aankopen || 0 : doel === 'OUTCOME_LEADS' ? x.leads || 0 : 0);
  const alleMetaAds = () => { const u = []; ((cijferData && cijferData.campagnes) || []).forEach((c) => c.sets.forEach((s) => s.ads.forEach((a) => u.push({ ...a, set: s, campagne: c })))); return u; };
  const stat = (num, wat, onder) => `<div class="stat"><div class="num">${num}</div><div class="wat">${wat}</div>${onder ? `<div class="bron">${esc(onder)}</div>` : ''}</div>`;
  const periodeKiezer = () => `<div class="balk"><select id="periode" aria-label="Periode">${[['7', 'Laatste 7 dagen'], ['14', 'Laatste 14 dagen'], ['30', 'Laatste 30 dagen'], ['90', 'Laatste 90 dagen'], ['365', 'Laatste jaar'], ['max', 'Alles']].map((p) => `<option value="${p[0]}"${p[0] === periode ? ' selected' : ''}>${p[1]}</option>`).join('')}</select><button class="knop klein rand" id="vers" type="button">Ververs</button></div>`;
  function koppelBalk(el) {
    $('#periode', el).onchange = (e) => { periode = e.target.value; cijferData = null; teken(); };
    $('#vers', el).onclick = () => { el.style.opacity = 0.5; haal(`/api/ads?cijfers=1&periode=${periode}&vers=1`).then((d) => { cijferData = d; el.style.opacity = 1; teken(); }).catch((e) => { el.style.opacity = 1; melding(e.message, 'fout'); }); };
  }
  function cijfers(el) {
    const t = cijferData.totaal;
    let h = periodeKiezer();
    if ((cijferData.fouten || []).length) h += `<p class="leeg">Niet alles kwam door: ${esc(cijferData.fouten.join(' · '))}</p>`;
    if (!t) { el.innerHTML = h + '<div class="kaart"><p>In deze periode is er geen advertentie gelopen.</p></div>'; koppelBalk(el); return; }
    const res = t.aankopen ? ['aankopen', 'aankoop', t.aankopen] : t.leads ? ['aanmeldingen', 'aanmelding', t.leads] : t.bezoeken ? ['paginabezoeken', 'bezoek', t.bezoeken] : null;
    h += `<div class="stats">${stat(eur(t.uitgegeven), 'uitgegeven', cijferData.account.naam || '')}${stat(n0(t.bereik), 'mensen bereikt', `${n0(t.impressies)} vertoningen · ${String(t.frequentie).replace('.', ',')}× per persoon`)}${stat(n0(t.klikken), 'linkklikken', `CTR ${pct(t.ctr)} · ${eur(t.cpc)} per klik`)}${stat(res ? n0(res[2]) : eur(t.cpm), res ? res[0] : 'per 1.000 vertoningen', res ? `${eur(t.uitgegeven / (res[2] || 1))} per ${res[1]}` : 'CPM')}</div>`;
    h += `<div class="twee"><div class="kaart"><h4>Per ${esc(cijferData.stap || 'dag')}</h4>${grafiek(cijferData.perDag)}</div><div class="kaart"><h4>Wat valt op</h4>${opvallend()}</div></div>`;
    h += blokkadeBalk();
    h += `<div class="kaart"><h4>Campagnes, sets en advertenties</h4>${boom()}</div>`;
    if ((cijferData.plaatsingen || []).length) { const p = cijferData.plaatsingen, tot = p.reduce((s, x) => s + x.uitgegeven, 0) || 1; h += `<div class="kaart"><h4>Waar de advertenties te zien waren</h4><div class="plaats">${p.slice(0, 10).map((x) => `<div class="rij"><span class="naam">${esc(x.platform)} <small>${esc(x.plek)}</small></span><span class="meter"><i style="width:${Math.round(x.uitgegeven / tot * 100)}%"></i></span><span class="getal">${eur(x.uitgegeven)}</span><span class="getal klein">${n0(x.klikken)} kl · ${pct(x.ctr)}</span></div>`).join('')}</div></div>`; }
    h += `<p class="leeg">Opgehaald ${esc(kortTijd(cijferData.opgehaald))} · Meta werkt cijfers tot 3 dagen terug nog bij · Geen uitsplitsing naar leeftijd, geslacht of regio.</p>`;
    el.innerHTML = h;
    koppelBalk(el);
    $$('[data-open]', el).forEach((r) => { r.onclick = () => { open[r.dataset.open] = !isOpen(r.dataset.open); cijfers(el); }; });
    $$('[data-schakel]', el).forEach((b) => { b.onclick = (e) => {
      e.stopPropagation();
      const aan = b.dataset.aan !== '1';
      if (b.dataset.zeker !== '1') {
        $$('[data-schakel][data-zeker="1"]', el).forEach((o) => { o.dataset.zeker = ''; o.classList.remove('vraag'); });
        b.dataset.zeker = '1'; b.classList.add('vraag');
        melding(aan ? 'Klik nog een keer om aan te zetten. Dit kost geld zodra campagne, set en advertentie alle drie aan staan.' : 'Klik nog een keer om uit te zetten.', 'info');
        return;
      }
      b.disabled = true;
      stuur({ actie: 'schakel', niveau: b.dataset.schakel, id: b.dataset.id, aan })
        .then((j) => Promise.all([laad(), haal(`/api/ads?cijfers=1&periode=${periode}&vers=1`).then((d) => { cijferData = d; })]).then(() => { melding(j.gedaan + '.', 'info'); cijfers(el); }))
        .catch((err) => { melding(err.message, 'fout'); b.disabled = false; b.dataset.zeker = ''; b.classList.remove('vraag'); });
    }; });
  }
  const open = {};
  function grafiek(dagen) {
    if (!dagen || !dagen.length) return '<p class="leeg">Geen dagcijfers.</p>';
    const W = 640, Hh = 190, L = 6, B = 26, top = 12;
    const maxU = Math.max(...dagen.map((d) => d.uitgegeven), 1), maxK = Math.max(...dagen.map((d) => d.klikken), 1);
    const bw = (W - L * 2) / dagen.length;
    const y = (v, m) => top + (Hh - B - top) * (1 - v / m);
    let s = `<svg viewBox="0 0 ${W} ${Hh}" class="grafiek" role="img" aria-label="Uitgaven en klikken">`;
    dagen.forEach((d, i) => { s += `<rect x="${L + i * bw + bw * 0.15}" y="${y(d.uitgegeven, maxU)}" width="${Math.max(1, bw * 0.7)}" height="${Math.max(0, Hh - B - y(d.uitgegeven, maxU))}" rx="2" class="balkje"><title>${kortDag(d.datum)}: ${eur(d.uitgegeven)} · ${d.klikken} klikken</title></rect>`; });
    s += `<polyline class="lijn" points="${dagen.map((d, i) => `${L + i * bw + bw / 2},${y(d.klikken, maxK)}`).join(' ')}"/>`;
    const stap = Math.ceil(dagen.length / 6);
    dagen.forEach((d, i) => { if (i % stap === 0) s += `<text x="${L + i * bw + bw / 2}" y="${Hh - 8}" text-anchor="middle">${new Date(d.datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</text>`; });
    return s + `</svg><div class="legenda"><span><i class="l1"></i>uitgegeven (hoogste ${eur(maxU)})</span><span><i class="l2"></i>linkklikken (hoogste ${maxK})</span></div>`;
  }
  // Vaste vuistregels, geen oordeel van een model. Elke regel zegt waarom hij afgaat.
  function opvallend() {
    const r = [];
    const alle = alleMetaAds(), ads = alle.filter((a) => a.cijfers), genoeg = ads.filter((a) => a.cijfers.impressies >= 1000);
    alle.filter((a) => ['WITH_ISSUES', 'DISAPPROVED', 'PENDING_BILLING_INFO'].includes(a.stand)).forEach((a) => r.push(['fout', `<b>${esc(a.naam)}</b>: ${STAND[a.stand][0].toLowerCase()} bij Meta. Kijk in Meta Ads Manager wat er mis is.`]));
    ads.filter((a) => a.cijfers.frequentie >= 3 && a.stand === 'ACTIVE').forEach((a) => r.push(['let', `<b>${esc(a.naam)}</b> wordt gemiddeld ${String(a.cijfers.frequentie).replace('.', ',')}× per persoon gezien. Vanaf 3× zakt de aandacht meestal: tijd voor een nieuwe variant.`]));
    if (genoeg.length >= 2) { const s = genoeg.slice().sort((a, b) => b.cijfers.ctr - a.cijfers.ctr); const best = s[0], slecht = s[s.length - 1]; if (slecht.cijfers.ctr > 0 && best.cijfers.ctr >= slecht.cijfers.ctr * 1.5) r.push(['goed', `<b>${esc(best.naam)}</b> haalt ${pct(best.cijfers.ctr)} CTR, <b>${esc(slecht.naam)}</b> ${pct(slecht.cijfers.ctr)}. Overweeg het budget naar de eerste te schuiven.`]); }
    const t = cijferData.totaal;
    if (t && t.impressies >= 2000 && t.ctr < 0.8) r.push(['let', `De CTR over alles is ${pct(t.ctr)}. Vuistregel is ± 1%: beeld of eerste zin trekt nog te weinig.`]);
    if (t && t.impressies >= 2000 && t.cpm > 15) r.push(['let', `${eur(t.cpm)} per 1.000 vertoningen is aan de dure kant. Een bredere doelgroep (Advantage+) maakt het vaak goedkoper.`]);
    const nu = Date.now();
    alle.filter((a) => a.stand === 'ACTIVE' && a.set.eind && new Date(a.set.eind).getTime() - nu < 2 * 86400000 && new Date(a.set.eind).getTime() > nu).forEach((a) => r.push(['info', `<b>${esc(a.naam)}</b> stopt ${esc(kortTijd(a.set.eind))}.`]));
    // Leerfase: Meta leert per set pas goed bij zo'n 50 resultaten per week.
    const sets = []; (cijferData.campagnes || []).forEach((c) => c.sets.forEach((s) => sets.push({ ...s, doel: c.doel })));
    const dagenSinds = (iso) => (iso ? (nu - new Date(iso).getTime()) / 86400000 : 999);
    const vensterDagen = periode === 'max' ? null : Number(periode);
    sets.filter((s) => s.stand === 'ACTIVE' && ['OUTCOME_LEADS', 'OUTCOME_SALES'].includes(s.doel) && s.cijfers && s.cijfers.uitgegeven > 0 && vensterDagen).forEach((s) => {
      const dagen = Math.max(1, Math.min(vensterDagen, dagenSinds(s.start)));
      if (dagen < 4) return;
      const perWeek = Math.round(resVan(s.cijfers, s.doel) / dagen * 7);
      if (perWeek < 50) r.push(['info', `<b>${esc(s.naam)}</b>: ± ${perWeek} ${s.doel === 'OUTCOME_SALES' ? 'aankopen' : 'aanmeldingen'} per week. Meta leert pas goed bij zo'n 50 per week per set.${s.doel === 'OUTCOME_SALES' ? ' Overweeg deze ads op aanmeldingen te laten sturen.' : ' Houd het bij één set met meer ads, niet meer sets.'}`]);
    });
    const klein = sets.filter((s) => s.stand === 'ACTIVE' && s.budget && s.budget.soort === 'dag' && s.budget.bedrag <= 15);
    if (klein.length >= 3) r.push(['let', `Er lopen ${klein.length} sets van € 15 per dag of minder. Zo leert geen enkele set. Bundel ze: pauzeer de losse sets en zet de ads opnieuw klaar, dan komen ze samen in één set per product.`]);
    sets.filter((s) => s.stand === 'ACTIVE' && dagenSinds(s.start) < 4).forEach((s) => r.push(['info', `<b>${esc(s.naam)}</b> loopt pas ${Math.max(0, Math.floor(dagenSinds(s.start)))} ${Math.floor(dagenSinds(s.start)) === 1 ? 'dag' : 'dagen'}. De eerste vier dagen is Meta nog aan het leren: liever niets veranderen.`]));
    // Stopregel: alleen voor producten met een doel per resultaat (merk/producten.json), en pas na vier dagen.
    alle.filter((a) => a.cijfers && dagenSinds(a.set.start) >= 4).forEach((a) => {
      const eigen = data.ads.find((x) => x.meta && x.meta.adId === a.id);
      const prod = eigen && data.producten.find((p) => p.id === eigen.product);
      const doelBedrag = prod && Number(prod.doelPerResultaat);
      if (!doelBedrag) return;
      const res = resVan(a.cijfers, a.campagne.doel), wat = a.campagne.doel === 'OUTCOME_SALES' ? 'aankoop' : 'aanmelding';
      if (!res && a.cijfers.uitgegeven >= doelBedrag * 3) r.push(['let', `<b>${esc(a.naam)}</b>: ${eur(a.cijfers.uitgegeven)} uitgegeven zonder ${wat}, drie keer je doel van ${eur(doelBedrag)}. Overweeg hem te pauzeren.`]);
      else if (res && a.cijfers.uitgegeven / res > doelBedrag * 2) r.push(['let', `<b>${esc(a.naam)}</b> kost ${eur(a.cijfers.uitgegeven / res)} per ${wat}, ruim boven je doel van ${eur(doelBedrag)}.`]);
      else if (res >= 3 && a.cijfers.uitgegeven / res <= doelBedrag) r.push(['goed', `<b>${esc(a.naam)}</b>: ${eur(a.cijfers.uitgegeven / res)} per ${wat}, onder je doel van ${eur(doelBedrag)}. Maak hier varianten van (zelfde idee, andere foto of vorm).`]);
    });
    const laatste = (cijferData.perDag || []).slice(-3);
    if (alle.some((a) => a.stand === 'ACTIVE') && (cijferData.stap || 'dag') === 'dag' && laatste.length === 3 && laatste.every((d) => !d.uitgegeven)) r.push(['fout', 'Er staat een advertentie aan, maar de laatste drie dagen is er niets uitgegeven. Review, betaalmethode of budget checken.']);
    return r.length ? `<ul class="opval">${r.map((x) => `<li class="${x[0]}">${x[1]}</li>`).join('')}</ul>` : '<p class="leeg">Niets wat boven de vuistregels uitkomt.</p>';
  }
  function boom() {
    const c = cijferData.campagnes || [];
    if (!c.length) return '<p class="leeg">Geen campagnes in deze periode.</p>';
    const kol = (x, doel) => { const res = resVan(x, doel), telt = ['OUTCOME_LEADS', 'OUTCOME_SALES'].includes(doel); return x ? `<td>${eur(x.uitgegeven)}</td><td>${n0(x.bereik)}</td><td>${n0(x.klikken)}</td><td>${pct(x.ctr)}</td><td>${eur(x.cpc)}</td><td>${String(x.frequentie || 0).replace('.', ',')}</td><td>${telt ? n0(res) : '–'}</td><td>${telt && res ? eur(x.uitgegeven / res) : '–'}</td>` : '<td colspan="8" class="nul">nog geen cijfers</td>'; };
    const bud = (b) => (b ? `${eur(b.bedrag, 0)}${b.soort === 'dag' ? '/dag' : ' totaal'}` : '');
    let h = '<p class="leeg"><b>Campagne</b> = het doel · <b>Set</b> = budget, doelgroep en looptijd · <b>Advertentie</b> = beeld en tekst. Een advertentie draait alleen als alle drie aan staan.</p><div class="tabel-vak"><table class="tabel"><thead><tr><th>Naam</th><th>Stand</th><th>Uitgegeven</th><th>Bereik</th><th>Klikken</th><th>CTR</th><th>CPC</th><th>Freq.</th><th>Result.</th><th>Per result.</th></tr></thead><tbody>';
    c.forEach((cm) => {
      h += `<tr class="niv0" data-open="${cm.id}"><td><span class="pijl">${isOpen(cm.id) ? '▾' : '▸'}</span><b>${esc(cm.naam)}</b><small>${esc(DOEL_NL[cm.doel] || '')}${cm.budget ? ' · ' + bud(cm.budget) : ''}</small></td><td>${schakelaar('campagne', cm)}${standChip(cm.stand)}</td>${kol(cm.cijfers, cm.doel)}</tr>`;
      if (!isOpen(cm.id)) return;
      cm.sets.forEach((s) => {
        h += `<tr class="niv1"><td>${esc(s.naam)}<small>${bud(s.budget)}${s.start ? ' · ' + esc(kortDag(s.start)) : ''}${s.eind ? ' t/m ' + esc(kortDag(s.eind)) : ''}</small></td><td>${schakelaar('set', s)}${standChip(s.stand, blokkade(s, null, cm))}</td>${kol(s.cijfers, cm.doel)}</tr>`;
        s.ads.forEach((a) => { h += `<tr class="niv2"><td><span class="mini">${a.beeld ? `<img src="${esc(a.beeld)}" alt="" loading="lazy">` : ''}</span><span>${esc(a.naam)}</span></td><td>${schakelaar('ad', a)}${standChip(a.stand, blokkade(a, s, cm))}</td>${kol(a.cijfers, cm.doel)}</tr>`; });
      });
    });
    return h + '</tbody></table></div><p class="leeg">Klik op een campagne om de sets en advertenties te zien.</p>';
  }

  // ————— Planning —————
  function planning(el) {
    const rijen = [], gekoppeld = new Set();
    data.ads.forEach((ad) => { const m = ad.meta || {}, i = m.instellingen; if (!i || !i.eind) return; if (m.adsetId) gekoppeld.add(m.adsetId); rijen.push({ naam: ad.titel || ad.id, start: i.start || ad.gemaakt, eind: i.eind, dag: i.dagbudget, stand: standVan(ad), id: ad.id }); });
    ((cijferData && cijferData.campagnes) || []).forEach((c) => c.sets.forEach((s) => { if (gekoppeld.has(s.id) || !s.eind || !['ACTIVE', 'INGEPLAND', 'PAUSED'].includes(s.stand)) return; rijen.push({ naam: s.naam, start: s.start, eind: s.eind, dag: s.budget && s.budget.soort === 'dag' ? s.budget.bedrag : null, stand: s.stand === 'PAUSED' ? 'meta' : 'live' }); }));
    const nu = new Date(); nu.setHours(0, 0, 0, 0);
    const van = new Date(nu); van.setDate(van.getDate() - 7);
    const tot = new Date(nu); tot.setDate(tot.getDate() + 42);
    const span = tot - van;
    const zicht = rijen.filter((r) => new Date(r.eind) >= van && new Date(r.start || nu) <= tot).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const grens = new Date(nu); grens.setDate(grens.getDate() + 30);
    const gepland = zicht.filter((r) => r.dag && ['live', 'meta'].includes(r.stand)).reduce((s, r) => s + Math.max(0, Math.ceil((Math.min(new Date(r.eind).getTime(), grens.getTime()) - Math.max(new Date(r.start || Date.now()).getTime(), Date.now())) / 86400000)) * r.dag, 0);
    const NM = { concept: 'Concept', akkoord: 'Akkoord, nog niet in Meta', meta: 'In Meta, gepauzeerd', live: 'Loopt of ingepland', bezig: 'Concept' };
    let h = periodeKiezer() + `<div class="stats drie">${stat(String(zicht.filter((r) => r.stand === 'live').length), 'loopt of ingepland', '')}${stat(String(zicht.filter((r) => r.stand !== 'live').length), 'in voorbereiding', '')}${stat(eur(gepland, 0), 'maximaal budget komende 30 dagen', 'alles wat aan staat of in Meta klaarstaat')}</div>`;
    if (!zicht.length) { el.innerHTML = h + '<div class="kaart"><p class="leeg">Nog niets gepland. Geef een advertentie een start en eind onder Maken.</p></div>'; koppelBalk(el); return; }
    h += '<div class="tijdlijn"><div class="tl-as">';
    for (let d = new Date(van); d <= tot; d.setDate(d.getDate() + 7)) h += `<span style="left:${(d - van) / span * 100}%">${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>`;
    h += '</div>';
    zicht.forEach((r) => { const a = Math.max(0, (new Date(r.start || nu) - van) / span), b = Math.min(1, (new Date(r.eind) - van) / span); h += `<div class="tl-rij"><div class="tl-naam">${r.id ? `<a href="#/maken/${esc(r.id)}">${esc(r.naam)}</a>` : `${esc(r.naam)} <small class="leeg">(Meta)</small>`}</div><div class="tl-baan"><div class="tl-balk ${r.stand}" style="left:${a * 100}%;width:${Math.max(1.5, (b - a) * 100)}%">${r.dag ? eur(r.dag, 0) + '/dag' : ''}</div><div class="tl-nu" style="left:${(Date.now() - van) / span * 100}%"></div></div></div>`; });
    h += `</div><div class="legenda">${['concept', 'akkoord', 'meta', 'live'].map((k) => `<span><i class="tl-balk ${k}"></i>${NM[k]}</span>`).join('')}</div>`;
    el.innerHTML = h;
    koppelBalk(el);
  }

  start();
})();
