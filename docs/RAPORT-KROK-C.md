# Raport: krok (c) — pełne uniwersum NYSE + Nasdaq

Data: 2026-09-16. Plan i progi: `plan-terminal.md`. Pełne tabele: `artifacts/universe/universe-report.md`.

## Najważniejsze w skrócie

1. **Uniwersum urosło z 432 do 1 836 spółek** (NYSE + Nasdaq, kapitalizacja ≥ 1 mld USD w dniu decyzji).
   Panel ma 63 590 wierszy zamiast 19 699.
2. **Lista spółek jest wolna od błędu przetrwania, ale panel już nie.** SEC podał 4 875 spółek, które kiedykolwiek
   miały akcje w wolnym obrocie warte ≥ 500 mln USD, w tym 2 008 już nieistniejących. Tylko że Yahoo nie ma
   notowań spółek wycofanych, więc w panelu zostały praktycznie wyłącznie spółki notowane do dziś (1 835 z 1 836).
3. **Kryterium K1 zdane na pełnym uniwersum**: pas 80% zawiera prawdziwą cenę w 79,7–81,5% przypadków
   (próg 72–88%), mierzone na 768 spółkach, których fakty nie widziały. Zastrzeżenie z punktu 2 dotyczy też tego pomiaru.
4. **Fakty z pełnego uniwersum różnią się od S&P w sensowny sposób**: wycena wraca do typowej szybciej,
   a pasy cenowe są szersze w dół.
5. **Wniosek dla specjalistów się potwierdza**: trwałość wyceny zmienia się między okresami (5 z 5 horyzontów),
   tempo wzrostu konkretnej spółki — nie (1 z 5). Model z innego okresu daje cenę po 5 latach różną o 28–35%.

## 1. Jak powstało uniwersum

| etap | spółek |
|---|---|
| kandydaci z SEC (float ≥ 500 mln USD kiedykolwiek od 2008 r.) | 4 875 |
| odrzucone: SPAC albo brak raportów 10-K (spółki zagraniczne) | 61 |
| pobrane sprawozdania finansowe | 4 814 |
| pobrane notowania z Yahoo | 2 721 |
| bez tickera — spółki, których już nie ma | 2 008 |
| notowania nie pasują do spółki z SEC (ochrona przed „ten sam ticker, inna firma”) | 123 |
| nie da się zweryfikować notowań (zwykle kilka klas akcji) | 261 |
| dane są, ale nigdy nie było kwartału z kapitalizacją ≥ 1 mld USD i świeżymi danymi | 477 |
| **w panelu** | **1 836** |

Dane zajmują 13 GB w `E:\gówno aaaaa\valuation-data` (poza repozytorium).

Nowe zabezpieczenie: notowania z Yahoo trafiają do panelu tylko wtedy, gdy zgadzają się z kursem wyliczonym
z danych SEC. Na S&P potwierdziło 464 z 498 spółek; pozostałe 34 to niemal wyłącznie spółki z kilkoma klasami
akcji, których i tak nie da się policzyć.

## 2. Czego pełne uniwersum NIE naprawiło

**Błąd przetrwania w cenach.** 2 008 spółek przejętych, upadłych i wycofanych nie ma w panelu, bo nie ma
ich darmowych notowań. Kierunek błędu nie jest oczywisty (upadłości ciągną w dół, przejęcia zwykle w górę),
ale pasy cenowe mogą być za wąskie w dół. **Możliwa naprawa bez płatnych danych**: sprawozdania tych spółek
już są na dysku, a z nich roczny kurs przybliżony z SEC (mediana błędu −0,2%). Da się z niego zmierzyć,
o ile szersze byłyby pasy, gdyby te spółki były w danych.

**Początek danych.** Mniejsze spółki raportują do SEC w formacie maszynowym dopiero od 2011 r., dlatego panel
realnie zaczyna się w latach 2010–2011 (w 2009 r. są tylko 4 spółki).

