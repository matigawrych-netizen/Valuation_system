# Egzamin specjalistów (krok d)

Wygenerowano: 2026-09-16T23:13:09.157Z. Projekt i progi: `docs/specjalisci.md` (zapisane przed treningiem).

Egzamin kroczący: trening co roku 15 lutego 2016–2021, ocena decyzji do następnego lutego. Sejf 2023–2025 nietknięty: decyzje egzaminu kończą się w 2021 r., pamięć — na wynikach znanych w dniu treningu.

## Wynik w skrócie

| specjalista | metoda | pamięć | K1 pas 80% | K3 (horyzonty) | K4 (horyzonty) | bramka | K2 | K6 | głos |
|---|---|---|---|---|---|---|---|---|---|
| Reporter | model prosty | 4 lata | PASS | 0/5 PASS | 0/5 PASS | nie dotyczy | FAIL | PASS | tak (waga 33%) |
| Praktyk | model prosty | 8 lat | PASS | 0/5 PASS | 0/5 PASS | nie dotyczy | FAIL | PASS | tak (waga 33%) |
| Weteran | model prosty | cała historia | PASS | 0/5 PASS | 0/5 PASS | nie dotyczy | FAIL | PASS | tak (waga 33%) |
| Tropiciel | drzewa decyzyjne | 4 lata | FAIL | 0/5 PASS | 0/5 PASS | PASS | FAIL | PASS | nie |
| Detektyw | drzewa decyzyjne | 8 lat | FAIL | 0/5 PASS | 0/5 PASS | PASS | FAIL | PASS | nie |
| Archiwista | drzewa decyzyjne | cała historia | FAIL | 0/5 PASS | 0/5 PASS | PASS | FAIL | PASS | nie |
| Radar | sieć neuronowa | 4 lata | FAIL | 0/5 PASS | 0/5 PASS | PASS | FAIL | PASS | nie |
| Sejsmograf | sieć neuronowa | 8 lat | FAIL | 0/5 PASS | 0/5 PASS | PASS | FAIL | PASS | nie |
| Kompas | sieć neuronowa | cała historia | FAIL | 0/5 PASS | 0/5 PASS | PASS | FAIL | PASS | nie |

Głos w konsensusie: zdany K1 na wszystkich horyzontach; drzewa i sieć dodatkowo bramka (nie istotnie gorsze od modelu prostego z tą samą pamięcią).
Specjalista bez głosu pozostaje widoczny w szczegółach z oznaczeniem „nie zdał egzaminu”.

## K1 — czy pas 80% zawiera prawdziwą cenę

Próg: 72%–88% dla każdego horyzontu. Przedział ufności: bootstrap po kwartałach.

| specjalista | 1 r. | 2 r. | 3 r. | 4 r. | 5 r. |
|---|---|---|---|---|---|
| Reporter | 73.2% (69%–77%), n=21476, PASS | 75.0% (73%–77%), n=21340, PASS | 74.9% (72%–77%), n=18271, PASS | 75.7% (74%–77%), n=14928, PASS | 73.7% (72%–75%), n=10217, PASS |
| Praktyk | 72.3% (67%–76%), n=21436, PASS | 74.9% (73%–77%), n=21281, PASS | 74.7% (72%–77%), n=18226, PASS | 75.6% (74%–77%), n=14921, PASS | 73.7% (72%–75%), n=10218, PASS |
| Weteran | 72.3% (67%–76%), n=21436, PASS | 74.9% (73%–77%), n=21281, PASS | 74.7% (72%–77%), n=18226, PASS | 75.6% (74%–77%), n=14921, PASS | 73.7% (72%–75%), n=10218, PASS |
| Tropiciel | 71.1% (67%–75%), n=21476, FAIL | 69.1% (67%–72%), n=21340, FAIL | 62.6% (61%–64%), n=18271, FAIL | 60.4% (57%–65%), n=14928, FAIL | 58.5% (55%–62%), n=10217, FAIL |
| Detektyw | 71.6% (67%–75%), n=21436, FAIL | 69.7% (67%–72%), n=21281, FAIL | 63.2% (62%–65%), n=18226, FAIL | 60.7% (57%–65%), n=14921, FAIL | 58.4% (55%–62%), n=10218, FAIL |
| Archiwista | 71.6% (67%–75%), n=21436, FAIL | 69.9% (67%–72%), n=21281, FAIL | 63.2% (62%–65%), n=18226, FAIL | 60.7% (57%–65%), n=14921, FAIL | 58.4% (55%–62%), n=10218, FAIL |
| Radar | 72.1% (68%–76%), n=21476, PASS | 70.0% (67%–73%), n=21340, FAIL | 59.4% (58%–61%), n=18271, FAIL | 53.4% (49%–58%), n=14928, FAIL | 50.4% (46%–56%), n=10217, FAIL |
| Sejsmograf | 71.5% (67%–75%), n=21436, FAIL | 68.5% (66%–71%), n=21281, FAIL | 62.8% (61%–64%), n=18226, FAIL | 55.6% (51%–61%), n=14921, FAIL | 53.7% (50%–58%), n=10218, FAIL |
| Kompas | 71.4% (67%–75%), n=21436, FAIL | 70.0% (67%–73%), n=21281, FAIL | 62.9% (60%–66%), n=18226, FAIL | 55.1% (52%–58%), n=14921, FAIL | 51.4% (46%–57%), n=10218, FAIL |

