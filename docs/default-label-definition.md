# FD-02 D-02 — DECYZJA: definicja isDefault
Data utworzenia: 2026-09-15

Zmienna `isDefault` przyjmuje wartość 1, gdy zajdzie DOWOLNY z warunków:

A) `legal_bankruptcy`: spółka złożyła wniosek Chapter 7/11 (potwierdzone źródłem
   zewnętrznym, nie inferowane z samego usunięcia z indeksu).

B) `distress_proxy`: spółka została usunięta z indeksu z kodem przyczyny INNYM niż
   'acquisition' / 'merger' / 'index_rebalance', ORAZ w ciągu 12 miesięcy przed
   usunięciem jej kapitalizacja spadła o >85% względem TRAILING PEAK, gdzie
   trailing peak = maksimum kapitalizacji w oknie [asOf - 36m, asOf], liczone
   wyłącznie z danych dostępnych do 'asOf' (żadnego zaglądania w przyszłość
   względem punktu, dla którego liczymy cechę).
   LUB: Stockholders Equity < 0 w ostatnim dostępnym raporcie przed usunięciem.

Każdy wiersz z `isDefault=1` dostaje dodatkowe pole `defaultType`:
  `'legal_bankruptcy' | 'distress_proxy'`

Rozdzielenie jest obowiązkowe w każdym raporcie pochodnym (T-05, T-17, T-30) —
sanity check w T-30 ma pokazać medianę pDefault OSOBNO dla obu kategorii.

Ograniczenie czasowe: spółki z default w latach 2022-2025 (embargo + holdout wg
T-12) NIE wchodzą do zbioru treningowego default-modelu. Mogą być użyte
wyłącznie jako dane testowe w tests/corpses.test.ts (grupa spoza treningu).
