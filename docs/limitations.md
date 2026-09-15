# Ograniczenia systemu

Lista jest uczciwa, nie marketingowa. Liczby pochodzą z artefaktów w `artifacts/`, a przy każdej podano plik źródłowy.

## Dane

1. **Obciążenie przeżycia (najpoważniejsze).** `index_membership.json` zawiera 343 spółki usunięte z indeksu. Pliki fundamentów i cen są w cache tylko dla 28 z nich (`artifacts/generate_stats.json`: 10 481 pozycji uniwersum odrzuconych z powodu braku pliku cen). Uniwersum historyczne składa się więc głównie ze spółek, które przetrwały do dziś. Wszystkie metryki backtestu są przez to zawyżone, a model bankructwa nie ma na czym się uczyć: 0 zdarzeń (`artifacts/default-model-report.md`). Naprawa wymaga pobrania danych SEC i cen dla spółek usuniętych, a ceny spółek zdelistowanych zwykle nie są dostępne w Yahoo.
2. **Brak danych as-filed sprzed XBRL.** Pierwszy wiersz datasetu ma datę 2009-05-15. Lata 2006–2008 i część 2009–2010 są puste (4 321 pozycji odrzuconych, bo najnowszy bilans znany w dniu decyzji był starszy niż 400 dni). Pierwsze bloki walk-forward są przez to ubogie.
3. **Recykling tickerów nie jest obsłużony mapowaniem w czasie.** Plik `ticker_cik_validity.json`, w którym każdy ticker był „ważny” od 1900 do 9999, był atrapą i został usunięty. Cały pipeline kluczuje spółki po CIK, a ticker służy tylko do wyświetlania. Mapowanie ticker→CIK przy pobieraniu danych (`scripts/download-cache.ts`) używa jednak bieżącej listy SEC.
4. **Sektor z bieżącego kodu SIC**, nie point-in-time. Dywizje SIC są też grube (np. Apple i Chevron trafiają do „Manufacturing”).
5. **Anomalie składu indeksu.** 20 wpisów ma `date_added > date_removed` i nigdy nie wchodzi do uniwersum (lista w `artifacts/generate_stats.json`).
6. **Liczba akcji spółek wieloklasowych.** Companyfacts pomija fakty z wymiarami, więc dla spółek z kilkoma klasami akcji `dei:EntityCommonStockSharesOutstanding` bywa nieobecne. System spada wtedy do `CommonStockSharesOutstanding` albo średniej rozwodnionej, co może zaniżyć lub zawyżyć wartości na akcję.
7. **Spread kredytowy HY (BAMLH0A0HYM2)**: FRED udostępnia tylko ostatnie ~3 lata, historycznie `creditSpread = null`. Seria miedzi nie jest pobierana (`CL` to ropa), więc `copperYoY = null` i gałęzie silnika zależne od miedzi są nieaktywne.
8. **Benchmark ^GSPC to indeks cenowy bez dywidend**, więc porównanie z S&P 500 zaniża benchmark o ok. 2 pp rocznie. Strategie liczone są na zwrotach całkowitych.

## Model

9. **Brak modelu prawdopodobieństwa bankructwa.** `pDefault = null` we wszystkich wycenach backtestu. Silnik nie modyfikuje wtedy wyceny, ale obniża `confidenceScore` o stałą karę 0.15.
10. **Progi archetypów i mnożniki „anchor” są arbitralne** (`src/archetypes.ts`, `ANCHOR_MULTIPLES`). Nie są kalibrowane na danych.
11. **Inflacja liczona podwójnie.** Wzrost przychodów i zysków z raportów jest już nominalny, a silnik przy znanym makro dodaje połowę CPI do wzrostu i połowę CPI do stopy dyskontowej. Rentowność 10Y też zawiera oczekiwania inflacyjne. Firmy, które nie przenoszą kosztów na klientów, mogą być lekko przeszacowane w reżimie wysokiej inflacji.
12. **Skrzywienie P/B przy ujemnym kapitale** (duże skupy akcji, np. Home Depot, Starbucks). P/B i liczba Grahama wypadają z wyceny, a system nie odróżnia takich spółek od faktycznie niewypłacalnych.
13. **Korekta HTM działa tylko dla spółek tagujących `HeldToMaturitySecurities` i `...FairValue`** (64 i 59 plików w cache). Straty na portfelach AFS są już w kapitale (AOCI) i nie są dodawane drugi raz.
14. **`macroCap` jest nieaktywny.** Żaden artefakt nie dostarcza `macroModifiers` (`artifacts/macro-cap-report.md`).
15. **Heurystyki Beneish M-Score i Piotroski F-Score** są liczone tylko przy komplecie wejść (inaczej `null`). Dla banków i spółek usługowych bez kosztu sprzedanych towarów zwykle wychodzi `null`.

## Ewaluacja

16. **Koszty transakcyjne**: 10/30/60 bps w jedną stronę bez modelu wpływu na rynek. W okresach paniki (VIX > 40) poślizg na mniejszych spółkach może być wielokrotnie wyższy.
17. **Etykiety 12M nachodzą się** przy próbkowaniu kwartalnym. Test DM uwzględnia to przez Newey-West z opóźnieniem 3, a bootstrapy losują całe kwartały. Spread brutto 12M ma mimo to zawyżoną efektywną liczbę obserwacji.
18. **Profil dokładności używany w `confidenceScore`** powstał z predykcji OOS na tych samych wierszach okresu treningowego, na których liczona jest kalibracja. Profil jest stały w obrębie archetypu, więc wpływa tylko na porównania między archetypami.
19. **Sejf holdout wymaga repozytorium git.** Katalog projektu nie jest repozytorium, dlatego `evaluate-holdout.ts` zakończy się kodem 1 bez zużycia dotknięcia, dopóki kod nie zostanie zatwierdzony w gicie.
