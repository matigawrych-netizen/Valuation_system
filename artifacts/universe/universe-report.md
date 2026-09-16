# Krok (c): pełne uniwersum NYSE + Nasdaq

Wygenerowano: 2026-09-16T19:19:33.385Z. Dane: `UNIVERSE_DATA_DIR` (dysk E:), ostatni dzień notowań 2026-09-16.

## 1. Skąd lista spółek

SEC udostępnia wartość akcji w wolnym obrocie (`dei:EntityPublicFloat`) dla wszystkich raportujących spółek
na każdy kwartał od 2008 r. Kandydat = spółka, której float kiedykolwiek przekroczył 500 mln USD.
Dzięki temu lista obejmuje także spółki, których już nie ma — w przeciwieństwie do dzisiejszej listy z giełdy.

## 2. Ile spółek odpada na każdym etapie

| etap | spółek |
|---|---|
| kandydaci z SEC (float ≥ 500 mln USD kiedykolwiek) | 4875 |
| — odrzucone: SPAC albo brak raportów 10-K | 61 |
| sprawozdania finansowe pobrane | 4814 |
| notowania pobrane z Yahoo | 2721 |
| — brak tickera (spółka już nie istnieje) | 2008 |
| — notowana poza NYSE/Nasdaq | 74 |
| — Yahoo nie ma danych | 11 |
| **w panelu** | 1836 |

Szczegółowy status każdej spółki przy budowie panelu:

| status | spółek |
|---|---|
| brak notowań (spółka już nie istnieje albo notowana poza NYSE/Nasdaq) | 2094 |
| w panelu | 1836 |
| dane są, ale ani jednego kwartału z kapitalizacją ≥ 1 mld USD i świeżymi danymi | 477 |
| nie da się zweryfikować notowań (brak łącznej liczby akcji — zwykle kilka klas akcji) | 261 |
| notowania z Yahoo nie pasują do spółki z SEC (inny podmiot pod tym tickerem) | 123 |
| odrzucona (SPAC albo brak raportów 10-K) | 61 |
| notowania z Yahoo nie pokrywają się w czasie z danymi SEC | 23 |

## 3. Panel

| miara | wartość |
|---|---|
| wierszy (spółka × kwartał) | 63590 |
| spółek | 1836 |
| próg kapitalizacji w dniu decyzji | 1 mld USD |
| wierszy z ceną po 1 latach | 60710 |
| wierszy z ceną po 2 latach | 55053 |
| wierszy z ceną po 3 latach | 49595 |
| wierszy z ceną po 4 latach | 44210 |
| wierszy z ceną po 5 latach | 38834 |
| kwartałów pominiętych: poniżej progu kapitalizacji | 23374 |
| kwartałów pominiętych: przestarzałe dane finansowe | 5154 |
| faktów SEC odrzuconych z braku czasu publikacji | 149 |

Spółek w panelu na rok (kwartał decyzji w danym roku). Mniejsze spółki raportują do SEC w formacie
maszynowym (XBRL) dopiero od 2011 r., największe od 2009 r. — dlatego panel realnie zaczyna się w latach 2010–2011.

| rok | 2009 | 2010 | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| spółek | 4 | 251 | 591 | 703 | 805 | 868 | 896 | 922 | 985 | 1047 | 1199 | 1269 | 1420 | 1451 | 1427 | 1485 | 1523 | 1443 |

## 4. Błąd przetrwania — ile go zostało

Spółki w panelu, których notowania kończą się przed końcem danych: **1** z 1836.
Czyli praktycznie **cały panel to spółki notowane do dziś**. Yahoo nie przechowuje notowań spółek wycofanych,
więc 2008 spółek bez tickera — przejętych, upadłych, wycofanych — nie ma w panelu wcale.
Część z nich zniknęła z powodu kłopotów (spadek kursu), część dzięki przejęciu (zwykle z premią), więc kierunek
błędu nie jest oczywisty. Pewne jest tylko, że fakty opisują „spółki, które przetrwały do 2026 r.”,
a pasy cenowe mogą być zbyt wąskie w dół — kryterium K1 było mierzone na tych samych ocalałych.