Punkty odniesienia (informacyjnie):

| punkt odniesienia | 1 r. | 2 r. | 3 r. | 4 r. | 5 r. |
|---|---|---|---|---|---|
| cena się nie zmieni (4 lata) | 73.5%, n=21476 | 74.1%, n=21340 | 73.3%, n=18271 | 73.6%, n=14928 | 71.8%, n=10217 |
| stała wielokrotność (4 lata) | 73.9%, n=21476 | 74.8%, n=21340 | 74.3%, n=18271 | 74.0%, n=14928 | 72.0%, n=10217 |
| typowy zwrot z pamięci (informacyjnie) (4 lata) | 73.5%, n=21476 | 74.1%, n=21340 | 73.3%, n=18271 | 73.6%, n=14928 | 71.8%, n=10217 |
| cena się nie zmieni (8 lat) | 72.5%, n=21436 | 74.1%, n=21281 | 73.0%, n=18226 | 73.4%, n=14921 | 71.7%, n=10218 |
| stała wielokrotność (8 lat) | 72.9%, n=21436 | 74.8%, n=21281 | 74.1%, n=18226 | 73.8%, n=14921 | 72.0%, n=10218 |
| typowy zwrot z pamięci (informacyjnie) (8 lat) | 72.5%, n=21436 | 74.1%, n=21281 | 73.0%, n=18226 | 73.4%, n=14921 | 71.7%, n=10218 |
| cena się nie zmieni (cała historia) | 72.5%, n=21436 | 74.1%, n=21281 | 73.0%, n=18226 | 73.4%, n=14921 | 71.7%, n=10218 |
| stała wielokrotność (cała historia) | 72.9%, n=21436 | 74.8%, n=21281 | 74.1%, n=18226 | 73.8%, n=14921 | 72.0%, n=10218 |
| typowy zwrot z pamięci (informacyjnie) (cała historia) | 72.5%, n=21436 | 74.1%, n=21281 | 73.0%, n=18226 | 73.4%, n=14921 | 71.7%, n=10218 |

## Wstrzymane głosy

„brak modelu” = za mało danych w pamięci dla tego horyzontu (dane zaczynają się w 2010 r.); „wstrzymał się” = brak kluczowej cechy albo spółka poza 1.–99. centylem danych uczących.

