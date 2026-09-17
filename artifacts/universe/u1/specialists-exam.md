# Egzamin specjalistów — wariant u1

Wariant: pas 80% zależny od zmienności kursu (U1b). Reguły wariantu: `docs/ulepszenia.md`.

Wygenerowano: 2026-09-17T16:29:11.921Z. Projekt i progi: `docs/specjalisci.md` (zapisane przed treningiem).

Egzamin kroczący: trening co roku 15 lutego 2016–2021, ocena decyzji do następnego lutego. Sejf 2023–2025 nietknięty: decyzje egzaminu kończą się w 2021 r., pamięć — na wynikach znanych w dniu treningu.

## Wynik w skrócie

| specjalista | metoda | pamięć | K1 pas 80% | K3 (horyzonty) | K4 (horyzonty) | bramka | K2 | K6 | głos |
|---|---|---|---|---|---|---|---|---|---|
| Reporter | model prosty | 4 lata | PASS | 0/5 PASS | 0/5 PASS | nie dotyczy | FAIL | PASS | tak (waga 33%) |
| Praktyk | model prosty | 8 lat | PASS | 0/5 PASS | 0/5 PASS | nie dotyczy | FAIL | PASS | tak (waga 33%) |
| Weteran | model prosty | cała historia | PASS | 0/5 PASS | 0/5 PASS | nie dotyczy | FAIL | PASS | tak (waga 33%) |
| Tropiciel | drzewa decyzyjne | 4 lata | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | — |
| Detektyw | drzewa decyzyjne | 8 lat | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | — |
| Archiwista | drzewa decyzyjne | cała historia | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | — |
| Radar | sieć neuronowa | 4 lata | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | — |
| Sejsmograf | sieć neuronowa | 8 lat | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | — |
| Kompas | sieć neuronowa | cała historia | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | BRAK POMIARU | — |

Głos w konsensusie: zdany K1 na wszystkich horyzontach; drzewa i sieć dodatkowo bramka (nie istotnie gorsze od modelu prostego z tą samą pamięcią).
Specjalista bez głosu pozostaje widoczny w szczegółach z oznaczeniem „nie zdał egzaminu”.

## K1 — czy pas 80% zawiera prawdziwą cenę

Próg: 72%–88% dla każdego horyzontu. Przedział ufności: bootstrap po kwartałach.

| specjalista | 1 r. | 2 r. | 3 r. | 4 r. | 5 r. |
|---|---|---|---|---|---|
| Reporter | 77.6% (74%–81%), n=21452, PASS | 79.7% (77%–83%), n=21316, PASS | 80.5% (76%–84%), n=18252, PASS | 82.2% (81%–84%), n=14912, PASS | 82.4% (81%–84%), n=10204, PASS |
| Praktyk | 77.3% (73%–81%), n=21412, PASS | 79.8% (77%–83%), n=21257, PASS | 80.2% (76%–84%), n=18207, PASS | 81.9% (80%–84%), n=14905, PASS | 82.3% (81%–84%), n=10205, PASS |
| Weteran | 77.3% (73%–81%), n=21412, PASS | 79.8% (77%–83%), n=21257, PASS | 80.2% (76%–84%), n=18207, PASS | 81.9% (80%–84%), n=14905, PASS | 82.3% (81%–84%), n=10205, PASS |

Punkty odniesienia (informacyjnie):

| punkt odniesienia | 1 r. | 2 r. | 3 r. | 4 r. | 5 r. |
|---|---|---|---|---|---|
| cena się nie zmieni (4 lata) | 78.2%, n=21452 | 79.3%, n=21316 | 78.6%, n=18252 | 80.1%, n=14912 | 79.6%, n=10204 |
| stała wielokrotność (4 lata) | 78.2%, n=21452 | 80.0%, n=21316 | 79.0%, n=18252 | 80.3%, n=14912 | 79.7%, n=10204 |
| typowy zwrot z pamięci (informacyjnie) (4 lata) | 78.2%, n=21452 | 79.3%, n=21316 | 78.6%, n=18252 | 80.1%, n=14912 | 79.6%, n=10204 |
| cena się nie zmieni (8 lat) | 77.8%, n=21412 | 79.2%, n=21257 | 78.3%, n=18207 | 79.6%, n=14905 | 79.5%, n=10205 |
| stała wielokrotność (8 lat) | 77.9%, n=21412 | 79.9%, n=21257 | 78.8%, n=18207 | 79.9%, n=14905 | 79.6%, n=10205 |
| typowy zwrot z pamięci (informacyjnie) (8 lat) | 77.8%, n=21412 | 79.2%, n=21257 | 78.3%, n=18207 | 79.6%, n=14905 | 79.5%, n=10205 |
| cena się nie zmieni (cała historia) | 77.8%, n=21412 | 79.2%, n=21257 | 78.3%, n=18207 | 79.6%, n=14905 | 79.5%, n=10205 |
| stała wielokrotność (cała historia) | 77.8%, n=21412 | 79.9%, n=21257 | 78.8%, n=18207 | 79.9%, n=14905 | 79.6%, n=10205 |
| typowy zwrot z pamięci (informacyjnie) (cała historia) | 77.8%, n=21412 | 79.2%, n=21257 | 78.3%, n=18207 | 79.6%, n=14905 | 79.5%, n=10205 |

