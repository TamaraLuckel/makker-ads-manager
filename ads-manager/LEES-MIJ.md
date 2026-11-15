# Je eigen Ads Manager

Een eigen plek om Meta-advertenties te maken, klaar te zetten en te volgen. Jij geeft de vonk, je
Claude-routine schrijft een eerste versie per hoek, jij wisselt foto, tekst, uitsnede en vorm tot het
klopt. Elke ad komt in twee formaten: 4:5 voor de feed, 9:16 voor stories en reels. De ads staan in
je eigen GitHub-kluis, naast je AI-team.

## Starten (± 30 minuten, inclusief Meta en je HQ)

1. Pak de zip uit **in je map `mijn-ai-team`**. Er komt een map `ads-manager` bij.
2. Open de Terminal, ga naar die map (`cd ` typen en de map erin slepen) en typ `claude`.
3. Zeg: **start**. Claude Code loodst je erdoorheen: kluis checken, foto's, huisstijl, producten en je
   rekensom, even proberen, live zetten, de routine die schrijft, je Meta Ads Manager koppelen, en een
   knop naar de Ads Manager in je HQ.

Hoe de app adverteert: per product één set met al je ads erin en één budget (Meta leert per set, dus
liever één set van € 30 dan drie van € 10), twee teksten en twee koppen per ad, sturen op aanmeldingen,
en onder Cijfers een waarschuwing als een ad ver boven je doel per aanmelding zit.

Wat je nodig hebt: je AI-team met de kluis op GitHub aan, je betaalde Claude-abonnement, een
Vercel-account, en de map met je eigen foto's. Geen API-sleutel.

## Eerlijk vooraf: waar staat wat

| Koppeling | Wat gaat erheen | Wie kan erbij | Nee zeggen? |
|---|---|---|---|
| **GitHub** (je kluis) | je ads, de beelden en foto's die je in de app toevoegt, in `ads-manager/data/` | jij; de app, met een sleutel die alleen bij deze ene repo kan, maar daarin wel overal mag schrijven; je Claude-routine | nee, hier bewaart de app alles |
| **Vercel** (de app) | de app zelf, je huisstijl en je beeldbankfoto's. Draait in Frankfurt, achter je wachtwoord | jij, met je wachtwoord; Vercel als hostingpartij | nee, hier draait het op |
| **Claude** (je routine) | de routine draait op je eigen Claude-account in de cloud van Anthropic en kan je hele repo lezen én beschrijven: je opdracht, je productfeiten (ook reviews met naam, als je die erin zet), en ook de rest van je team | Anthropic, volgens de voorwaarden van je Claude-abonnement (lees die op anthropic.com) | ja: zonder routine schrijf je de ads zelf |
| **Meta** (optioneel) | wat jij klaarzet: beeld, tekst, link, budget. Voor de cijfers leest de app je hele advertentie-account | de app, met een token dat niet verloopt en je advertentie-account mag lezen en beheren | ja: zonder koppeling download je de beelden |

Wat er mis kan gaan, en wat de app daartegen doet:
- **Geld**: alles komt eerst gepauzeerd in Meta. Live zetten vraagt jouw klik, een einddatum en een
  bevestiging van het bedrag, onder een plafond (standaard € 50 per dag en € 500 per ad). Geen knop in
  de app kan dat plafond verhogen. Het staat wel in je Vercel-instellingen: wie bij je Vercel-account of
  je Meta-token komt, kan eromheen. Bescherm die dus met tweestapsverificatie.
- **Tekst**: de routine schrijft concepten. Ze heeft de opdracht alleen in je ads te schrijven en niets te
  versturen, maar dat is een afspraak in haar instructie, geen slot: technisch kan ze in je hele repo
  schrijven. Wat ze doet zie je terug in je GitHub-geschiedenis, en alles is terug te draaien. Zonder jouw
  akkoord gaat er niets naar Meta, en verander je de tekst na je akkoord, dan vervalt het akkoord.
- **Iets wat niet klopt in een tekst**: prijzen, data en reviews komen alleen uit wat jij in de producten
  zet. Een review gebruiken in een betaalde ad vraagt een aparte ja van die persoon.
- **Een sleutel lekt**: trek hem in (GitHub, Vercel of Meta) en zet een nieuwe. Je ads blijven staan.

Prompt-injectie (een tekst die een AI probeert om te praten) is nooit helemaal uit te sluiten. De
routine leest alleen wat in je eigen repo staat. Plak je tekst van een ander in (een verkooppagina, een
review), dan leest ze die ook; daarom blijft elke ad een concept tot jij akkoord geeft.

## Kosten

Vercel: gratis te proberen; voor zakelijk gebruik vraagt Vercel Pro (± $ 20 per maand). Claude: valt
onder je abonnement (de routine telt mee in je gebruik). GitHub: gratis. Meta: alleen wat je zelf aan
advertenties uitgeeft.

Gemaakt door The Transformation Studio.
