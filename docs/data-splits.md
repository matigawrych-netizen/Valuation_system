# Podział danych w czasie

**Decyzja z 2026-09-15** (T-12). Jedno źródło prawdy: stałe w [`src/paths.ts`](../src/paths.ts). W kodzie nie ma literałów lat poza tym plikiem i danymi testowymi.

| Okres | Lata daty decyzji (`asOf`) | Stała | Do czego służy |
|---|---|---|---|
| Trening + walidacja walk-forward | 2006–2021 | `DATA_START_YEAR`, `TRAIN_END_YEAR` | trening wag bloków, model bankructwa, algorytm genetyczny, wszystkie raporty Go/No-Go |
| Embargo | 2022 | `EMBARGO_YEAR` | nieużywany do uczenia. Wspólny zbiór do porównania ekspertów (różnorodność zespołu) |
| Holdout („sejf”) | 2023–2025 | `HOLDOUT_START_YEAR`, `HOLDOUT_END_YEAR` | wyłącznie `scripts/evaluate-holdout.ts`, maksymalnie 3 dotknięcia |

Rok okresu wyznacza **data decyzji** (`asOf`), a nie kwartał fiskalny. Przykład: Q4 2021 ma datę decyzji 2022-02-15, więc należy do embargo.

## Oś czasu

`buildQuarterlyTimeline(startYear, endYear)` zwraca 4 daty decyzji na rok fiskalny: koniec kwartału plus około 45 dni, czyli typowe opóźnienie publikacji 10-Q (Q1 → `YYYY-05-15`, Q2 → `YYYY-08-15`, Q3 → `YYYY-11-15`, Q4 → `(YYYY+1)-02-15`). Dla 2006–2025 daje to 80 dat.

W praktyce pierwszy wiersz datasetu ma datę 2009-05-15. Fakty XBRL są filtrowane datą przyjęcia raportu przez EDGAR, a przed obowiązkiem XBRL (2009–2011) raportów po prostu nie ma. Liczby sprzed 2009 widoczne w companyfacts pochodzą z późniejszych raportów (dane porównawcze), więc na datę 2006–2008 nie były publicznie znane.

## Walk-forward CV

`MASK_PERIODS` to 8 dwuletnich bloków: 2006–07, 2008–09, 2010–11, 2012–13, 2014–15, 2016–17, 2018–19, 2020–21. `assertMaskPeriodsWithinTraining` rzuca wyjątek, jeśli blok wykracza poza `TRAIN_END_YEAR` (wywoływane w `train.ts` i `evolve.ts`).

Dla bloku testowego `[start, end]` obserwacja treningowa jest usuwana (`src/purging.ts`), gdy:
- okno etykiety `[asOf, asOf + 12M]` przecina blok, albo
- `asOf` leży w embargo `(end, end + 3M)`.

Test `tests/purging.test.ts` sprawdza wynik niezależnym sformułowaniem warunku. Zawiera też dwa testy negatywne:
- sztuczny wiersz z datą `testStart − 6M` musi zostać usunięty;
- podział bez purgingu musi zostać wykryty jako wyciek.

Algorytm genetyczny dodatkowo odkłada blok walidacyjny: dla eksperta *i* jest to poprzedni blok, a dla pierwszego eksperta — następny. Na nim wybierany jest najlepszy genom. Blok testowy jest używany dokładnie raz, na końcu.

## Horyzont etykiety

Etykieta to zwrot całkowity (adjclose) za 12 miesięcy od daty decyzji. Dla daty decyzji z 2025 r. horyzont może wychodzić poza ostatnie notowanie w cache. Takie wiersze nie trafiają do datasetu, a ich liczba jest raportowana w `artifacts/dataset-report.md`.
