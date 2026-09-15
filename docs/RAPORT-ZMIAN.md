# Raport zmian — Valuation System 2.0

Data: 2026-09-15. Zakres: naprawa błędów z mojego przeglądu oraz z backlogu `message (1).txt` (T-01…T-33, D-01).

## Najważniejsze w skrócie

1. **Poprzedni raport „Go/No-Go” był fikcyjny.** Każda liczba z ✅ PASS w `final_report.md` była wpisana na stałe w `scripts/final_evaluation.ts`. Skrypt i raport zostały usunięte. Nowa tabela (`artifacts/gonogo-report.md`) składa się wyłącznie z artefaktów liczonych na danych.
2. **Dane były w dużej części zepsute.** Najważniejsze przyczyny:
   - liczba akcji wynosiła 1 000 000 dla prawie każdej spółki;
   - TTM liczono błędnie;
   - makro wchodziło jako niekompletny obiekt, co dawało `NaN` w DDM;
   - EBITDA, beta, SMA200 i zakres 52W były atrapami.

   Dataset został przebudowany od zera.
3. **Po naprawie system da się uczciwie zmierzyć, a wynik jest słaby.** Liczby są w sekcji 3. Najważniejsze fakty nie są korzystne dla modelu i zostały zaraportowane wprost, a nie obejście.
4. **Części pracy nie da się wykonać bez człowieka albo bez danych**: rotacja klucza FRED, repozytorium git dla sejfu, decyzje D-01 i D-02, dane spółek usuniętych z indeksu, nocny przebieg algorytmu genetycznego. Szczegóły w sekcji 4.

## 1. Błędy znalezione w przeglądzie i ich naprawa

