# Fakty wspólne: wzrost, wielokrotność, szerokość błędu

Zbiór: **pełne uniwersum (NYSE + Nasdaq, kapitalizacja ≥ 1 mld USD)**.

Wygenerowano: 2026-09-16T19:06:32.842Z.

Dane: panel `E:/gówno aaaaa/valuation-data/panel/facts-panel.csv`, 63590 wierszy, z tego 40199 w okresie treningowym (do 2021).
Fakty oceniane są na **innych spółkach** niż te, na których się uczyły: 769 do nauki, 768 do pomiaru.

## 1. Wygasanie wzrostu

Ile z dotychczasowego tempa wzrostu przychodów (3 lata wstecz) utrzymuje się przez kolejne lata.
Współczynnik bliski 1 oznacza, że wzrost się utrzymuje; bliski 0 — że szybko wygasa do średniej.

| horyzont | stała | współczynnik trwałości | obserwacji | błąd dopasowania |
|---|---|---|---|---|
| 1 lat | 0.079 | 0.193 | 30443 | 0.243 |
| 2 lat | 0.068 | 0.143 | 30369 | 0.172 |
| 3 lat | 0.060 | 0.133 | 30341 | 0.133 |
| 4 lat | 0.056 | 0.123 | 30295 | 0.110 |
| 5 lat | 0.054 | 0.119 | 29074 | 0.097 |

## 2. Powrót wielokrotności

Ile z dzisiejszej wyceny (kapitalizacja / przychody, w skali logarytmicznej) zostaje po latach.
Współczynnik bliski 1 = wycena się utrzymuje; bliski 0 = wraca do poziomu typowego dla rynku.

| horyzont | stała | współczynnik trwałości | obserwacji | błąd dopasowania |
|---|---|---|---|---|
| 1 lat | 0.070 | 0.881 | 39430 | 0.465 |
| 2 lat | 0.102 | 0.816 | 39239 | 0.555 |
| 3 lat | 0.124 | 0.777 | 39143 | 0.606 |
| 4 lat | 0.130 | 0.749 | 39053 | 0.666 |
| 5 lat | 0.147 | 0.728 | 37662 | 0.721 |

## 3. Dryf liczby akcji

Mediana rocznej zmiany liczby akcji. Wartość ujemna = spółki średnio skupują własne akcje.

| horyzont | roczna zmiana | obserwacji |
|---|---|---|
| 1 lat | 0.03% | 40044 |
| 2 lat | -0.20% | 39985 |
| 3 lat | -0.34% | 39948 |
| 4 lat | -0.41% | 39918 |
| 5 lat | -0.47% | 38544 |

## 4. Szerokość błędu prognozy

Rozkład log(cena prawdziwa / cena przewidziana). Z centyli 10% i 90% powstaje pas 80%.

### Scenariusz A — rynek bez zmian (ta sama wielokrotność co dziś)

| horyzont | 10% | 25% | 50% | 75% | 90% | obserwacji |
|---|---|---|---|---|---|---|
| 1 lat | -0.442 | -0.206 | -0.013 | 0.152 | 0.330 | 30763 |
| 2 lat | -0.624 | -0.282 | -0.019 | 0.209 | 0.435 | 30763 |
| 3 lat | -0.736 | -0.326 | -0.009 | 0.263 | 0.534 | 30763 |
| 4 lat | -0.914 | -0.390 | -0.014 | 0.320 | 0.639 | 30763 |
| 5 lat | -1.032 | -0.444 | -0.011 | 0.378 | 0.757 | 29520 |

### Scenariusz B — powrót do wartości (wielokrotność wraca do typowej)

| horyzont | 10% | 25% | 50% | 75% | 90% | obserwacji |
|---|---|---|---|---|---|---|
| 1 lat | -0.446 | -0.199 | 0.009 | 0.189 | 0.379 | 30763 |
| 2 lat | -0.619 | -0.264 | 0.017 | 0.267 | 0.507 | 30763 |
| 3 lat | -0.730 | -0.314 | 0.028 | 0.332 | 0.620 | 30763 |
| 4 lat | -0.883 | -0.366 | 0.039 | 0.403 | 0.744 | 30763 |
| 5 lat | -1.013 | -0.421 | 0.042 | 0.455 | 0.840 | 29520 |

## 5. Kryterium K1: czy pas 80% naprawdę zawiera prawdziwą cenę w 80% przypadków

Pomiar na spółkach, których fakty nie widziały. Próg z preregistracji: **72–88%**.

Przedział ufności liczony bootstrapem po kwartałach, bo obserwacje z jednego kwartału są zależne.

### Scenariusz A — rynek bez zmian (ta sama wielokrotność co dziś)

| horyzont | pokrycie | CI95 | obserwacji | kwartałów | wynik |
|---|---|---|---|---|---|
| 1 lat | 79.7% | 76.0–82.7% | 14961 | 45 | PASS |
| 2 lat | 79.9% | 77.9–82.0% | 14961 | 45 | PASS |
| 3 lat | 79.8% | 78.1–81.5% | 14961 | 45 | PASS |
| 4 lat | 80.4% | 78.6–82.3% | 14961 | 45 | PASS |
| 5 lat | 80.7% | 78.9–82.5% | 14346 | 44 | PASS |

### Scenariusz B — powrót do wartości (wielokrotność wraca do typowej)

| horyzont | pokrycie | CI95 | obserwacji | kwartałów | wynik |
|---|---|---|---|---|---|
| 1 lat | 80.5% | 77.4–83.2% | 14961 | 45 | PASS |
| 2 lat | 80.2% | 78.5–81.8% | 14961 | 45 | PASS |
| 3 lat | 81.1% | 79.6–82.7% | 14961 | 45 | PASS |
| 4 lat | 81.0% | 79.5–82.6% | 14961 | 45 | PASS |
| 5 lat | 81.5% | 80.2–82.9% | 14346 | 44 | PASS |

### Czego ten pomiar NIE dowodzi

Podział jest **po spółkach, nie po czasie**: pasy uczyły się i były sprawdzane na tych samych latach.
Wynik mówi więc: „szerokość błędu przenosi się z jednych spółek na inne w okresie 2009–2021”.
Nie mówi: „pasy byłyby tak samo szerokie w roku krachu albo w latach 2022+”. Do tego służy sejf 2023–2025,
którego celowo nie dotykamy (limit 3 użyć, `docs/data-splits.md`).

Horyzonty 4–5 lat mają niewiele niezależnych okresów — wynik dla nich jest słabszym dowodem niż dla 1 roku.
Przy 45 kwartałach decyzji i horyzoncie 5 lat niezależnych okien jest około 3.
