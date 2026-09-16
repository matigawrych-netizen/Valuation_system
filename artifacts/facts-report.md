# Fakty wspólne: wzrost, wielokrotność, szerokość błędu

Zbiór: **S&P 500 (skład indeksu point-in-time)**.

Wygenerowano: 2026-09-16T17:45:19.686Z.

Dane: panel `data/facts-panel.csv`, 19699 wierszy, z tego 13020 w okresie treningowym (do 2021).
Fakty oceniane są na **innych spółkach** niż te, na których się uczyły: 191 do nauki, 199 do pomiaru.

## 1. Wygasanie wzrostu

Ile z dotychczasowego tempa wzrostu przychodów (3 lata wstecz) utrzymuje się przez kolejne lata.
Współczynnik bliski 1 oznacza, że wzrost się utrzymuje; bliski 0 — że szybko wygasa do średniej.

| horyzont | stała | współczynnik trwałości | obserwacji | błąd dopasowania |
|---|---|---|---|---|
| 1 lat | 0.054 | 0.166 | 10317 | 0.157 |
| 2 lat | 0.053 | 0.126 | 10292 | 0.121 |
| 3 lat | 0.048 | 0.157 | 10275 | 0.096 |
| 4 lat | 0.046 | 0.162 | 10257 | 0.081 |
| 5 lat | 0.047 | 0.155 | 9903 | 0.072 |

## 2. Powrót wielokrotności

Ile z dzisiejszej wyceny (kapitalizacja / przychody, w skali logarytmicznej) zostaje po latach.
Współczynnik bliski 1 = wycena się utrzymuje; bliski 0 = wraca do poziomu typowego dla rynku.

| horyzont | stała | współczynnik trwałości | obserwacji | błąd dopasowania |
|---|---|---|---|---|
| 1 lat | 0.105 | 0.918 | 12820 | 0.337 |
| 2 lat | 0.160 | 0.882 | 12747 | 0.384 |
| 3 lat | 0.201 | 0.872 | 12718 | 0.399 |
| 4 lat | 0.240 | 0.854 | 12695 | 0.436 |
| 5 lat | 0.282 | 0.834 | 12315 | 0.481 |

## 3. Dryf liczby akcji

Mediana rocznej zmiany liczby akcji. Wartość ujemna = spółki średnio skupują własne akcje.

| horyzont | roczna zmiana | obserwacji |
|---|---|---|
| 1 lat | -0.90% | 12955 |
| 2 lat | -1.10% | 12930 |
| 3 lat | -1.14% | 12925 |
| 4 lat | -1.16% | 12923 |
| 5 lat | -1.18% | 12553 |

## 4. Szerokość błędu prognozy

Rozkład log(cena prawdziwa / cena przewidziana). Z centyli 10% i 90% powstaje pas 80%.

### Scenariusz A — rynek bez zmian (ta sama wielokrotność co dziś)

| horyzont | 10% | 25% | 50% | 75% | 90% | obserwacji |
|---|---|---|---|---|---|---|
| 1 lat | -0.270 | -0.108 | 0.035 | 0.170 | 0.311 | 10418 |
| 2 lat | -0.358 | -0.146 | 0.048 | 0.231 | 0.414 | 10418 |
| 3 lat | -0.394 | -0.153 | 0.069 | 0.286 | 0.508 | 10418 |
| 4 lat | -0.462 | -0.178 | 0.090 | 0.354 | 0.622 | 10418 |
| 5 lat | -0.531 | -0.204 | 0.104 | 0.423 | 0.735 | 10061 |

### Scenariusz B — powrót do wartości (wielokrotność wraca do typowej)

| horyzont | 10% | 25% | 50% | 75% | 90% | obserwacji |
|---|---|---|---|---|---|---|
| 1 lat | -0.310 | -0.142 | 0.002 | 0.143 | 0.289 | 10418 |
| 2 lat | -0.412 | -0.206 | -0.011 | 0.181 | 0.364 | 10418 |
| 3 lat | -0.495 | -0.247 | -0.022 | 0.202 | 0.429 | 10418 |
| 4 lat | -0.578 | -0.297 | -0.025 | 0.246 | 0.516 | 10418 |
| 5 lat | -0.671 | -0.354 | -0.037 | 0.285 | 0.591 | 10061 |

## 5. Kryterium K1: czy pas 80% naprawdę zawiera prawdziwą cenę w 80% przypadków

Pomiar na spółkach, których fakty nie widziały. Próg z preregistracji: **72–88%**.

Przedział ufności liczony bootstrapem po kwartałach, bo obserwacje z jednego kwartału są zależne.

### Scenariusz A — rynek bez zmian (ta sama wielokrotność co dziś)

| horyzont | pokrycie | CI95 | obserwacji | kwartałów | wynik |
|---|---|---|---|---|---|
| 1 lat | 81.5% | 77.7–84.6% | 5325 | 45 | PASS |
| 2 lat | 80.9% | 78.4–83.3% | 5325 | 45 | PASS |
| 3 lat | 80.7% | 78.8–82.7% | 5325 | 45 | PASS |
| 4 lat | 79.6% | 77.9–81.3% | 5325 | 45 | PASS |
| 5 lat | 79.1% | 77.7–80.6% | 5142 | 44 | PASS |

### Scenariusz B — powrót do wartości (wielokrotność wraca do typowej)

| horyzont | pokrycie | CI95 | obserwacji | kwartałów | wynik |
|---|---|---|---|---|---|
| 1 lat | 81.5% | 78.1–84.6% | 5325 | 45 | PASS |
| 2 lat | 81.2% | 79.2–83.2% | 5325 | 45 | PASS |
| 3 lat | 81.3% | 79.3–83.2% | 5325 | 45 | PASS |
| 4 lat | 79.2% | 77.4–81.1% | 5325 | 45 | PASS |
| 5 lat | 78.4% | 77.1–79.8% | 5142 | 44 | PASS |

### Czego ten pomiar NIE dowodzi

Podział jest **po spółkach, nie po czasie**: pasy uczyły się i były sprawdzane na tych samych latach.
Wynik mówi więc: „szerokość błędu przenosi się z jednych spółek na inne w okresie 2009–2021”.
Nie mówi: „pasy byłyby tak samo szerokie w roku krachu albo w latach 2022+”. Do tego służy sejf 2023–2025,
którego celowo nie dotykamy (limit 3 użyć, `docs/data-splits.md`).

Horyzonty 4–5 lat mają niewiele niezależnych okresów — wynik dla nich jest słabszym dowodem niż dla 1 roku.
Przy 45 kwartałach decyzji i horyzoncie 5 lat niezależnych okien jest około 3.