| specjalista | 1 r.: brak modelu / wstrzymał się | 2 r.: brak modelu / wstrzymał się | 3 r.: brak modelu / wstrzymał się | 4 r.: brak modelu / wstrzymał się | 5 r.: brak modelu / wstrzymał się |
|---|---|---|---|---|---|
| Reporter | 0% / 15% | 0% / 16% | 13% / 14% | 28% / 13% | 44% / 11% |
| Praktyk | 0% / 15% | 0% / 16% | 13% / 15% | 28% / 13% | 44% / 11% |
| Weteran | 0% / 15% | 0% / 16% | 13% / 15% | 28% / 13% | 44% / 11% |
| Tropiciel | 0% / 15% | 0% / 16% | 13% / 14% | 28% / 13% | 44% / 11% |
| Detektyw | 0% / 15% | 0% / 16% | 13% / 15% | 28% / 13% | 44% / 11% |
| Archiwista | 0% / 15% | 0% / 16% | 13% / 15% | 28% / 13% | 44% / 11% |
| Radar | 0% / 15% | 0% / 16% | 13% / 14% | 28% / 13% | 44% / 11% |
| Sejsmograf | 0% / 15% | 0% / 16% | 13% / 15% | 28% / 13% | 44% / 11% |
| Kompas | 0% / 15% | 0% / 16% | 13% / 15% | 28% / 13% | 44% / 11% |

## K3 — lepszy od „cena się nie zmieni”

Strata kwantylowa (centyle 10/50/90, logarytm zmiany ceny) na wspólnych obserwacjach; mniej = lepiej. PASS: niższa strata i p < 0.0167 (Diebold-Mariano na średnich kwartalnych, Newey-West). „kw.” = liczba kwartałów. Test odbywa się tylko przy co najmniej 2 nienachodzących na siebie oknach (kwartały ≥ 2 × 4 × horyzont); inaczej „p=—” i brak pomiaru — dla 3–5 lat dane z 2016–2021 zwykle na to nie wystarczają.

| specjalista | 1 r.: strata (odniesienie) · p | 2 r.: strata (odniesienie) · p | 3 r.: strata (odniesienie) · p | 4 r.: strata (odniesienie) · p | 5 r.: strata (odniesienie) · p |
|---|---|---|---|---|---|
| Reporter | 0.260 (0.261) · p=0.738 · kw.=24 | 0.353 (0.359) · p=0.532 · kw.=24 | 0.423 (0.436) · p=— · kw.=20 | 0.496 (0.517) · p=— · kw.=16 | 0.600 (0.633) · p=— · kw.=11 |
| Praktyk | 0.261 (0.262) · p=0.806 · kw.=24 | 0.350 (0.357) · p=0.504 · kw.=24 | 0.422 (0.435) · p=— · kw.=20 | 0.496 (0.517) · p=— · kw.=16 | 0.600 (0.634) · p=— · kw.=11 |
| Weteran | 0.261 (0.262) · p=0.805 · kw.=24 | 0.350 (0.357) · p=0.504 · kw.=24 | 0.422 (0.435) · p=— · kw.=20 | 0.496 (0.517) · p=— · kw.=16 | 0.600 (0.634) · p=— · kw.=11 |
| Tropiciel | 0.259 (0.261) · p=0.674 · kw.=24 | 0.356 (0.359) · p=0.694 · kw.=24 | 0.462 (0.436) · p=— · kw.=20 | 0.573 (0.517) · p=— · kw.=16 | 0.696 (0.633) · p=— · kw.=11 |
| Detektyw | 0.257 (0.262) · p=0.356 · kw.=24 | 0.353 (0.357) · p=0.635 · kw.=24 | 0.457 (0.435) · p=— · kw.=20 | 0.570 (0.517) · p=— · kw.=16 | 0.694 (0.634) · p=— · kw.=11 |
| Archiwista | 0.257 (0.262) · p=0.368 · kw.=24 | 0.353 (0.357) · p=0.607 · kw.=24 | 0.457 (0.435) · p=— · kw.=20 | 0.570 (0.517) · p=— · kw.=16 | 0.694 (0.634) · p=— · kw.=11 |
| Radar | 0.258 (0.261) · p=0.588 · kw.=24 | 0.360 (0.359) · p=0.872 · kw.=24 | 0.490 (0.436) · p=— · kw.=20 | 0.638 (0.517) · p=— · kw.=16 | 0.784 (0.633) · p=— · kw.=11 |
| Sejsmograf | 0.259 (0.262) · p=0.544 · kw.=24 | 0.366 (0.357) · p=0.849 · kw.=24 | 0.474 (0.435) · p=— · kw.=20 | 0.617 (0.517) · p=— · kw.=16 | 0.769 (0.634) · p=— · kw.=11 |
| Kompas | 0.258 (0.262) · p=0.436 · kw.=24 | 0.358 (0.357) · p=0.862 · kw.=24 | 0.475 (0.435) · p=— · kw.=20 | 0.613 (0.517) · p=— · kw.=16 | 0.784 (0.634) · p=— · kw.=11 |

