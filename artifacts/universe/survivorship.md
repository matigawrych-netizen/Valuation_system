# Krok (c2): pomiar błędu przetrwania

Wygenerowano: 2026-09-16T20:28:43.703Z. Definicja i progi zapisane przed pomiarem: `docs/plan-terminal.md`, krok (c2).

Miara: wartość akcji w wolnym obrocie z raportów rocznych SEC (`dei:EntityPublicFloat`), dostępna dla wszystkich
spółek — także tych, których notowań nie ma. Obserwacja: spółka z floatem ≥ 1 mld USD na dzień wyceny
z lat 2009–2021; wynik: zmiana tej wartości po h latach, gdy dzień t+h ≤ 2025-08-15.

## 1. Co się stało ze spółkami

| los spółki | 1 lat | 2 lat | 3 lat | 4 lat | 5 lat |
|---|---|---|---|---|---|
| przetrwała (wartość po h latach znana) | 19118 | 18190 | 17316 | 16373 | 14002 |
| upadłość, stare akcje zastąpione nowymi | 2 | 13 | 34 | 51 | 64 |
| upadłość i koniec raportowania | 0 | 9 | 40 | 76 | 88 |
| zniknęła z formularzem 25/15 (zwykle przejęcie) | 225 | 952 | 1648 | 2298 | 2632 |
| zniknęła bez formularza | 10 | 42 | 70 | 91 | 111 |
| pominięta: raportuje dalej, brak wartości | 1432 | 1581 | 1679 | 1713 | 1600 |
| pominięta: za końcem kompletnych danych | 0 | 0 | 0 | 185 | 2290 |

Udział spółek, które zniknęły w ciągu h lat (spośród przetrwałych i zniknięłych):

| przyczyna | 1 lat | 2 lat | 3 lat | 4 lat | 5 lat |
|---|---|---|---|---|---|
| upadłość | +0.0% | +0.1% | +0.4% | +0.7% | +0.9% |
| przejęcie / wycofanie | +1.2% | +5.0% | +8.6% | +12.2% | +15.6% |
| bez formularza | +0.1% | +0.2% | +0.4% | +0.5% | +0.7% |

## 2. Kontrola zastępnika: czy zmiana floatu odpowiada zmianie kursu

Te same obserwacje spółek z potwierdzonymi notowaniami. Próg użyteczności: 10. i 90. centyl różnią się o mniej niż 10 p.p.

| horyzont | obserwacji | 10. centyl — float | 10. centyl — kurs | 90. centyl — float | 90. centyl — kurs | wynik |
|---|---|---|---|---|---|---|
| 1 lat | 11914 | -33% | -30% | +65% | +55% | użyteczny |
| 2 lat | 11855 | -39% | -35% | +96% | +82% | NIEUŻYTECZNY |
| 3 lat | 11801 | -42% | -39% | +131% | +114% | NIEUŻYTECZNY |
| 4 lat | 11647 | -47% | -44% | +173% | +153% | NIEUŻYTECZNY |
| 5 lat | 10258 | -45% | -42% | +226% | +203% | NIEUŻYTECZNY |

## 3. Rozkład zmiany wartości: ocalałe kontra wszystkie

Wariant podstawowy: upadłość −99%, przejęcie i zniknięcie bez formularza — ostatnia znana wartość.
Wariant alternatywny: upadłość −70%, przejęcie +30%, zniknięcie bez formularza −50%.

### 1 lat

| grupa | obserwacji | 10. centyl | 25. centyl | 50. centyl | 75. centyl | 90. centyl |
|---|---|---|---|---|---|---|
| A — ocalałe | 19118 | -39% | -15% | +7% | +31% | +64% |
| B — wszystkie (podstawowy) | 19355 | -39% | -15% | +6% | +31% | +64% |
| B — wszystkie (alternatywny) | 19355 | -39% | -15% | +7% | +31% | +64% |

### 2 lat

