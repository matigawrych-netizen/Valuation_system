# Valuation System 2.0

System fundamentalnej wyceny spółek z USA (TypeScript, Node 18+, ESM, `tsx`, `vitest`). Działa w dwóch trybach.

1. **Wycena bieżąca (API):** `src/server.ts` wystawia `GET /api/valuation/:ticker`. Dane pochodzą z Yahoo Finance (`yahoo-finance2`), a makro z FRED. Plik Next.js do wklejenia: `nextjs-drop-in/`.
2. **Backtest point-in-time:** dla składu S&P 500 z dnia decyzji i każdego kwartału 2009–2025 system odtwarza, co było publicznie wiadomo (SEC XBRL filtrowane datą przyjęcia raportu, ceny, makro z ALFRED). Na tej podstawie liczy wycenę i porównuje ją ze zrealizowanymi zwrotami.

**Pełny opis działania:** [`docs/RAPORT-SYSTEMU.md`](docs/RAPORT-SYSTEMU.md). **Co zmieniono i dlaczego:** [`docs/RAPORT-ZMIAN.md`](docs/RAPORT-ZMIAN.md).

> README nie zawiera żadnych metryk wydajności. Wszystkie liczby wynikowe są w plikach `artifacts/*` generowanych przez skrypty poniżej, a zbiorczo w `artifacts/gonogo-report.md`. Poprzednia tabela „First results” i raport `final_report.md` zostały usunięte: pierwsza nie miała artefaktu źródłowego, a w drugim wszystkie liczby były wpisane na stałe w kodzie.

## Jak działa wycena (skrót)

1. **Archetyp:** miękkie przypisanie do 6 archetypów (`src/archetypes.ts`).
2. **10 modeli wyceny:** DCF, liczba Grahama, DDM, PEG, EV/EBITDA, P/B, rentowność FCF, EPV, P/S, wartość likwidacyjna. Są pogrupowane w 4 bloki, a w bloku liczona jest mediana.
3. **Wagi:** macierz wag archetyp × blok (prior ekspercki `WEIGHT_MATRIX` albo wagi wytrenowane) daje Fair Value, a na nią nakładane są korekty jakości zysków.
4. **Margines bezpieczeństwa:** z bety, trendu, zakresu 52W i VIX powstaje Entry Target, a z niego werdykt BUY/HOLD/SELL.
5. **confidenceScore:** łączy pokrycie modeli, dokładność OOS archetypu, ryzyko bankructwa, świeżość danych i VIX.

## Pipeline backtestu

Wymaga cache w `data/` (fundamenty SEC, ceny, skład indeksu, `accnMap.json`) oraz klucza `FRED_API_KEY` (patrz `.env.example`).

```bash
npm run download:macro        # makro point-in-time z FRED/ALFRED -> data/macro/fred-pit.json
npm run train:default-model   # model bankructwa (dziś: za mało zdarzeń w danych -> model nie powstaje)
npm run dataset               # data/backtest-results.csv + data/snapshots.jsonl
npm run report:dataset        # bramka T-06
npm run train                 # wagi bloków, walk-forward z purgingiem
npm run accuracy-profile      # dokładność OOS per archetyp
npm run dataset               # ponownie, żeby confidenceScore używał profilu dokładności
npm run test:purging
npm run report:calibration
npm run report:benchmarks     # test Diebolda-Mariano vs 4 benchmarki
npm run report:deciles        # spread decylowy netto po kosztach
npm run report:diversity
npm run report:stability
npm run report:macro-cap
npm run report:corpses        # testy upadłych spółek -> artifacts/corpses-test.json
npm run report:gonogo         # tabela Go/No-Go z artefaktów
npm run evolve                # algorytm genetyczny (godziny); test dymny: EVOLVE_POP=6 EVOLVE_GENS=2 EVOLVE_EXPERTS=0
npm run holdout -- "opis"     # jedyne dotknięcie zbioru 2023–2025 (wymaga czystego repo git)
```

## Struktura

| Ścieżka | Zawartość |
|---|---|
| `src/valuation-engine.ts` | silnik wyceny (bez zależności od źródła danych) |
| `src/sec-edgar-provider.ts`, `src/xbrl.ts` | XBRL → snapshot: TTM, liczba akcji z `dei`, F/M-Score, cechy bankructwa |
| `src/data-loader.ts`, `src/market-stats.ts` | cache, filtr point-in-time, beta/SMA200/52W z historii cen |
| `src/macro-provider.ts` | makro na żywo (FRED) i z cache ALFRED (`getMacroAsOf`) |
| `src/paths.ts` | wszystkie ścieżki artefaktów i granice podziału danych |
| `src/purging.ts`, `src/block-model.ts`, `src/stats.ts` | walk-forward, wagi bloków, statystyka (Spearman, DM, bootstrap) |
| `src/holdout-vault.ts` | sejf zbioru holdout |
| `scripts/` | pipeline i raporty (lista wyżej); `scripts/debug/` to narzędzia ręczne |
| `tests/` | testy jednostkowe i testy upadłych spółek na danych z cache |
| `docs/` | decyzje, podział danych, ograniczenia, kryteria akceptacji, raporty |
| `archive/` | nieaktualne raporty i zrzuty scrapingu (zachowane, nieużywane) |