## K4 — lepszy od „stała wielokrotność”

Punkt odniesienia: wzrost przychodów jak w modelu prostym z tą samą pamięcią, wycena bez zmian. PASS: niższa strata i p < 0.0167.

| specjalista | 1 r.: strata (odniesienie) · p | 2 r.: strata (odniesienie) · p | 3 r.: strata (odniesienie) · p | 4 r.: strata (odniesienie) · p | 5 r.: strata (odniesienie) · p |
|---|---|---|---|---|---|
| Reporter | 0.260 (0.256) · p=0.131 · kw.=24 | 0.353 (0.348) · p=0.517 · kw.=24 | 0.423 (0.422) · p=— · kw.=20 | 0.496 (0.507) · p=— · kw.=16 | 0.600 (0.617) · p=— · kw.=11 |
| Praktyk | 0.261 (0.258) · p=0.231 · kw.=24 | 0.350 (0.345) · p=0.538 · kw.=24 | 0.422 (0.422) · p=— · kw.=20 | 0.496 (0.509) · p=— · kw.=16 | 0.600 (0.618) · p=— · kw.=11 |
| Weteran | 0.261 (0.258) · p=0.234 · kw.=24 | 0.350 (0.345) · p=0.538 · kw.=24 | 0.422 (0.422) · p=— · kw.=20 | 0.496 (0.509) · p=— · kw.=16 | 0.600 (0.618) · p=— · kw.=11 |
| Tropiciel | 0.259 (0.256) · p=0.549 · kw.=24 | 0.356 (0.348) · p=0.261 · kw.=24 | 0.462 (0.422) · p=— · kw.=20 | 0.573 (0.507) · p=— · kw.=16 | 0.696 (0.617) · p=— · kw.=11 |
| Detektyw | 0.257 (0.258) · p=0.619 · kw.=24 | 0.353 (0.345) · p=0.278 · kw.=24 | 0.457 (0.422) · p=— · kw.=20 | 0.570 (0.509) · p=— · kw.=16 | 0.694 (0.618) · p=— · kw.=11 |
| Archiwista | 0.257 (0.258) · p=0.656 · kw.=24 | 0.353 (0.345) · p=0.271 · kw.=24 | 0.457 (0.422) · p=— · kw.=20 | 0.570 (0.509) · p=— · kw.=16 | 0.694 (0.618) · p=— · kw.=11 |
| Radar | 0.258 (0.256) · p=0.693 · kw.=24 | 0.360 (0.348) · p=0.101 · kw.=24 | 0.490 (0.422) · p=— · kw.=20 | 0.638 (0.507) · p=— · kw.=16 | 0.784 (0.617) · p=— · kw.=11 |
| Sejsmograf | 0.259 (0.258) · p=0.998 · kw.=24 | 0.366 (0.345) · p=0.091 · kw.=24 | 0.474 (0.422) · p=— · kw.=20 | 0.617 (0.509) · p=— · kw.=16 | 0.769 (0.618) · p=— · kw.=11 |
| Kompas | 0.258 (0.258) · p=0.887 · kw.=24 | 0.358 (0.345) · p=0.246 · kw.=24 | 0.475 (0.422) · p=— · kw.=20 | 0.613 (0.509) · p=— · kw.=16 | 0.784 (0.618) · p=— · kw.=11 |

## Informacyjnie — typowy zwrot z pamięci

Mediana = typowa zmiana ceny w pamięci specjalisty, bez patrzenia na spółkę. Nie jest kryterium.

