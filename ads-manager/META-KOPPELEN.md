# Meta koppelen (15 minuten, in Meta Business)

Na deze stap zie je onder **Cijfers** en **Planning** je advertenties, en zet je vanuit de app een ad
klaar (gepauzeerd) en live. Zonder koppeling werkt Maken gewoon: je downloadt de beelden.

Claude Code: begeleid dit stap voor stap. De eigenaar doet alles in Meta zelf; tokens tikt ze zelf
in met `! npx vercel env add …`, nooit in de chat.

## 1. Een systeemgebruiker en een token

1. business.facebook.com → Bedrijfsinstellingen → Gebruikers → **Systeemgebruikers** → Toevoegen
   (naam bijvoorbeeld `ads-manager`, rol Medewerker).
2. **Middelen toewijzen**: het advertentie-account (Beheren) en je Facebook-pagina.
3. Apps: heb je nog geen app, maak er een (developers.facebook.com → Mijn apps → Maken → type
   Zakelijk) en voeg het product **Marketing API** toe.
4. Bij de systeemgebruiker: **Token genereren**, kies je app, rechten `ads_management`, `ads_read`,
   `pages_show_list`, `pages_read_engagement`, `business_management`. Verloopt nooit.
5. Bewaar het token in je wachtwoordmanager.

## 2. In Vercel zetten

```
! npx vercel env add META_ADS_TOKEN production       (het token)
! npx vercel env add META_AD_ACCOUNT_ID production   (het nummer van je advertentie-account, zonder act_)
```

Optioneel:
- `META_TOKEN`: een apart token met alleen `ads_read`, als je lezen en schrijven gescheiden wilt.
- `META_PAGE_ID`: als je meer dan één pagina hebt.
- `META_IG_USER_ID`: je Instagram-account, zodat ads op Instagram met je eigen account tonen.
- `META_PIXEL_ID`: pas als de Meta-pixel op je site staat; dan kun je sturen op aanmeldingen of aankopen.
  Sturen op aanmeldingen werkt alleen als je bedankpagina de gebeurtenis `CompleteRegistration` stuurt
  (alleen `Lead` is niet genoeg). Test het in Events Manager → Testgebeurtenissen met een eigen
  testaanmelding: je wilt er precies één zien.
- `META_DSA_NAAM`: de naam van je bedrijf zoals Meta die toont bij "betaald door" (verplicht in de EU;
  standaard de naam uit je huisstijl).
- `META_MAX_DAGBUDGET` (standaard 50) en `META_MAX_TOTAAL` (standaard 500): je plafonds in euro's.

Daarna: `npx vercel deploy --prod`.

## 3. Proberen

Open een ad met akkoord, vul onder stap 4 doel, link, budget, start en eind in, bewaar, en klik
**Zet klaar in Meta**. Hij staat dan gepauzeerd in je advertentie-account: kijk hem daar na. Pas als
alles klopt: **Zet live** en bevestig bedrag en einddatum.
