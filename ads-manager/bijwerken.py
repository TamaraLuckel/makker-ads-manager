#!/usr/bin/env python3
"""Werkt een bestaande Ads Manager bij naar deze versie. Alleen de code wordt vervangen.

Gebruik (vanuit deze map, die naast je bestaande ads-manager in mijn-ai-team staat):
  python3 bijwerken.py --proef      laat zien wat er verandert, verandert niets
  python3 bijwerken.py              doet het echt
  --map naam                        je Ads Manager-map, als die niet ads-manager heet

Wat blijft staan: data/ (je ads), merk/ (huisstijl, producten, beeldbank, letters), beeldbank/
(je foto's), .vercel/ (de koppeling met je Vercel-project) en alles wat met .env begint. Je sleutels
en je wachtwoord staan in Vercel en worden niet aangeraakt.
Wat vervangen wordt, gaat eerst naar <map>/.oud-<datum>/, zodat je altijd terug kunt.
Bij producten zonder doelPerResultaat zet het script dat veld op null (de rekensom vul je daarna in).
"""
import datetime
import filecmp
import json
import shutil
import sys
from pathlib import Path

NIEUW = Path(__file__).resolve().parent
NOOIT = {"data", "merk", "beeldbank", ".vercel", "node_modules", ".git"}


def arg(naam):
    if naam in sys.argv:
        i = sys.argv.index(naam)
        return sys.argv[i + 1] if i + 1 < len(sys.argv) else ""
    return None


DOEL = NIEUW.parent / (arg("--map") or "ads-manager")
PROEF = "--proef" in sys.argv


def main():
    if DOEL.resolve() == NIEUW:
        sys.exit("Gestopt: pak de update uit in een eigen map naast je ads-manager, niet eroverheen.")
    if not (DOEL / "api/ads.js").exists() or not (DOEL / "merk").is_dir():
        sys.exit(f"Gestopt: geen bestaande Ads Manager gevonden in {DOEL}. Heet de map anders, geef hem mee: --map <naam>.")

    nieuw, anders, gelijk = [], [], 0
    for bron in sorted(NIEUW.rglob("*")):
        rel = bron.relative_to(NIEUW)
        if bron.is_dir() or rel.parts[0] in NOOIT or bron.name.startswith(".env") or bron.name == ".DS_Store":
            continue
        doel = DOEL / rel
        if not doel.exists():
            nieuw.append(rel)
        elif not filecmp.cmp(bron, doel, shallow=False):
            anders.append(rel)
        else:
            gelijk += 1

    producten = DOEL / "merk/producten.json"
    p = json.loads(producten.read_text())
    lijst = p.get("producten", p) if isinstance(p, dict) else p
    zonder_doel = [x.get("naam", x.get("id", "?")) for x in lijst if isinstance(x, dict) and "doelPerResultaat" not in x]

    print(f"Ads Manager in {DOEL.name}/: {len(anders)} bestanden vernieuwd, {len(nieuw)} nieuw, {gelijk} al gelijk.")
    for r in anders:
        print(f"  vernieuwd: {r}")
    for r in nieuw:
        print(f"  nieuw:     {r}")
    print("Blijft staan: data/, merk/, beeldbank/, .vercel/ en je sleutels in Vercel.")
    if zonder_doel:
        print(f"Doel per aanmelding nog leeg bij: {', '.join(zonder_doel)} (zie BIJWERKEN.md, stap 3).")
    if PROEF:
        print("\nProef: er is niets veranderd.")
        return

    reserve = DOEL / f".oud-{datetime.date.today().isoformat()}"
    for rel in anders:
        (reserve / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(DOEL / rel, reserve / rel)
    for rel in anders + nieuw:
        (DOEL / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(NIEUW / rel, DOEL / rel)
    if zonder_doel:
        for x in lijst:
            if isinstance(x, dict):
                x.setdefault("doelPerResultaat", None)
        producten.write_text(json.dumps(p, indent=2, ensure_ascii=False) + "\n")
    if anders:
        print(f"\nDe oude versies staan in {reserve.relative_to(DOEL.parent)}/.")
    print("Klaar. Volgende stap: BIJWERKEN.md, stap 3.")


if __name__ == "__main__":
    main()