| specjalista | 1 r.: strata (odniesienie) · p | 2 r.: strata (odniesienie) · p | 3 r.: strata (odniesienie) · p | 4 r.: strata (odniesienie) · p | 5 r.: strata (odniesienie) · p |
|---|---|---|---|---|---|
| Reporter | 0.260 (0.255) · p=0.024 · kw.=24 | 0.353 (0.349) · p=0.533 · kw.=24 | 0.423 (0.424) · p=— · kw.=20 | 0.496 (0.506) · p=— · kw.=16 | 0.600 (0.614) · p=— · kw.=11 |
| Praktyk | 0.261 (0.257) · p=0.080 · kw.=24 | 0.350 (0.347) · p=0.583 · kw.=24 | 0.422 (0.424) · p=— · kw.=20 | 0.496 (0.507) · p=— · kw.=16 | 0.600 (0.615) · p=— · kw.=11 |
| Weteran | 0.261 (0.257) · p=0.081 · kw.=24 | 0.350 (0.347) · p=0.583 · kw.=24 | 0.422 (0.424) · p=— · kw.=20 | 0.496 (0.507) · p=— · kw.=16 | 0.600 (0.615) · p=— · kw.=11 |
| Tropiciel | 0.259 (0.255) · p=0.521 · kw.=24 | 0.356 (0.349) · p=0.510 · kw.=24 | 0.462 (0.424) · p=— · kw.=20 | 0.573 (0.506) · p=— · kw.=16 | 0.696 (0.614) · p=— · kw.=11 |
| Detektyw | 0.257 (0.257) · p=0.736 · kw.=24 | 0.353 (0.347) · p=0.547 · kw.=24 | 0.457 (0.424) · p=— · kw.=20 | 0.570 (0.507) · p=— · kw.=16 | 0.694 (0.615) · p=— · kw.=11 |
| Archiwista | 0.257 (0.257) · p=0.778 · kw.=24 | 0.353 (0.347) · p=0.558 · kw.=24 | 0.457 (0.424) · p=— · kw.=20 | 0.570 (0.507) · p=— · kw.=16 | 0.694 (0.615) · p=— · kw.=11 |
| Radar | 0.258 (0.255) · p=0.646 · kw.=24 | 0.360 (0.349) · p=0.255 · kw.=24 | 0.490 (0.424) · p=— · kw.=20 | 0.638 (0.506) · p=— · kw.=16 | 0.784 (0.614) · p=— · kw.=11 |
| Sejsmograf | 0.259 (0.257) · p=0.912 · kw.=24 | 0.366 (0.347) · p=0.183 · kw.=24 | 0.474 (0.424) · p=— · kw.=20 | 0.617 (0.507) · p=— · kw.=16 | 0.769 (0.615) · p=— · kw.=11 |
| Kompas | 0.258 (0.257) · p=0.983 · kw.=24 | 0.358 (0.347) · p=0.415 · kw.=24 | 0.475 (0.424) · p=— · kw.=20 | 0.613 (0.507) · p=— · kw.=16 | 0.784 (0.615) · p=— · kw.=11 |

## Bramka — drzewa i sieć kontra model prosty z tą samą pamięcią

FAIL, gdy strata jest wyższa i p < 0.05 dla któregokolwiek horyzontu. PASS, gdy żaden zmierzony horyzont nie jest FAIL i zmierzono co najmniej jeden.

