# Fakty wspólne: wzrost, wielokrotność, szerokość błędu

Wygenerowano: 2026-09-16T00:09:40.796Z.

Dane: panel `data/facts-panel.csv`, 20852 wierszy, z tego 13812 w okresie treningowym (do 2021).
Fakty oceniane są na **innych spółkach** niż te, na których się uczyły: 193 do nauki, 199 do pomiaru.

## 1. Wygasanie wzrostu

Ile z dotychczasowego tempa wzrostu przychodów (3 lata wstecz) utrzymuje się przez kolejne lata.
Współczynnik bliski 1 oznacza, że wzrost się utrzymuje; bliski 0 — że szybko wygasa do średniej.

| horyzont | stała | współczynnik trwałości | obserwacji | błąd dopasowania |
|---|---|---|---|---|
| 1 lat | 0.054 | 0.174 | 11033 | 0.158 |
| 2 lat | 0.053 | 0.134 | 11040 | 0.121 |
| 3 lat | 0.048 | 0.162 | 11040 | 0.096 |
| 4 lat | 0.047 | 0.170 | 11040 | 0.080 |
| 5 lat | 0.047 | 0.164 | 10663 | 0.071 |

## 2. Powrót wielokrotności

Ile z dzisiejszej wyceny (kapitalizacja / przychody, w skali logarytmicznej) zostaje po latach.
Współczynnik bliski 1 = wycena się utrzymuje; bliski 0 = wraca do poziomu typowego dla rynku.

| horyzont | stała | współczynnik trwałości | obserwacji | błąd dopasowania |
|---|---|---|---|---|
| 1 lat | 0.104 | 0.920 | 13778 | 0.338 |
| 2 lat | 0.157 | 0.888 | 13770 | 0.385 |
| 3 lat | 0.197 | 0.878 | 13782 | 0.400 |
| 4 lat | 0.233 | 0.862 | 13792 | 0.438 |
| 5 lat | 0.277 | 0.842 | 13401 | 0.485 |

## 3. Dryf liczby akcji

Mediana rocznej zmiany liczby akcji. Wartość ujemna = spółki średnio skupują własne akcje.

| horyzont | roczna zmiana | obserwacji |
|---|---|---|
| 1 lat | -0.76% | 13805 |
| 2 lat | -0.95% | 13805 |
| 3 lat | -1.01% | 13808 |
| 4 lat | -1.02% | 13810 |
| 5 lat | -1.05% | 13419 |

## 4. Szerokość błędu prognozy

Rozkład log(cena prawdziwa / cena przewidziana). Z centyli 10% i 90% powstaje pas 80%.

### Scenariusz A — rynek bez zmian (ta sama wielokrotność co dziś)

| horyzont | 10% | 25% | 50% | 75% | 90% | obserwacji |
|---|---|---|---|---|---|---|
| 1 lat | -0.269 | -0.107 | 0.037 | 0.171 | 0.309 | 11049 |
| 2 lat | -0.359 | -0.145 | 0.051 | 0.234 | 0.417 | 11049 |
| 3 lat | -0.397 | -0.152 | 0.071 | 0.290 | 0.508 | 11049 |
| 4 lat | -0.468 | -0.177 | 0.093 | 0.356 | 0.621 | 11049 |
| 5 lat | -0.537 | -0.204 | 0.108 | 0.424 | 0.734 | 10672 |

### Scenariusz B — powrót do wartości (wielokrotność wraca do typowej)

| horyzont | 10% | 25% | 50% | 75% | 90% | obserwacji |
|---|---|---|---|---|---|---|
| 1 lat | -0.311 | -0.142 | 0.002 | 0.145 | 0.290 | 11049 |
| 2 lat | -0.416 | -0.205 | -0.009 | 0.184 | 0.366 | 11049 |
| 3 lat | -0.496 | -0.247 | -0.019 | 0.206 | 0.433 | 11049 |
| 4 lat | -0.577 | -0.296 | -0.020 | 0.249 | 0.522 | 11049 |
| 5 lat | -0.676 | -0.354 | -0.034 | 0.291 | 0.596 | 10672 |

## 5. Kryterium K1: czy pas 80% naprawdę zawiera prawdziwą cenę w 80% przypadków

Pomiar na spółkach, których fakty nie widziały. Próg z preregistracji: **72–88%**.

Przedział ufności liczony bootstrapem po kwartałach, bo obserwacje z jednego kwartału są zależne.

### Scenariusz A — rynek bez zmian (ta sama wielokrotność co dziś)

| horyzont | pokrycie | CI95 | obserwacji | kwartałów | wynik |
|---|---|---|---|---|---|
| 1 lat | 81.7% | 77.9–84.8% | 5701 | 45 | PASS |
| 2 lat | 81.0% | 78.5–83.3% | 5701 | 45 | PASS |
| 3 lat | 80.6% | 78.6–82.6% | 5701 | 45 | PASS |
| 4 lat | 79.9% | 78.1–81.5% | 5701 | 45 | PASS |
| 5 lat | 79.3% | 77.8–80.9% | 5508 | 44 | PASS |

### Scenariusz B — powrót do wartości (wielokrotność wraca do typowej)

| horyzont | pokrycie | CI95 | obserwacji | kwartałów | wynik |
|---|---|---|---|---|---|
| 1 lat | 81.3% | 78.0–84.5% | 5701 | 45 | PASS |
| 2 lat | 80.7% | 78.7–82.7% | 5701 | 45 | PASS |
| 3 lat | 80.7% | 78.8–82.5% | 5701 | 45 | PASS |
| 4 lat | 78.8% | 77.0–80.6% | 5701 | 45 | PASS |
| 5 lat | 78.4% | 77.2–79.6% | 5508 | 44 | PASS |

### Czego ten pomiar NIE dowodzi

Podział jest **po spółkach, nie po czasie**: pasy uczyły się i były sprawdzane na tych samych latach.
Wynik mówi więc: „szerokość błędu przenosi się z jednych spółek na inne w okresie 2009–2021”.
Nie mówi: „pasy byłyby tak samo szerokie w roku krachu albo w latach 2022+”. Do tego służy sejf 2023–2025,
którego celowo nie dotykamy (limit 3 użyć, `docs/data-splits.md`).

Horyzonty 4–5 lat mają niewiele niezależnych okresów — wynik dla nich jest słabszym dowodem niż dla 1 roku.
Przy 45 kwartałach decyzji i horyzoncie 5 lat niezależnych okien jest około 3.