| # | Błąd | Skutek | Naprawa |
|---|---|---|---|
| 1 | `final_evaluation.ts` zwracał stałe: IC 0.045, p-value DM 0.002/0.012, spread 12%, degradacja 13.5%, kalibracja p=0.001 | Raport „wszystko PASS” bez żadnego pomiaru | Usunięte. Prawdziwe pomiary: `report-benchmarks.ts` (DM), `report-calibration.ts`, `report-deciles.ts`, `test-ensemble-diversity.ts`, `report-gonogo.ts` |
| 2 | Liczba akcji szukana w `us-gaap`, a jest w taksonomii `dei`, której loader nie wczytywał. Fallback: 1 000 000 | Wartości na akcję zawyżone o rzędy wielkości (CVX po $67 miał liczbę Grahama 120 493) | `data-loader` ładuje `dei`. Mapper bierze `dei:EntityCommonStockSharesOutstanding` → `CommonStockSharesOutstanding` → średnią rozwodnioną. Brak → spółka pomijana z powodem. Korekta o splity liczona od daty raportu liczby akcji |
| 3 | TTM: `fy`/`fp` traktowane jak okres faktu (a to rok raportu), wartość roczna doliczana jako Q4, fallback „kwartał × 4” | Przychody, zyski i FCF zawyżone lub przypadkowe | `src/xbrl.ts`: okresy z dat start/end. TTM = rok obrotowy albo FY + YTD − YTD sprzed roku albo 4 kolejne kwartały, inaczej `null`. Testy w `tests/xbrl.test.ts` |
| 4 | `generate-dataset` przekazywał makro `{fedFundsRate, asOf}` bez `treasury10Y` | Stopa dyskontowa `NaN`: DDM `NaN` w 100% wierszy, DCF/FCF/EPV puste | Makro point-in-time z FRED/ALFRED (`getMacroAsOf`). Silnik rzuca wyjątek przy niekompletnym makro i odrzuca wyniki `NaN` |
| 5 | EBITDA = zysk netto + 5% długu | EV/EBITDA bez sensu | EBITDA = EBIT (TTM) + amortyzacja (TTM), inaczej `null` |
| 6 | Beta = 1, SMA200 = cena, 52W = cena ±20% dla każdej spółki | Margines bezpieczeństwa i archetypy liczone z atrap | `src/market-stats.ts`: beta z 2 lat dziennych zwrotów vs ^GSPC, SMA200, 52W high/low, momentum 12-1, obsunięcie 24M — tylko z notowań do dnia decyzji |
| 7 | `revenueGrowth` z porównania przypadkowych okresów. `earningsGrowth`, `payoutRatio`, `debtToEquity` nigdy nieustawiane | Kryteria archetypów martwe (banki: 38 wierszy na 14 896), PEG 0% pokrycia | Wzrosty TTM r/r, payout, dług/kapitał, ROE, marża — z danych. Sektor z kodu SIC (banki: `Financial Services`) |
| 8 | M-Score liczony z 5 z 8 zmiennych przy pełnej stałej −4.84 (zawyżony o ok. 0.5). F-Score liczył brakujące dane jako 0 pkt | Fałszywe „czerwone flagi”: wycena ×0.5 (M-Score) albo ×0.7 (F-Score) | Oba liczone tylko przy komplecie wejść, inaczej `null` (bez korekty) |
| 9 | Korekta HTM (T-19) dodawała AOCI drugi raz, choć AOCI już jest w kapitale | Podwójne liczenie strat banków | Korekta tylko o niezrealizowaną stratę HTM. Test `tests/book-value-adjustment.test.ts` |
| 10 | `verdict` ustawiany tylko w wycenie zespołowej; testy trupów wołały zwykłą wycenę | `expect(verdict).not.toBe('BUY')` zawsze zielone | `calculateFairValue` zwraca werdykt. Testy trupów na danych z cache |
| 11 | Symulator: rentowność TNX w % traktowana jak „punkty bazowe × 10” | Reżim stóp nigdy HIKING/CUTTING, więc 2 z 3 ewoluowanych macierzy nigdy nie były używane | Reżim z FEDFUNDS (ALFRED) |
| 12 | Symulator: pozycje przetrzymywane przez zamaskowany okres; alfa względem S&P za cały okres; gotówka +0.5%/kw.; CPI „z epoki” wpisane na stałe | Wyciek zwrotów z bloku testowego, błędna alfa | Segmenty z likwidacją na końcu, benchmark za te same kwartały, gotówka po stopie 3M z ALFRED, makro z FRED |
| 13 | `npm run backtest` (stary backtest Yahoo) zapisywał do `data/backtest-results.csv` | Nadpisywał dataset SEC innym formatem | Zapis do `data/legacy-yahoo-backtest.csv`; makro wpisane na stałe usunięte |
| 14 | `getPriceAtDate` zwracał dowolnie stare notowanie; `fwdReturn` z `close` bez dywidend | Spółka zdelistowana miała „cenę za 12M” sprzed lat; zwroty zaniżone o dywidendy | Notowanie starsze niż 10 dni = brak ceny (powód raportowany). Etykiety z `adjclose` |
| 15 | Bez makro silnik dodawał 2% CPI do wzrostu, ale nie do stopy dyskontowej | Asymetria; czerwony test DDM | Składnik CPI tylko przy znanym makro |
| 16 | `evaluate-holdout.ts` i inne importowały `train.ts` | Import uruchamiał cały trening | Logika wyodrębniona do `src/block-model.ts` |
| 17 | Klucze API na stałe w kodzie (FRED, Alpha Vantage) | Wyciek klucza | Tylko zmienne środowiskowe; `.env.example`, `.env` w `.gitignore` |
| 18 | Test `transfer.test.ts` generował dane „STOXX 600” wagami, które potem sprawdzał | Test z odpowiedzią na wejściu | Usunięty |

## 2. Status backlogu

Legenda: ✅ zrobione i zweryfikowane · ⚠️ kod gotowy, ale wynik ograniczony przez dane · ⛔ celowo nie wykonane · 🧑 decyzja człowieka.

Kilka tasków było częściowo zrobionych przed moją pracą. Dotyczy to T-01 (sygnatura i daty), T-04 (accnMap poza pętlą), części T-02, T-03 i T-05. Zweryfikowałem je i dokończyłem.