| specjalista | 1 r.: strata (odniesienie) · p | 2 r.: strata (odniesienie) · p | 3 r.: strata (odniesienie) · p | 4 r.: strata (odniesienie) · p | 5 r.: strata (odniesienie) · p |
|---|---|---|---|---|---|
| Tropiciel | 0.259 (0.260) · p=0.832 · kw.=24 | 0.356 (0.353) · p=0.967 · kw.=24 | 0.462 (0.423) · p=— · kw.=20 | 0.573 (0.496) · p=— · kw.=16 | 0.696 (0.600) · p=— · kw.=11 |
| Detektyw | 0.257 (0.261) · p=0.213 · kw.=24 | 0.353 (0.350) · p=0.998 · kw.=24 | 0.457 (0.422) · p=— · kw.=20 | 0.570 (0.496) · p=— · kw.=16 | 0.694 (0.600) · p=— · kw.=11 |
| Archiwista | 0.257 (0.261) · p=0.236 · kw.=24 | 0.353 (0.350) · p=0.978 · kw.=24 | 0.457 (0.422) · p=— · kw.=20 | 0.570 (0.496) · p=— · kw.=16 | 0.694 (0.600) · p=— · kw.=11 |
| Radar | 0.258 (0.260) · p=0.645 · kw.=24 | 0.360 (0.353) · p=0.781 · kw.=24 | 0.490 (0.423) · p=— · kw.=20 | 0.638 (0.496) · p=— · kw.=16 | 0.784 (0.600) · p=— · kw.=11 |
| Sejsmograf | 0.259 (0.261) · p=0.456 · kw.=24 | 0.366 (0.350) · p=0.579 · kw.=24 | 0.474 (0.422) · p=— · kw.=20 | 0.617 (0.496) · p=— · kw.=16 | 0.769 (0.600) · p=— · kw.=11 |
| Kompas | 0.258 (0.261) · p=0.318 · kw.=24 | 0.358 (0.350) · p=0.826 · kw.=24 | 0.475 (0.422) · p=— · kw.=20 | 0.613 (0.496) · p=— · kw.=16 | 0.784 (0.600) · p=— · kw.=11 |

## K2 — zakup po cenie zrównoważonej kontra S&P 500

Zlecenie z limitem ważne 3 miesiące od decyzji; realizacja po pierwszym zamknięciu ≤ limit. Trzymanie 1 rok, zwrot z dywidendami, SPY kupiony w tej samej sesji. PASS: średnia nadwyżka > 0 i dolna granica CI95 > 0 (bootstrap ruchomych bloków po 4 kwartały — roczne trzymania z sąsiednich kwartałów zachodzą na siebie).

| specjalista | zlecenia | zrealizowane | z wynikiem | kwartały | spółka | SPY | nadwyżka (CI95) | wynik | bez limitu: nadwyżka | cały rynek USA (VTI, inf.): nadwyżka (CI95) |
|---|---|---|---|---|---|---|---|---|---|---|
| Reporter | 11286 | 5707 (51%) | 5707 | 12 | 18.7% | 17.2% | 1.5% (-10.9% – 12.1%) | FAIL | -0.3% (n=11286) | 1.4% (-9.6% – 10.7%) |
| Praktyk | 11308 | 5961 (53%) | 5961 | 12 | 18.0% | 16.7% | 1.2% (-10.7% – 11.8%) | FAIL | -0.3% (n=11308) | 1.2% (-9.4% – 10.4%) |
| Weteran | 11308 | 5958 (53%) | 5958 | 12 | 18.0% | 16.7% | 1.2% (-10.7% – 11.8%) | FAIL | -0.3% (n=11308) | 1.2% (-9.4% – 10.4%) |
| Tropiciel | 11286 | 10626 (94%) | 10626 | 12 | 14.2% | 14.3% | -0.1% (-6.5% – 6.4%) | FAIL | -0.3% (n=11286) | 0.4% (-5.1% – 5.0%) |
| Detektyw | 11308 | 10650 (94%) | 10650 | 12 | 14.1% | 14.3% | -0.3% (-6.5% – 5.8%) | FAIL | -0.3% (n=11308) | 0.3% (-5.3% – 4.8%) |
| Archiwista | 11308 | 10644 (94%) | 10644 | 12 | 14.1% | 14.3% | -0.2% (-6.5% – 5.9%) | FAIL | -0.3% (n=11308) | 0.3% (-5.3% – 4.8%) |
| Radar | 11286 | 10829 (96%) | 10829 | 12 | 13.6% | 14.1% | -0.5% (-6.7% – 5.6%) | FAIL | -0.3% (n=11286) | -0.0% (-5.4% – 4.6%) |
| Sejsmograf | 11308 | 10726 (95%) | 10726 | 12 | 14.1% | 14.2% | -0.1% (-6.3% – 6.2%) | FAIL | -0.3% (n=11308) | 0.4% (-4.9% – 5.0%) |
| Kompas | 11308 | 10782 (95%) | 10782 | 12 | 14.2% | 14.1% | 0.1% (-6.3% – 6.4%) | FAIL | -0.3% (n=11308) | 0.6% (-4.9% – 5.4%) |