**Spółki, które odpadają przez format danych:**
- z kilkoma klasami akcji (np. Google, Meta, Berkshire) — SEC nie podaje ich łącznej liczby akcji (261 spółek);
- banki i ubezpieczyciele opisujący przychody innymi nazwami pozycji — część ich kwartałów odpada;
- spółki kontrolowane w ok. 90% przez jednego właściciela (np. Ubiquiti) — kurs z SEC jest wtedy tak zaniżony,
  że weryfikacja uznaje notowania za cudze. Odrzucenie jest ostrożne, ale kosztuje część dobrych spółek.

## 3. Fakty: S&P 500 kontra pełne uniwersum

| | S&P 500 | pełne uniwersum |
|---|---|---|
| trwałość tempa wzrostu (5 lat) | 0,16 | 0,12 |
| trwałość wyceny (5 lat) | 0,83 | 0,73 |
| roczna zmiana liczby akcji | −0,9% do −1,2% | 0,0% do −0,5% |
| pas 80% po roku | −24% … +36% | −36% … +39% |
| pas 80% po 5 latach | −41% … +109% | −64% … +113% |
| mediana błędu po 5 latach (scenariusz A) | +11% | −1% |

Jak to czytać:
- **Wycena wraca do typowej szybciej** w pełnym uniwersum. W S&P drogie spółki częściej zostają drogie,
  bo indeks z definicji zbiera firmy, którym się udało.
- **Mniejsze spółki skupują mniej akcji**, a częściej emitują nowe.
- **Pasy są szersze w dół.** Mediana błędu w S&P była dodatnia (prawdziwe ceny wyższe od prognoz), bo do indeksu
  trafiają zwycięzcy. W pełnym uniwersum jest bliska zera. To wyraźny ślad błędu przetrwania w samym S&P.

**Dla terminala oznacza to, że fakty z pełnego uniwersum są uczciwszą podstawą** niż fakty z S&P.

## 4. Czy fakty zmieniają się w czasie (pełne uniwersum)

| fakt | horyzontów różnych (próg 3 z 5) | różnica ceny po 5 latach między modelami z różnych okresów |
|---|---|---|
| wygasanie wzrostu | 1 z 5 — stabilne | 28% |
| powrót wielokrotności | 5 z 5 — różne | 35% |

Najbardziej trwałe wyceny były w latach 2014–2017 (po 5 latach zostawało 84% różnicy), najmniej trwałe
w latach 2018–2021 (71%). To samo wyszło na S&P, więc wniosek jest mocniejszy: **specjaliści o różnej
długości pamięci mają uzasadnienie**, a różnić się będą głównie tym, jak szybko spodziewają się powrotu wyceny.

## 5. Nowe pliki

| plik | rola |
|---|---|
| `src/universe.ts` | reguły uniwersum: kto odpada, pod jakim tickerem szukać notowań |
| `src/price-verification.ts` | sprawdzenie, czy notowania z Yahoo należą do tej spółki |
| `src/panel-builder.ts` | wiersze panelu dla jednej spółki (wspólne dla S&P i uniwersum) |
| `src/sec-http.ts` | zapytania do SEC z ograniczeniem tempa i ponawianiem |
| `scripts/universe-discover.ts` | lista kandydatów z SEC (`npm run universe:discover`) |
| `scripts/universe-download-sec.ts` | listy formularzy i sprawozdania (`npm run universe:download-sec`) |
| `scripts/universe-download-prices.ts` | notowania z Yahoo (`npm run universe:download-prices`) |
| `scripts/universe-build-panel.ts` | panel (`npm run universe:panel`) |
| `scripts/report-universe.ts` | raport zbiorczy (`npm run universe:report`) |

Uczenie i stabilność na pełnym uniwersum: `npm run universe:facts`, `npm run universe:stability`.
Katalog danych ustawia `UNIVERSE_DATA_DIR` w pliku `.env`.