| grupa | obserwacji | 10. centyl | 25. centyl | 50. centyl | 75. centyl | 90. centyl |
|---|---|---|---|---|---|---|
| A — ocalałe | 18190 | -48% | -18% | +14% | +48% | +96% |
| B — wszystkie (podstawowy) | 19206 | -47% | -16% | +11% | +46% | +93% |
| B — wszystkie (alternatywny) | 19206 | -48% | -16% | +16% | +46% | +94% |

### 3 lat

| grupa | obserwacji | 10. centyl | 25. centyl | 50. centyl | 75. centyl | 90. centyl |
|---|---|---|---|---|---|---|
| A — ocalałe | 17316 | -53% | -18% | +20% | +65% | +128% |
| B — wszystkie (podstawowy) | 19108 | -52% | -17% | +16% | +60% | +122% |
| B — wszystkie (alternatywny) | 19108 | -52% | -16% | +24% | +63% | +124% |

### 4 lat

| grupa | obserwacji | 10. centyl | 25. centyl | 50. centyl | 75. centyl | 90. centyl |
|---|---|---|---|---|---|---|
| A — ocalałe | 16373 | -57% | -18% | +28% | +84% | +168% |
| B — wszystkie (podstawowy) | 18889 | -57% | -18% | +20% | +77% | +155% |
| B — wszystkie (alternatywny) | 18889 | -57% | -17% | +30% | +80% | +159% |

### 5 lat

| grupa | obserwacji | 10. centyl | 25. centyl | 50. centyl | 75. centyl | 90. centyl |
|---|---|---|---|---|---|---|
| A — ocalałe | 14002 | -57% | -16% | +37% | +109% | +216% |
| B — wszystkie (podstawowy) | 16897 | -58% | -16% | +26% | +96% | +196% |
| B — wszystkie (alternatywny) | 16897 | -57% | -14% | +32% | +101% | +200% |

## 4. Kryterium S1: czy błąd przetrwania jest istotny

Próg: 10. centyl w grupie B (wariant podstawowy) niżej niż w grupie A o ≥ 5 p.p. dla któregokolwiek horyzontu.

| horyzont | różnica 10. centyla (B − A) | CI95 (bootstrap po miesiącach wyceny) | istotny? |
|---|---|---|---|
| 1 lat | +0.3 p.p. | +0.1 p.p. … +0.5 p.p. | nie |
| 2 lat | +0.8 p.p. | +0.4 p.p. … +1.3 p.p. | nie |
| 3 lat | +0.6 p.p. | -0.1 p.p. … +1.3 p.p. | nie |
| 4 lat | -0.3 p.p. | -1.3 p.p. … +0.6 p.p. | nie |
| 5 lat | -1.0 p.p. | -1.8 p.p. … +0.1 p.p. | nie |

**Wynik S1: nieistotny — pasy nie wymagają poprawki.**

## 5. Kryterium K1b: pas 80% z ocalałych sprawdzony na wszystkich spółkach

Próg: pokrycie ≥ 72% dla każdego horyzontu. Na grupie A pokrycie wynosi ok. 80% z definicji.

| horyzont | A — ocalałe | B — podstawowy | B — alternatywny | wynik (podstawowy) |
|---|---|---|---|---|
| 1 lat | +80.0% | +80.2% | +80.2% | PASS |
| 2 lat | +80.0% | +80.7% | +80.5% | PASS |
| 3 lat | +80.0% | +80.9% | +80.7% | PASS |
| 4 lat | +80.0% | +81.0% | +80.9% | PASS |
| 5 lat | +80.0% | +81.2% | +81.1% | PASS |

**Wynik K1b: PASS.** Preregistracja nie wskazała wariantu, więc werdykt dotyczy wariantu podstawowego, a alternatywny jest pokazany obok.

## 6. Ograniczenia

- Float nie obejmuje akcji osób powiązanych ze spółką; zmienia się też przy ich sprzedaży. Dlatego sprawdzamy go względem kursów (sekcja 2).
- Wartość końcowa spółek, które zniknęły, jest założeniem, a nie pomiarem — stąd dwa warianty.
- Dane roczne: zmiana wartości w środku roku przed zniknięciem spółki nie jest widoczna.
- Horyzonty 4–5 lat mają mało niezależnych okresów.