**Zastrzeżenie — błąd przetrwania.** Panel zawiera prawie wyłącznie spółki notowane do dziś (krok c2). Zwroty spółek są więc zawyżone względem rzeczywistości, a nadwyżka nad SPY — razem z nimi. Kolumna „bez limitu” pokazuje, ile daje sam wybór spółek z panelu bez ceny zakupu: dopiero różnica między nią a wynikiem ze zleceniem mówi coś o cenie zakupu. Ostatnia kolumna: te same transakcje względem funduszu całego rynku USA (VTI) — informacyjnie, kryterium K2 liczone jest względem S&P 500.

## K6 — czy cena zakupu skacze bez powodu

Mediana |zmiany| ceny zrównoważonej między kolejnymi kwartałami tej samej spółki. Próg: ≤ 15%. Kolumny horyzontów pokazują, które składniki średniej są najbardziej rozchwiane.

| specjalista | mediana zmiany | par kwartałów | tylko 1 r. | tylko 2 r. | tylko 3 r. | tylko 4 r. | tylko 5 r. | wynik | na granicy zakresu wyceny | dywidenda nieznana (liczona jako 0) |
|---|---|---|---|---|---|---|---|---|---|---|
| Reporter | 6.9% | 9633 | 9.4% | 6.8% | 6.8% | 6.2% | 8.0% | PASS | 27.2% | 27.6% |
| Praktyk | 6.4% | 9656 | 6.8% | 6.6% | 6.8% | 6.0% | 7.9% | PASS | 15.2% | 27.7% |
| Weteran | 6.4% | 9656 | 6.8% | 6.6% | 6.8% | 6.0% | 7.9% | PASS | 15.1% | 27.7% |
| Tropiciel | 8.4% | 9633 | 6.3% | 4.6% | 4.6% | 5.4% | 8.2% | PASS | 99.2% | 27.6% |
| Detektyw | 7.4% | 9656 | 5.0% | 4.1% | 4.4% | 5.4% | 8.3% | PASS | 98.7% | 27.7% |
| Archiwista | 7.6% | 9656 | 5.0% | 4.3% | 4.4% | 5.4% | 8.3% | PASS | 98.7% | 27.7% |
| Radar | 6.8% | 9633 | 6.6% | 4.0% | 4.6% | 5.7% | 6.5% | PASS | 99.8% | 27.6% |
| Sejsmograf | 6.6% | 9656 | 4.1% | 4.4% | 4.1% | 7.5% | 8.6% | PASS | 99.5% | 27.7% |
| Kompas | 7.7% | 9656 | 3.4% | 4.9% | 5.8% | 6.4% | 8.3% | PASS | 99.8% | 27.7% |

Ceny zakupu według roku decyzji (cena wymaga modeli dla wszystkich 5 horyzontów):

| specjalista | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|
| Reporter | 0 | 0 | 0 | 3388 | 3576 | 4322 |
| Praktyk | 0 | 0 | 0 | 3393 | 3578 | 4337 |
| Weteran | 0 | 0 | 0 | 3393 | 3578 | 4337 |
| Tropiciel | 0 | 0 | 0 | 3388 | 3576 | 4322 |
| Detektyw | 0 | 0 | 0 | 3393 | 3578 | 4337 |
| Archiwista | 0 | 0 | 0 | 3393 | 3578 | 4337 |
| Radar | 0 | 0 | 0 | 3388 | 3576 | 4322 |
| Sejsmograf | 0 | 0 | 0 | 3393 | 3578 | 4337 |
| Kompas | 0 | 0 | 0 | 3393 | 3578 | 4337 |

## Różnorodność zespołu

Korelacja median prognoz na obserwacjach ocenionych przez wszystkich. Para ≥ 0.95 zostaje połączona. Cel: n_eff > 3. Korelacja błędów podana informacyjnie — jest zawsze wysoka, bo prawdziwy ruch kursu jest wspólny dla wszystkich (docs/specjalisci.md, punkt 7).