| Task | Status | Co zrobiono |
|---|---|---|
| T-01 arność `buildQuarterlyTimeline` | ✅ | Wszystkie wywołania mają 2 argumenty. Daty: koniec kwartału + ~45 dni |
| T-02 nazwy plików | ✅ | Wszystkie ścieżki w `src/paths.ts`. Konsumenci bez datasetu kończą się kodem 1 z komunikatem |
| T-03 kolumna daty | ✅ | Jedna `parseCSV` w `src/dataset.ts`. Brak kolumny, puste wymagane pole albo `NaN` → wyjątek. Kolumny `cik`, `LIQUIDATION_VALUE` i pomiarowe dodane |
| T-04 accnMap | ✅ | Wczytywany raz, brak pliku → wyjątek, statystyka na stderr |
| T-05 ekstrakcja cech | ✅ | Wspólna funkcja cech (`src/default-features.ts`), tabela pokrycia. `goingConcern` usunięte: koncept nie występuje w żadnym pliku |
| T-06 raport datasetu | ✅ | `artifacts/dataset-report.md`, 10 sekcji z rzeczywistymi liczbami |
| T-07 fikcyjny raport | ✅ | `final_evaluation.ts` i `final_report.md` usunięte |
| T-08 syntetyczna kalibracja | ✅ | `report-calibration.ts` na datasecie, bootstrap po kwartałach, bez SUCCESS/FAILURE |
| T-09 szum w różnorodności | ✅ | Bootstrap po CIK i pominięty blok (ziarno), pełne macierze korelacji |
| T-10 test purgingu | ✅ | Niezależna definicja wycieku, dwa testy negatywne (`tests/purging.test.ts`), raport odsetka purgingu |
| T-11 sejf holdout | ✅ | Log zarchiwizowany, wpis RESET. Warunki wstępne przed dotknięciem; dotknięcie zapisywane dopiero po obliczeniach. Wagi wyłącznie z artefaktu |
| T-12 podział danych | ✅ | `docs/data-splits.md`: trening 2006–21, embargo 2022, sejf 2023–25. 8 bloków i asercja |
| T-13 testy trupów | ✅ | Wyłącznie dane z cache, pominięcia z komunikatem, grupa kontrolna. Wynik w sekcji 3 |
| T-14 sprzątanie | ✅ | `rename.js` i atrapa `ticker_cik_validity.json` usunięte, klucze w env, narzędzia debug w `scripts/debug/`. **Rotację klucza FRED musi wykonać właściciel konta** |
| D-01 dwie ścieżki treningu | 🧑 | Rekomendacja wdrożona tymczasowo i opisana w `docs/architecture-decisions.md` |
| T-15 walk-forward w `train.ts` | ✅ | Brak `i % 3`, `splitFold` z `isPurged`, λ wybierana po średnim błędzie OOS |
| T-16 zapis wag | ✅ | `artifacts/block-weights.json` ze wszystkimi polami; `fallbackToPrior` dla n < 200; „CMA-ES” przemianowane na przeszukiwanie losowe |
| T-17 model bankructwa w silniku | ⚠️ | Artefakt, `predictDefaultProbability`, mapper ustawia `pDefault`, silnik rozróżnia `null` od 0. **Model nie powstał**: 0 zdarzeń bankructwa w danych (sekcja 3) |
| T-18 profil dokładności | ✅ | `artifacts/accuracy-profile.json` z predykcji OOS; archetyp z n < 200 → `null` → dokładność 0.5 |
| T-19 ocena OOS ekspertów | ✅ kod / ⛔ nieuruchomione | Blok walidacyjny do wyboru genomu, jedna ocena na bloku testowym, `metricsTrain/Val/OOS`, tabela. Pełny przebieg trwa godziny |
| T-20 fitness i selekcja GA | ✅ | Człony w [0,1], min. 20 transakcji, selekcja turniejowa z całej populacji, log min/mediana/max co 10 pokoleń |
| T-21 makro point-in-time | ✅ | `data/macro/fred-pit.json` (80 dat × 7 serii, 630 zapytań, 0 błędów); wszystkie wpisane na stałe makro usunięte |
| T-22 Spearman przy wiązaniach | ✅ | `src/stats.ts` (Pearson na rangach), test z wiązaniami, `IC_t_stat` |
| T-23 aktywacja capa makro | ✅ | `artifacts/macro-cap-report.md`: 5 wartości capa (wynik w sekcji 3) |
| T-24 dokumentacja | ✅ częściowo | README bez niezweryfikowanych liczb, `docs/limitations.md`. „Raportu architektonicznego” z tabeli T-24 nie ma w folderze — twierdzenia z tabeli prostuje `docs/RAPORT-SYSTEMU.md` |
| T-25 test Diebolda-Mariano | ✅ | `src/stats.ts` (Newey-West, HLN, t(n−1)), testy jednostkowe, 4 benchmarki |
| T-26 kalibracja | ✅ | `artifacts/calibration-report.md` |
| T-27 decyle z kosztami | ✅ | Obrót z rzeczywistych zmian składu, 10/30/60 bps, CI, Sharpe, maxDD, ^GSPC |
| T-28 różnorodność zespołu | ⚠️ | Eksperci wag bloków zmierzeni; eksperci GA → „BRAK POMIARU” (brak przebiegu evolve) |
| T-29 Go/No-Go | ✅ | Tylko z artefaktów; brak artefaktu → „⚠️ BRAK POMIARU”; progi w `docs/acceptance-criteria.md` zapisane przed pomiarami |
| T-30 pełny model bankructwa | ⚠️ | Zablokowany danymi: 0 pozytywów |
| T-31 pełna ewolucja | ⛔ | Kod gotowy (wątki z env, checkpointy, historia CSV); tylko test dymny |
| T-32 stabilność wag | ✅ | 20 ziaren, rozrzut wag i błędu, wskaźnik uwarunkowania, wniosek |
| T-33 dotknięcie sejfu | ⛔ celowo | Warunki niespełnione: brak repozytorium git, a Go/No-Go nie przechodzi |

