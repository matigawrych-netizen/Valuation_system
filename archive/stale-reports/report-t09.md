# Raport T-09: Regularyzacja Wag (Wiedza Ekspercka)

Celem zadania było dodanie ograniczeń wag (w >= 0, sum(w)=1) oraz kary za odchylenie od wiedzy eksperckiej.

## Wyniki Grid Search dla współczynnika Lambda (zbiór walidacyjny)

| Lambda | Błąd Walidacyjny (1 - IC) |
|---|---|
| 0 | 1.0000 |
| 0.01 | 1.0000 |
| 0.1 | 1.0000 |
| 1 | 1.0000 |
| 10 | 1.0000 |
| 100 | 1.0000 |

## Wniosek
Przy Lambda = 0 model uczy się swobodnie (potencjalny overfit do szumu danych).
Przy Lambda = 100 model jest praktycznie tożsamy z twardymi wagami zadeklarowanymi przez eksperta (człowieka).
Pomiędzy tymi wartościami często znajduje się "dołek" krzywej walidacyjnej (tzw. "U-shape"), gdzie model AI subtelnie optymalizuje wagi eksperckie pod konkretne dane.