## Wstrzymane głosy

„brak modelu” = za mało danych w pamięci dla tego horyzontu (dane zaczynają się w 2010 r.); „wstrzymał się” = brak kluczowej cechy albo spółka poza 1.–99. centylem danych uczących.

| specjalista | 1 r.: brak modelu / wstrzymał się | 2 r.: brak modelu / wstrzymał się | 3 r.: brak modelu / wstrzymał się | 4 r.: brak modelu / wstrzymał się | 5 r.: brak modelu / wstrzymał się |
|---|---|---|---|---|---|
| Reporter | 0% / 15% | 0% / 16% | 13% / 15% | 28% / 13% | 44% / 11% |
| Praktyk | 0% / 16% | 0% / 16% | 13% / 15% | 28% / 13% | 44% / 12% |
| Weteran | 0% / 16% | 0% / 16% | 13% / 15% | 28% / 13% | 44% / 12% |

## K3 — lepszy od „cena się nie zmieni”

Strata kwantylowa (centyle 10/50/90, logarytm zmiany ceny) na wspólnych obserwacjach; mniej = lepiej. PASS: niższa strata i p < 0.0167 (Diebold-Mariano na średnich kwartalnych, Newey-West). „kw.” = liczba kwartałów. Test odbywa się tylko przy co najmniej 2 nienachodzących na siebie oknach (kwartały ≥ 2 × 4 × horyzont); inaczej „p=—” i brak pomiaru — dla 3–5 lat dane z 2016–2021 zwykle na to nie wystarczają.

| specjalista | 1 r.: strata (odniesienie) · p | 2 r.: strata (odniesienie) · p | 3 r.: strata (odniesienie) · p | 4 r.: strata (odniesienie) · p | 5 r.: strata (odniesienie) · p |
|---|---|---|---|---|---|
| Reporter | 0.254 (0.254) · p=0.881 · kw.=24 | 0.347 (0.352) · p=0.573 · kw.=24 | 0.417 (0.427) · p=— · kw.=20 | 0.487 (0.505) · p=— · kw.=16 | 0.590 (0.620) · p=— · kw.=11 |
| Praktyk | 0.255 (0.255) · p=0.934 · kw.=24 | 0.345 (0.350) · p=0.565 · kw.=24 | 0.416 (0.427) · p=— · kw.=20 | 0.486 (0.505) · p=— · kw.=16 | 0.590 (0.620) · p=— · kw.=11 |
| Weteran | 0.255 (0.255) · p=0.933 · kw.=24 | 0.345 (0.350) · p=0.565 · kw.=24 | 0.416 (0.427) · p=— · kw.=20 | 0.486 (0.505) · p=— · kw.=16 | 0.590 (0.620) · p=— · kw.=11 |

## K4 — lepszy od „stała wielokrotność”

Punkt odniesienia: wzrost przychodów jak w modelu prostym z tą samą pamięcią, wycena bez zmian. PASS: niższa strata i p < 0.0167.