## 3. Wyniki pomiarów po naprawie

Wszystkie liczby pochodzą z artefaktów wygenerowanych 2026-09-15 po naprawach. Źródło jest podane przy każdej grupie.

### 3.1 Dane (`artifacts/dataset-report.md`, `artifacts/generate_stats.json`)

| | Przed | Po |
|---|---|---|
| Wiersze / unikalne CIK | 14 896 / 355 | 22 390 / 459 |
| Daty decyzji | 64 (bez `cik` czytanego poprawnie przez konsumentów) | 66, od 2009-05-15 do 2025-08-15 |
| Podział | — | trening 15 919 · embargo 1 653 · sejf 4 818 |
| Pokrycie DCF / DDM / EV/EBITDA / FCF / EPV / PEG | 0% / `NaN` w 100% / 0% / 0% / 0% / 0% | 74,8% / 78,0% / 69,5% / 74,8% / 89,7% / 53,7% |
| Pokrycie Graham / P/B / P/S / likwidacyjna | 100% (z liczbą akcji = 1 mln) / 100% / 100% / 0% | 85,6% / 95,3% / 90,3% / 99,7% |
| Archetypy | 99% w dwóch archetypach, banki 38 wierszy | VC 10 353, CYC 4 320, HG 3 250, INC 2 418, FIN 1 792, DV 257 |
| Wiersze odrzucane po cichu | 11 115 (niska pewność) | 0 — niska pewność ma flagę (1 008 wierszy, 4,5%) |

Powody odrzuceń pozycji uniwersum:
- 10 481 — brak pliku cen (głównie spółki usunięte z indeksu);
- 4 321 — brak bilansu nowszego niż 400 dni (lata przed XBRL);
- 241 — brak notowania w dniu decyzji;
- 231 — brak liczby akcji;
- 925 wierszy bez etykiety 12M — horyzont wykracza poza ostatnie notowanie 2026-09-10.

Makro: 630 zapytań do FRED/ALFRED, 0 błędów. Spread HY dostępny tylko dla 10 z 80 dat.

### 3.2 Model bankructwa (`artifacts/default-model-report.md`)

