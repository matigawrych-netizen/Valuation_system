# Raport: krok (c2) — pomiar błędu przetrwania

Data: 2026-09-16. Definicja, założenia i progi zapisane **przed** pomiarem: `plan-terminal.md`, krok (c2)
(commit z preregistracją i commit z kodem są w historii repozytorium przed commitem z wynikiem).
Pełne tabele: `artifacts/universe/survivorship.md`.

## Pytanie

Panel cenowy pełnego uniwersum składa się praktycznie wyłącznie ze spółek notowanych do dziś, bo darmowe źródła
nie mają notowań ok. 2 000 spółek przejętych i upadłych. Czy przez to pasy cenowe są za wąskie w dół?

Miara dostępna dla wszystkich spółek: wartość akcji w wolnym obrocie z raportów rocznych SEC. Porównaliśmy rozkład
jej zmian u spółek, które przetrwały (grupa A), z rozkładem u wszystkich spółek, łącznie z tymi, które zniknęły
(grupa B, z założoną wartością końcową).

## Najważniejsze w skrócie

1. **Spółki warte ≥ 1 mld USD rzadko upadają.** W ciągu 5 lat znika ok. 17% z nich, ale prawie wszystkie
   przez przejęcie (15,6%). Upadłości to 0,9%, znikanie bez żadnego formularza — 0,7%.
2. **Kryterium S1 — nieistotne.** 10. centyl zmiany wartości (dolna granica pasa) przesuwa się o najwyżej 1 p.p.
   po dodaniu spółek, które zniknęły. Próg istotności: 5 p.p. Pasy **nie wymagają poprawki w dół**.
3. **Kryterium K1b — zdane.** Pas 80% wyznaczony na ocalałych zawiera 80–81% obserwacji wszystkich spółek (próg 72%).
4. **Zastrzeżenie — zastępnik zdał kontrolę tylko dla 1 roku.** Zgodnie z regułą zapisaną przed pomiarem,
   dla horyzontów 2–5 lat wynik S1 i K1b **nie jest formalnie potwierdzony**. Szczegóły niżej.
5. **Błąd przetrwania dotyczy raczej środka rozkładu niż dolnej granicy.** To informacja dodatkowa, nie kryterium.

## Dlaczego dolna granica się prawie nie rusza

Pas 80% odcina 10% najgorszych przypadków. Upadłości (0,9% w 5 lat) mieszczą się w całości wewnątrz tych 10% —
przesuwają najgorszy 1%, ale nie 10. centyl. Przejęcia (15,6%) odbywają się zwykle po cenie bliskiej lub wyższej
od ostatniej wyceny, więc lądują w środku rozkładu, a nie na dole.

Dla terminala: pas 80% z panelu ocalałych jest uczciwy w dół. **Nie opisuje natomiast najgorszych skrajności**
(np. 2–5% najgorszych przypadków) — tam upadłości mają znaczenie. Jeśli kiedyś pokażemy pas 95%, trzeba to zmierzyć osobno.

## Kontrola zastępnika — co nie wyszło

Reguła zapisana przed pomiarem: zastępnik jest użyteczny, gdy 10. **i** 90. centyl zmiany floatu różnią się od
centyli zmiany kursu (te same spółki, te same daty) o mniej niż 10 p.p.

| horyzont | różnica 10. centyla | różnica 90. centyla | wynik reguły |
|---|---|---|---|
| 1 rok | −2,7 p.p. | +9,4 p.p. | użyteczny |
| 2 lata | −3,1 p.p. | +13,9 p.p. | nieużyteczny |
| 3 lata | −3,0 p.p. | +16,7 p.p. | nieużyteczny |
| 4 lata | −3,0 p.p. | +20,3 p.p. | nieużyteczny |
| 5 lat | −3,7 p.p. | +23,0 p.p. | nieużyteczny |

Wniosek formalny: dla 2–5 lat pomiar S1 i K1b **nie jest wiarygodny według przyjętej reguły**.

Poza regułą, jako informacja: rozjazd dotyczy wyłącznie górnej granicy. Wartość w wolnym obrocie rośnie szybciej
niż kurs, bo przybywa akcji w obrocie (sprzedaż akcji przez założycieli, koniec blokady po debiucie, emisje).
**Dolna granica — ta, o którą pytało S1 — zgadza się z kursem z dokładnością do 3–4 p.p. na wszystkich
horyzontach.** Nie zmieniamy reguły po fakcie, ale ta obserwacja zmniejsza obawę, że wynik S1 jest przypadkowy.

## Środek rozkładu — informacja dodatkowa

Mediana zmiany wartości po 5 latach:

| grupa | mediana |
|---|---|
| A — ocalałe | +37% |
| B — wszystkie, przejęcia po ostatniej wycenie | +26% |
| B — wszystkie, przejęcia z premią 30% | +32% |

Panel złożony z ocalałych może więc zawyżać **typowy** wynik po 5 latach o ok. 5–11 p.p., zależnie od założenia
o cenie przejęć. To nie jest kryterium z preregistracji. Warto do tego wrócić przy konsensusie (krok e):
środek prognozy może wymagać lekkiego obniżenia, dolna granica pasa — nie.

## Ograniczenia

- Spółki, które nadal raportują, ale nie mają wyceny floatu po h latach, są pominięte (ok. 8% obserwacji).
- Wartość końcowa spółek, które zniknęły, to założenie. Stąd dwa warianty, dające podobne wyniki dla dolnej granicy.
- Dane roczne: zmiany w ostatnich miesiącach przed zniknięciem spółki nie są widoczne.

## Co to zmienia w planie

- Pasy 80% z pełnego uniwersum mogą trafić do terminala **bez poszerzania w dół**.
- Przy konsensusie (krok e) sprawdzić środek prognozy pod kątem zawyżenia przez ocalałych.
- Następny krok według planu: **(d) specjaliści** — właściciel prosił, żeby ich na razie nie trenować.

## Nowe pliki

| plik | rola |
|---|---|
| `src/survivorship.ts` | los spółki po h latach, wartości końcowe, centyle i pokrycie |
| `scripts/report-survivorship.ts` | pomiar i raport (`artifacts/universe/survivorship.md`) |
| `tests/survivorship.test.ts` | 17 testów logiki |