| horyzont | obserwacji | średnia korelacja prognoz | n_eff | średnia korelacja błędów (inf.) | pary do połączenia |
|---|---|---|---|---|---|
| 1 r. | 21414 | 0.389 | 2.19 | 0.983 | reporter–praktyk (0.974), reporter–weteran (0.973), praktyk–weteran (1.000), detektyw–archiwista (0.984) |
| 2 r. | 21271 | 0.401 | 2.14 | 0.958 | reporter–praktyk (0.996), reporter–weteran (0.996), praktyk–weteran (1.000), detektyw–archiwista (0.995) |
| 3 r. | 18216 | 0.330 | 2.47 | 0.943 | reporter–praktyk (0.999), reporter–weteran (0.999), praktyk–weteran (1.000), tropiciel–detektyw (0.959), tropiciel–archiwista (0.959), detektyw–archiwista (1.000) |
| 4 r. | 14913 | 0.301 | 2.64 | 0.934 | reporter–praktyk (0.998), reporter–weteran (0.998), praktyk–weteran (1.000), tropiciel–detektyw (0.974), tropiciel–archiwista (0.974), detektyw–archiwista (1.000) |
| 5 r. | 10214 | 0.295 | 2.68 | 0.938 | reporter–praktyk (1.000), reporter–weteran (1.000), praktyk–weteran (1.000), tropiciel–detektyw (0.983), tropiciel–archiwista (0.983), detektyw–archiwista (1.000) |

Macierz korelacji prognoz, horyzont 1 rok:

|  | reporter | praktyk | weteran | tropiciel | detektyw | archiwista | radar | sejsmograf | kompas |
|---|---|---|---|---|---|---|---|---|---|
| reporter | 1.00 | 0.97 | 0.97 | -0.03 | 0.04 | 0.03 | -0.00 | 0.06 | 0.07 |
| praktyk | 0.97 | 1.00 | 1.00 | -0.07 | 0.00 | -0.00 | -0.06 | 0.03 | 0.04 |
| weteran | 0.97 | 1.00 | 1.00 | -0.07 | 0.00 | -0.00 | -0.06 | 0.03 | 0.04 |
| tropiciel | -0.03 | -0.07 | -0.07 | 1.00 | 0.74 | 0.74 | 0.69 | 0.62 | 0.63 |
| detektyw | 0.04 | 0.00 | 0.00 | 0.74 | 1.00 | 0.98 | 0.72 | 0.73 | 0.76 |
| archiwista | 0.03 | -0.00 | -0.00 | 0.74 | 0.98 | 1.00 | 0.72 | 0.73 | 0.76 |
| radar | -0.00 | -0.06 | -0.06 | 0.69 | 0.72 | 0.72 | 1.00 | 0.71 | 0.72 |
| sejsmograf | 0.06 | 0.03 | 0.03 | 0.62 | 0.73 | 0.73 | 0.71 | 1.00 | 0.72 |
| kompas | 0.07 | 0.04 | 0.04 | 0.63 | 0.76 | 0.76 | 0.72 | 0.72 | 1.00 |

## Wagi głosów (reguła zapisana przed egzaminem)

Waga ∝ 1 / średnia strata kwantylowa (horyzonty 1–5, obserwacje ocenione przez wszystkich głosujących). Bez głosu = 0.

| specjalista | średnia strata | waga |
|---|---|---|
| Reporter | 0.425 | 33.4% |
| Praktyk | 0.426 | 33.3% |
| Weteran | 0.426 | 33.3% |
| Tropiciel | — | — |
| Detektyw | — | — |
| Archiwista | — | — |
| Radar | — | — |
| Sejsmograf | — | — |
| Kompas | — | — |

## Czego ten egzamin nie mówi

- Decyzje z lat 2016–2021 to jeden okres rynkowy; horyzonty 3–5 lat mają tylko kilka niezależnych okien.
- Panel zaczyna się w 2010 r., więc modele dla dłuższych horyzontów powstają dopiero w późniejszych latach egzaminu, a pamięć 8 lat i „cała historia” długo widzą to samo.
- Ostateczny sprawdzian to sejf 2023–2025 (limit 3 użyć), którego ten raport nie dotyka.
