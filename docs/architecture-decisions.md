# Decyzje architektoniczne

## D-01 — Dwie ścieżki treningowe (STATUS: propozycja, wymaga zatwierdzenia przez właściciela projektu)

Backlog wskazuje tę decyzję jako decyzję człowieka. Do czasu jej podjęcia kod realizuje rekomendację z backlogu, bez nieodwracalnych kroków:

| | `scripts/evolve.ts` | `scripts/train.ts` |
|---|---|---|
| Cel optymalizacji | fitness portfela: Sortino, alfa roczna, obsunięcie (każdy człon w [0,1]) | L1 między ważoną wyceną bloków a ceną za 12M |
| Rola (propozycja) | **ścieżka produkcyjna** — ocenia ekonomiczne skutki decyzji | **narzędzie diagnostyczne**: IC bloków, degradacja IS→OOS, wagi do jednorazowej oceny holdoutu |
| Artefakt | `artifacts/ENSEMBLE_WEIGHTS.json` (metryki train/val/OOS dla każdego eksperta) | `artifacts/block-weights.json`, `artifacts/oos-predictions.csv` |

Zastrzeżenie merytoryczne wobec `train.ts`, które pozostaje aktualne. Przy `Σw = 1` minimalizacja `|FV/cena − (1 + zwrot)|` ciągnie Fair Value w stronę ceny rynkowej przemnożonej przez stałą. Wagi optymalne dla tej straty nie muszą więc mieć interpretacji ekonomicznej. Ocenia to raport stabilności (`artifacts/stability-report.md`).

Jeśli właściciel wybierze odwrotnie (`train.ts` jako ścieżka produkcyjna), cel `train.ts` trzeba zmienić na wielkość niebędącą ceną, np. przekrojowy ranking zwrotów nadwyżkowych albo zrealizowane FCF.

## D-02 — Definicja zdarzenia bankructwa

Treść: [`default-label-definition.md`](default-label-definition.md). Interpretacja wymagająca zatwierdzenia:
- W `index_membership.json` nie ma kodu `index_rebalance`, wymienionego w definicji.
- Kod `index_decision` nie jest wykluczany. Usunięcie decyzją komitetu połączone ze spadkiem kapitalizacji > 85% albo ujemnym kapitałem liczy się jako `distress_proxy`.

Stan faktyczny: w dostępnych danych nie ma ani jednego pozytywnego przypadku, więc model nie jest trenowany (`artifacts/default-model-report.md`).

## D-03 — Sektor z kodu SIC (decyzja agenta, do przeglądu)

Brak klasyfikacji GICS był opisany jako ograniczenie nie do usunięcia. Plik SEC `submissions/CIK*.json`, obecny w cache, zawiera jednak kod SIC. System mapuje go na dywizje SIC (`src/sectors.ts`): SIC 6000–6799 → `Financial Services`, co zasila kryterium archetypu banków.

Kompromis: SIC w pliku to stan bieżący, nie point-in-time. SIC zmienia się rzadko, ale to znane, drobne źródło look-ahead (patrz `limitations.md`).

## D-04 — Dataset zachowuje wiersze o niskiej pewności

Dawniej wiersze `lowConfidence || validModelCount < 3` były odrzucane po cichu (11 115 z 26 011). Teraz trafiają do CSV z flagą `lowConfidence`, a konsumenci filtrują je jawnie. Liczby są w raporcie datasetu.

## D-05 — Fitness GA używa alfy rocznej

Backlog proponuje przycięcie alfy do ±0.5. Alfa całkowita nie jest porównywalna między okresem treningowym (kilkanaście lat) a blokami walidacyjnym i testowym (po 2 lata). Dlatego przycinana jest alfa **roczna**.

## D-06 — Symulacja z maskowaniem liczona segmentami

Na końcu każdego ciągłego segmentu kwartałów portfel jest likwidowany, a kolejny segment startuje z gotówki. Dawniej pozycje „przeskakiwały” przez zamaskowany blok, więc portfel zarabiał zwrot z okresu, który miał być ukryty. Alfa była też liczona względem S&P 500 za cały okres 2006–2024, a nie za te same kwartały.