Po etykietowaniu zgodnie z definicją jest **0 zdarzeń**, więc model nie został zapisany i `pDefault` jest nieznane w 100% wycen. Przyczyna to obciążenie przeżycia: z 343 spółek usuniętych z indeksu tylko 28 ma pliki w cache. Jedyny wpis „bankruptcy” z danymi (PCG) ma zamienione daty, więc nigdy nie jest w uniwersum.

Pokrycie cech na 15 919 obserwacjach: Altman Z 61,3%, dług netto/EBITDA 54,9%, pokrycie odsetek 51,5%, kwartały z ujemnym FCF 76,8%, obsunięcie 99,6%. `goingConcern` ma 0% i zostało usunięte.

### 3.3 Go/No-Go (`artifacts/gonogo-report.md`)

| Kryterium | Próg | Zmierzono | Status |
|---|---|---|---|
| DM vs random walk | p < 0.0125 i model lepszy | p < 0.0001; różnica strat +0.485 [0.402; 0.567] — model **gorszy** | ❌ FAIL |
| DM vs równe wagi | p < 0.0125 i model lepszy | p < 0.0001; +0.141 [0.110; 0.173] — model gorszy | ❌ FAIL |
| IC przekrojowy | t > 2.0 | t = −0.47 (IC −0.011, 51 kwartałów) | ❌ FAIL |
| Spread L/S netto @30 bps | > 0, dolna granica CI > 0 | −0.28% na kwartał [−2.52%; +1.89%] | ❌ FAIL |
| Degradacja IC IS→OOS | < 25%, IC IS > 0 | IS −0.005 → OOS −0.018 | ❌ FAIL |
| n_eff zespołu GA | > 3 | pełna ewolucja nieuruchomiona | ⚠️ BRAK POMIARU |
| Kalibracja confidence | monotoniczna, CI > 0 | kubełek 80–100% pusty; niemonotoniczna | ❌ FAIL |
| Testy trupów z kontrolą | wszystkie przechodzą, żaden pominięty | 1 niezaliczony (PG&E), 10 pominiętych | ❌ FAIL |

**0 PASS, 7 FAIL, 1 BRAK POMIARU.** Poprzedni `final_report.md` pokazywał 7 × PASS dla tych samych kryteriów bez żadnego pomiaru.

### 3.4 Szczegóły pomiarów

- **Purging** (`purging-report.md`): wypurgowano 7,69% puli treningowej (od 1,4% do 13,6% w foldzie), 0 wycieków, wiersz-pułapka usunięty w każdym foldzie.
- **Wagi bloków** (`block-weights.json`):
  - λ = 0.01, błąd walidacyjny L1 0.571 ± 0.232;
  - 7 niepustych foldów (2006–2007 pusty: brak XBRL);
  - IC in-sample −0.005, out-of-sample −0.018;
  - archetyp DEEP_VALUE_DISTRESSED (n = 177) zostaje przy priorze.
- **Profil dokładności** (`accuracy-profile.json`, mediana błędu ceny 12M OOS): VALUE_COMPOUNDER 0.307, FINANCIALS 0.333, INCOME 0.346, CYCLICAL 0.409, HYPER_GROWTH 0.548, DEEP_VALUE null (n < 200).
- **Benchmarki** (`benchmarks-report.md`). Model przegrywa ze wszystkimi czterema (dodatnia różnica = większy błąd modelu):

  | Benchmark | DM | Różnica strat [CI95] | IC benchmarku (t) |
  |---|---|---|---|
  | random walk | 10.69 | +0.485 [0.402; 0.567] | — |
  | równe wagi | 8.31 | +0.141 [0.110; 0.173] | −0.011 (−0.46) |
  | mediana C/Z sektora | 4.73 | +0.272 [0.167; 0.378] | −0.013 (−0.62) |
  | regresja 5 czynników | 11.37 | +0.521 [0.437; 0.605] | **+0.077 (3.18)** |

  Wytrenowane wagi bloków OOS też przegrywają z random walk: +0.287, IC −0.010.