| specjalista | 1 r.: strata (odniesienie) · p | 2 r.: strata (odniesienie) · p | 3 r.: strata (odniesienie) · p | 4 r.: strata (odniesienie) · p | 5 r.: strata (odniesienie) · p |
|---|---|---|---|---|---|
| Reporter | 0.254 (0.250) · p=0.124 · kw.=24 | 0.347 (0.341) · p=0.476 · kw.=24 | 0.417 (0.415) · p=— · kw.=20 | 0.487 (0.496) · p=— · kw.=16 | 0.590 (0.604) · p=— · kw.=11 |
| Praktyk | 0.255 (0.252) · p=0.239 · kw.=24 | 0.345 (0.338) · p=0.463 · kw.=24 | 0.416 (0.414) · p=— · kw.=20 | 0.486 (0.497) · p=— · kw.=16 | 0.590 (0.604) · p=— · kw.=11 |
| Weteran | 0.255 (0.252) · p=0.242 · kw.=24 | 0.345 (0.338) · p=0.463 · kw.=24 | 0.416 (0.414) · p=— · kw.=20 | 0.486 (0.497) · p=— · kw.=16 | 0.590 (0.604) · p=— · kw.=11 |

## Informacyjnie — typowy zwrot z pamięci

Mediana = typowa zmiana ceny w pamięci specjalisty, bez patrzenia na spółkę. Nie jest kryterium.

| specjalista | 1 r.: strata (odniesienie) · p | 2 r.: strata (odniesienie) · p | 3 r.: strata (odniesienie) · p | 4 r.: strata (odniesienie) · p | 5 r.: strata (odniesienie) · p |
|---|---|---|---|---|---|
| Reporter | 0.254 (0.249) · p=0.002 · kw.=24 | 0.347 (0.342) · p=0.427 · kw.=24 | 0.417 (0.416) · p=— · kw.=20 | 0.487 (0.495) · p=— · kw.=16 | 0.590 (0.601) · p=— · kw.=11 |
| Praktyk | 0.255 (0.250) · p=0.035 · kw.=24 | 0.345 (0.340) · p=0.428 · kw.=24 | 0.416 (0.415) · p=— · kw.=20 | 0.486 (0.495) · p=— · kw.=16 | 0.590 (0.601) · p=— · kw.=11 |
| Weteran | 0.255 (0.250) · p=0.036 · kw.=24 | 0.345 (0.340) · p=0.428 · kw.=24 | 0.416 (0.415) · p=— · kw.=20 | 0.486 (0.495) · p=— · kw.=16 | 0.590 (0.601) · p=— · kw.=11 |

## Bramka — drzewa i sieć kontra model prosty z tą samą pamięcią

FAIL, gdy strata jest wyższa i p < 0.05 dla któregokolwiek horyzontu. PASS, gdy żaden zmierzony horyzont nie jest FAIL i zmierzono co najmniej jeden.

| specjalista | 1 r.: strata (odniesienie) · p | 2 r.: strata (odniesienie) · p | 3 r.: strata (odniesienie) · p | 4 r.: strata (odniesienie) · p | 5 r.: strata (odniesienie) · p |
|---|---|---|---|---|---|

## K2 — zakup po cenie zrównoważonej kontra S&P 500

Zlecenie z limitem ważne 3 miesiące od decyzji; realizacja po pierwszym zamknięciu ≤ limit. Trzymanie 1 rok, zwrot z dywidendami, SPY kupiony w tej samej sesji. PASS: średnia nadwyżka > 0 i dolna granica CI95 > 0 (bootstrap ruchomych bloków po 4 kwartały — roczne trzymania z sąsiednich kwartałów zachodzą na siebie).

| specjalista | zlecenia | zrealizowane | z wynikiem | kwartały | spółka | SPY | nadwyżka (CI95) | wynik | bez limitu: nadwyżka | cały rynek USA (VTI, inf.): nadwyżka (CI95) |
|---|---|---|---|---|---|---|---|---|---|---|
| Reporter | 11270 | 5703 (51%) | 5703 | 12 | 18.6% | 17.2% | 1.4% (-11.0% – 12.0%) | FAIL | -0.4% (n=11270) | 1.3% (-9.6% – 10.5%) |
| Praktyk | 11292 | 5956 (53%) | 5956 | 12 | 17.9% | 16.8% | 1.1% (-10.8% – 11.6%) | FAIL | -0.4% (n=11292) | 1.1% (-9.4% – 10.3%) |
| Weteran | 11292 | 5953 (53%) | 5953 | 12 | 17.9% | 16.8% | 1.1% (-10.8% – 11.6%) | FAIL | -0.4% (n=11292) | 1.1% (-9.4% – 10.3%) |

**Zastrzeżenie — błąd przetrwania.** Panel zawiera prawie wyłącznie spółki notowane do dziś (krok c2). Zwroty spółek są więc zawyżone względem rzeczywistości, a nadwyżka nad SPY — razem z nimi. Kolumna „bez limitu” pokazuje, ile daje sam wybór spółek z panelu bez ceny zakupu: dopiero różnica między nią a wynikiem ze zleceniem mówi coś o cenie zakupu. Ostatnia kolumna: te same transakcje względem funduszu całego rynku USA (VTI) — informacyjnie, kryterium K2 liczone jest względem S&P 500.

