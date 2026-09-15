# Kryteria akceptacji (preregistracja)

**Data zapisu: 2026-09-15.** Plik powstał przed wygenerowaniem artefaktów z metrykami, na których opiera się ocena Go/No-Go (`benchmarks-report.json`, `calibration-report.json`, `decile-report.json`, `ensemble-diversity.json`, `corpses-test.json`) i przed ponownym wygenerowaniem datasetu. Wcześniej istniał tylko raport modelu bankructwa, który nie jest kryterium poniżej.

Progi przepisano bez zmian z backlogu napraw (T-29), dostarczonego przez właściciela projektu. Nie zostały dobrane przez agenta ani poprawione po obejrzeniu wyników. Każda zmiana progu wymaga nowej daty i uzasadnienia w tym pliku, **przed** ponownym uruchomieniem raportów.

| # | Metryka | Próg | Źródło pomiaru |
|---|---|---|---|
| 1 | Test Diebolda-Mariano: model vs random walk | p < 0.0125 (Bonferroni na 4 benchmarki) **i** model ma mniejszą stratę | `artifacts/benchmarks-report.json` |
| 2 | Test Diebolda-Mariano: model vs równe wagi bloków | p < 0.0125 **i** model ma mniejszą stratę | `artifacts/benchmarks-report.json` |
| 3 | IC przekrojowy | `IC_t_stat > 2.0` | `artifacts/benchmarks-report.json` |
| 4 | Spread decylowy long/short netto przy 30 bps | > 0 **i** dolna granica CI95 > 0 | `artifacts/decile-report.json` |
| 5 | Degradacja IC in-sample → out-of-sample | < 25% względnie (przy dodatnim IC IS) | `artifacts/block-weights.json` (`cvMetrics`) |
| 6 | `n_eff` zespołu ekspertów algorytmu genetycznego | > 3 | `artifacts/ensemble-diversity.json` |
| 7 | Kalibracja `confidenceScore` | mediana błędu nierosnąca w kubełkach **i** dolna granica CI95 różnicy (40–60% minus 80–100%) > 0 | `artifacts/calibration-report.json` |
| 8 | Testy „trupów” z grupą kontrolną | wszystkie przechodzą, żaden nie jest pominięty | `artifacts/corpses-test.json` |

Doprecyzowania techniczne (nie zmieniają progów):
- Kryteria 1–2 wymagają także znaku, bo dwustronny test DM daje małe p również wtedy, gdy model jest istotnie **gorszy**.
- Wszystkie pomiary wykonuje się na okresie treningowym i walidacyjnym (`asOf` ≤ 2021). Zbioru holdout 2023–2025 dotyka wyłącznie `scripts/evaluate-holdout.ts`.
- Brak artefaktu oznacza „⚠️ BRAK POMIARU”, a nie PASS (`scripts/report-gonogo.ts`).