- **Decyle** (`decile-report.md`):
  - spread brutto 12M +0.004 [−0.043; +0.056];
  - obrót kwartalny: long 30,3%, short 32,2%;
  - long/short netto rocznie: −1,2% / −2,3% / −3,8% przy 10 / 30 / 60 bps;
  - long-only top decyl rocznie: 19,0% / 18,4% / 17,6%, Sharpe 0,92 / 0,89 / 0,86;
  - ^GSPC (bez dywidend): 12,7% rocznie, Sharpe 1,01. Uniwersum jest obciążone przeżyciem, a long/short, który ten efekt neutralizuje, jest ujemny.
- **Kalibracja** (`calibration-report.md`): confidenceScore nigdy nie przekracza 0,6 (stała kara 0,15 za nieznane `pDefault`). Kubełek 40–50% ma 6 742 wiersze, 50–60% — 9, wyższe są puste. Spearman(confidence, −błąd) = 0,166, czyli słaba dodatnia zależność.
- **Różnorodność** (`ensemble-diversity.md`): ośmiu ekspertów wag bloków ma ρ̄ predykcji 0,833 i n_eff 1,17; ρ̄ wektorów wag 0,687. Zespół GA: brak pomiaru.
- **Stabilność** (`stability-report.md`): maks. odchylenie wagi 0,249 (DEEP_VALUE), dla archetypów z n ≥ 200 do 0,085. Rozrzut błędu walidacyjnego 2,55%, więc **wagi nie niosą informacji ekonomicznej**. Wskaźnik uwarunkowania macierzy korelacji wyjść modeli ≈ 3,9·10⁷ (silna współliniowość; ilorazy model/cena mają grube ogony, co wzmacnia korelacje Pearsona).
- **macroCap** (`macro-cap-report.md`): 0 aktywacji przy każdej z 5 wartości, identyczne IC. Mechanizm jest nieaktywny, bo żaden artefakt nie ma `macroModifiers`.
- **Archetypy** (`archetypes-history.md`): 95,8% spółek zmienia archetyp co najmniej raz; zmiana w 21,6% par kolejnych kwartałów.
- **Testy trupów** (`corpses-test.json`):
  - PG&E na 2018-11-15: FV 45,01 USD przy cenie 17,74 USD, werdykt **BUY** — test niezaliczony. Wycenę ciągną P/B i P/S ze stałymi mnożnikami; zobowiązania z pożarów nie były jeszcze w bilansie.
  - 10 testów pominiętych z braku danych XBRL w cache (Enron, Lehman, WaMu, Bear Stearns, GM, SVB, First Republic, Signature, HPH oraz porównanie z grupą kontrolną).
- **Test dymny GA** (`artifacts/evolve-smoke-test/`): populacja 6, 10 pokoleń, ekspert 4. Budowa uniwersum, workery, walidacja, ocena OOS i zapis artefaktów działają. Liczby z tego testu nie są wynikiem.
- **Weryfikacja kodu:** `npm run typecheck` bez błędów; `npm test` — 87 zaliczonych, 1 niezaliczony (PG&E, celowo zostawiony), 10 pominiętych.

### 3.5 Interpretacja

Po usunięciu fikcji i naprawie danych wycena fundamentalna w obecnej konfiguracji nie porządkuje spółek zgodnie z przyszłymi zwrotami (IC ≈ 0). Ma też duży błąd poziomu: systematycznie za wysoki upside, głównie przez stałe mnożniki P/B i P/S.

Na tych samych danych prosta regresja pięciu czynników ma istotny sygnał (IC 0.077, t 3.18). Problem nie leży więc wyłącznie w danych.

Kierunki, które wynikają z pomiarów:
1. Uzupełnić dane spółek usuniętych z indeksu (obciążenie przeżycia, model bankructwa).
2. Zastąpić stałe mnożniki medianami sektorowymi point-in-time.
3. Zredukować 10 współliniowych modeli do kilku ortogonalnych czynników przed ważeniem.
4. Rozważyć cel rankingowy zamiast odległości od ceny (D-01).

Sejfu 2023–2025 nie należy dotykać, dopóki kryteria nie przejdą na zbiorze walidacyjnym.

## 4. Czego nie da się zrobić bez człowieka