## K6 — czy cena zakupu skacze bez powodu

Mediana |zmiany| ceny zrównoważonej między kolejnymi kwartałami tej samej spółki. Próg: ≤ 15%. Kolumny horyzontów pokazują, które składniki średniej są najbardziej rozchwiane.

| specjalista | mediana zmiany | par kwartałów | tylko 1 r. | tylko 2 r. | tylko 3 r. | tylko 4 r. | tylko 5 r. | wynik | na granicy zakresu wyceny | dywidenda nieznana (liczona jako 0) |
|---|---|---|---|---|---|---|---|---|---|---|
| Reporter | 6.9% | 9623 | 9.4% | 6.8% | 6.7% | 6.2% | 8.0% | PASS | 27.2% | 27.6% |
| Praktyk | 6.4% | 9646 | 6.8% | 6.5% | 6.8% | 6.0% | 7.9% | PASS | 15.1% | 27.6% |
| Weteran | 6.4% | 9646 | 6.8% | 6.6% | 6.8% | 6.0% | 7.9% | PASS | 15.1% | 27.6% |

Ceny zakupu według roku decyzji (cena wymaga modeli dla wszystkich 5 horyzontów):

| specjalista | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|
| Reporter | 0 | 0 | 0 | 3388 | 3574 | 4308 |
| Praktyk | 0 | 0 | 0 | 3393 | 3576 | 4323 |
| Weteran | 0 | 0 | 0 | 3393 | 3576 | 4323 |

## Różnorodność zespołu

Korelacja median prognoz na obserwacjach ocenionych przez wszystkich. Para ≥ 0.95 zostaje połączona. Cel: n_eff > 3. Korelacja błędów podana informacyjnie — jest zawsze wysoka, bo prawdziwy ruch kursu jest wspólny dla wszystkich (docs/specjalisci.md, punkt 7).

| horyzont | obserwacji | średnia korelacja prognoz | n_eff | średnia korelacja błędów (inf.) | pary do połączenia |
|---|---|---|---|---|---|
| 1 r. | 21390 | 0.982 | 1.01 | 1.000 | reporter–praktyk (0.974), reporter–weteran (0.973), praktyk–weteran (1.000) |
| 2 r. | 21247 | 0.997 | 1.00 | 1.000 | reporter–praktyk (0.996), reporter–weteran (0.996), praktyk–weteran (1.000) |
| 3 r. | 18197 | 0.999 | 1.00 | 1.000 | reporter–praktyk (0.999), reporter–weteran (0.999), praktyk–weteran (1.000) |
| 4 r. | 14897 | 0.999 | 1.00 | 1.000 | reporter–praktyk (0.998), reporter–weteran (0.998), praktyk–weteran (1.000) |
| 5 r. | 10201 | 1.000 | 1.00 | 1.000 | reporter–praktyk (1.000), reporter–weteran (1.000), praktyk–weteran (1.000) |

Macierz korelacji prognoz, horyzont 1 rok:

|  | reporter | praktyk | weteran |
|---|---|---|---|
| reporter | 1.00 | 0.97 | 0.97 |
| praktyk | 0.97 | 1.00 | 1.00 |
| weteran | 0.97 | 1.00 | 1.00 |

## Wagi głosów (reguła zapisana przed egzaminem)

Waga ∝ 1 / średnia strata kwantylowa (horyzonty 1–5, obserwacje ocenione przez wszystkich głosujących). Bez głosu = 0.

| specjalista | średnia strata | waga |
|---|---|---|
| Reporter | 0.418 | 33.3% |
| Praktyk | 0.418 | 33.3% |
| Weteran | 0.418 | 33.3% |

## Czego ten egzamin nie mówi

- Decyzje z lat 2016–2021 to jeden okres rynkowy; horyzonty 3–5 lat mają tylko kilka niezależnych okien.
- Panel zaczyna się w 2010 r., więc modele dla dłuższych horyzontów powstają dopiero w późniejszych latach egzaminu, a pamięć 8 lat i „cała historia” długo widzą to samo.
- Ostateczny sprawdzian to sejf 2023–2025 (limit 3 użyć), którego ten raport nie dotyka.