Możliwa naprawa bez płatnych danych: dla tych spółek mamy sprawozdania i roczny kurs przybliżony z SEC
(`EntityPublicFloat` / liczba akcji, mediana błędu −0,2%). Da się z niego zmierzyć, o ile szersze byłyby pasy,
gdyby spółki, które zniknęły, były w danych.

## 5. Fakty wspólne: S&P 500 kontra pełne uniwersum

### Wygasanie wzrostu

| horyzont | trwałość S&P | trwałość uniwersum | stała S&P | stała uniwersum | obs. S&P | obs. uniwersum |
|---|---|---|---|---|---|---|
| 1 lat | 0.166 | 0.193 | 0.054 | 0.079 | 10317 | 30443 |
| 2 lat | 0.126 | 0.143 | 0.053 | 0.068 | 10292 | 30369 |
| 3 lat | 0.157 | 0.133 | 0.048 | 0.060 | 10275 | 30341 |
| 4 lat | 0.162 | 0.123 | 0.046 | 0.056 | 10257 | 30295 |
| 5 lat | 0.155 | 0.119 | 0.047 | 0.054 | 9903 | 29074 |

### Powrót wielokrotności

| horyzont | trwałość S&P | trwałość uniwersum | stała S&P | stała uniwersum | obs. S&P | obs. uniwersum |
|---|---|---|---|---|---|---|
| 1 lat | 0.918 | 0.881 | 0.105 | 0.070 | 12820 | 39430 |
| 2 lat | 0.882 | 0.816 | 0.160 | 0.102 | 12747 | 39239 |
| 3 lat | 0.872 | 0.777 | 0.201 | 0.124 | 12718 | 39143 |
| 4 lat | 0.854 | 0.749 | 0.240 | 0.130 | 12695 | 39053 |
| 5 lat | 0.834 | 0.728 | 0.282 | 0.147 | 12315 | 37662 |

### Dryf liczby akcji (roczny)

| horyzont | S&P | uniwersum |
|---|---|---|
| 1 lat | -0.9% | 0.0% |
| 2 lat | -1.1% | -0.2% |
| 3 lat | -1.1% | -0.3% |
| 4 lat | -1.2% | -0.4% |
| 5 lat | -1.2% | -0.5% |

## 6. Kryterium K1 na pełnym uniwersum

Pas 80% zawiera prawdziwą cenę — próg z preregistracji 72–88%. Pomiar na spółkach, których fakty nie widziały.

| horyzont | A — S&P | A — uniwersum | B — S&P | B — uniwersum |
|---|---|---|---|---|
| 1 lat | 81.5% PASS | 79.7% PASS | 81.5% PASS | 80.5% PASS |
| 2 lat | 80.9% PASS | 79.9% PASS | 81.2% PASS | 80.2% PASS |
| 3 lat | 80.7% PASS | 79.8% PASS | 81.3% PASS | 81.1% PASS |
| 4 lat | 79.6% PASS | 80.4% PASS | 79.2% PASS | 81.0% PASS |
| 5 lat | 79.1% PASS | 80.7% PASS | 78.4% PASS | 81.5% PASS |

## 7. Czy fakty zmieniają się w czasie — pełne uniwersum

- **wygasanie wzrostu**: STABILNE (1/5 horyzontów różnych) — jeden wspólny fakt wystarcza
  (prognozy z modeli z różnych okresów różnią się po 5 latach o 28.4%)
- **powrót wielokrotności**: RÓŻNE W CZASIE (5/5 horyzontów) — specjaliści od okresów mają uzasadnienie
  (prognozy z modeli z różnych okresów różnią się po 5 latach o 35.2%)

Szczegóły: `artifacts/universe/facts-stability.md`.