1. **Zrotuj klucz FRED.** Był wpisany w `src/macro-provider.ts` i trafił do eksportu. Użyłem go raz, przez zmienną środowiskową (bez zapisu do pliku), do pobrania `data/macro/fred-pit.json`. Nowy klucz wpisz do `.env`.
2. **Załóż repozytorium git i zatwierdź kod.** Bez tego `evaluate-holdout.ts` odmówi działania, zgodnie z T-11.
3. **Podejmij decyzje D-01 i D-02** (`docs/architecture-decisions.md`).
4. **Obciążenie przeżycia.** Dopóki w cache nie ma danych dla ~315 spółek usuniętych z indeksu, model bankructwa nie ma zdarzeń, a backtest patrzy głównie na spółki, które przetrwały.
5. **Nocny przebieg `npm run evolve`**, potem `report:diversity` i `report:gonogo`.
6. **Zaktualizuj zewnętrzny „raport architektoniczny”** według tabeli T-24. Nie ma go w folderze projektu.

## 5. Pliki

**Usunięte:**
- `scripts/final_evaluation.ts`, `final_report.md`
- `rename.js`, `make_validity.js`, `data/meta/ticker_cik_validity.json`
- `tests/transfer.test.ts`, `tests/svb.test.ts` (zastąpiony testem mechaniki korekty HTM)
- `scripts/test-macro-cap.ts` (atrapa), `scripts/compare-targets.ts`, `scripts/generate-report.ts` (parsowały wyjście, którego `train.ts` nie drukował)
- `scripts/optimize.ts` (czytał nieistniejące pole), `scripts/calibrate-expert.ts` (fitness na zmockowanym snapshocie)
- `scripts/wiki.ts` (nadpisywał `data/meta/sp500.json`), `src/universe.ts` (logika w `data-loader.ts`)
- jednorazowe skrypty z katalogu głównego: `test*.ts`, `check_cache.ts`, `test_accn.js` (UTF-16), `test-simulate.ts`, `test-evaluation.ts` (→ `tests/evaluation-harness.test.ts`)
- `corpse_reports.log`

**Przeniesione:**
- `holdout_log.json` → `artifacts/holdout_log.archived-2026-09-15.json` (+ nowy log z RESET)
- `report-t09.md`, `stability-report.md` → `archive/stale-reports/`
- `wiki*.html`, `wiki_changes.json`, `wiki2.mjs`, `tickers.json` → `archive/scraping/`
- `cik-lookup-data.txt` → `data/meta/cik-lookup-data.latest.txt`
- `probe-yahoo.ts`, `download-defaults.ts`, `resolve-bankruptcy-candidates*.ts`, `test_yahoo.ts` → `scripts/debug/`

**Nowe:**
- `src/`: `xbrl.ts`, `market-stats.ts`, `sectors.ts`, `stats.ts`, `purging.ts`, `block-model.ts`, `default-features.ts`, `default-model.ts`, `engine-config.ts`
- `scripts/`: `download-macro-fred.ts`, `build-accuracy-profile.ts`, `report-benchmarks.ts`, `report-deciles.ts`, `report-macro-cap.ts`, `report-gonogo.ts`, `ga.ts`, `migrations/reset-holdout-vault.ts`, `debug/inspect-cik.ts`
- `tests/`: `stats`, `purging`, `xbrl`, `evaluation-harness`, `book-value-adjustment`
- `docs/`: `data-splits`, `architecture-decisions`, `limitations`, `acceptance-criteria`, ten raport, `RAPORT-SYSTEMU`
- `.env.example`

**Przepisane:**
- `src/`: `data-loader`, `sec-edgar-provider`, `macro-provider`, `valuation-engine`, `archetypes`, `dataset`, `evaluation-harness`, `holdout-vault`, `portfolio`
- `scripts/`: `generate-dataset`, `report-dataset`, `train`, `train-default-model`, `evaluate-holdout`, `test-purging`, `report-calibration`, `test-ensemble-diversity`, `stability-test`, `simulate`, `evolve`, `replay-expert`, `report-archetypes`, `report-delisting`
- `tests/`: `corpses`, `dataset`, `macro-provider`
- `README.md`, `package.json`, `.gitignore`
