# Raport: krok (d) — egzamin specjalistów

Data: 2026-09-17. Reguły i progi zapisane **przed** treningiem: `docs/specjalisci.md` (punkt 10, commit 03cb32f),
porównanie z VTI dopisane przed egzaminem (commit z tego samego dnia). Pełne tabele: `artifacts/universe/specialists-exam.md`.

Egzamin kroczący: specjaliści uczyli się co roku 15 lutego 2016–2021 wyłącznie na tym, co było wtedy wiadomo,
i oceniali decyzje do następnego lutego. Sejf 2023–2025 nietknięty.

## Najważniejsze w skrócie

1. **Żaden specjalista nie okazał się lepszy od naiwnych prognoz** („cena się nie zmieni”, „stała wycena”).
   Na 1–2 lata różnice są w granicach przypadku; na 3–5 lat danych jest za mało, żeby to w ogóle sprawdzić.
2. **Model prosty (Reporter, Praktyk, Weteran) jest uczciwie skalibrowany i stabilny**: K1 zdane (pas 80% trafia
   w 72–76% — na dolnej granicy progu), K6 zdane (cena zakupu zmienia się o ok. 6–7% na kwartał). K2 niezdane:
   +1,2–1,5% rocznie ponad S&P 500, ale z niepewnością od ok. −11% do +12%.
3. **Drzewa i sieć nie zdały K1** — ich pasy są za wąskie (na 5 lat trafiają w 50–58% zamiast 80%). Przez to nie mają głosu.
4. **Ceny zakupu drzew i sieci są bezużyteczne** — w 99% przypadków trafiły na górną granicę zakresu wyceny
   (mediana: ok. 8× dzisiejszy kurs). Te modele w praktyce „kupiłyby po każdej cenie”.
5. **Wynik głosowania:** głos mają tylko trzej specjaliści prości, po 33%. Praktyk i Weteran są identyczni
   (dane zaczynają się w 2010 r., więc 8 lat pamięci = cała historia), więc po regule łączenia zespół liczy się
   jak 1–2 niezależnych specjalistów, a nie 3+.

## Wyniki według warunków

| specjalista | K1 pas 80% | K3 | K4 | bramka | K2 | K6 | głos |
|---|---|---|---|---|---|---|---|
| Reporter (prosty, 4 lata) | PASS | 0/5 | 0/5 | — | FAIL | PASS | tak |
| Praktyk (prosty, 8 lat) | PASS | 0/5 | 0/5 | — | FAIL | PASS | tak |
| Weteran (prosty, cała historia) | PASS | 0/5 | 0/5 | — | FAIL | PASS | tak |
| Tropiciel, Detektyw, Archiwista (drzewa) | FAIL | 0/5 | 0/5 | PASS* | FAIL | PASS | nie |
| Radar, Sejsmograf, Kompas (sieć) | FAIL | 0/5 | 0/5 | PASS* | FAIL | PASS | nie |

\* Bramka zdana według zapisanej reguły, ale tylko dlatego, że dało się ją sprawdzić wyłącznie na 1–2 latach
(tam drzewa i sieć są równe modelowi prostemu). Na 3–5 lat ich strata jest **o 8–31% wyższa** niż modelu prostego —
tego nie da się potwierdzić testem przy tak krótkich danych, ale kierunek jest jednoznaczny.

## Diagnoza (po egzaminie — nie była częścią preregistracji)

Sprawdzone po zobaczeniu wyników, więc to wyjaśnienia, a nie wynik testu:

- **Za wąskie pasy drzew i sieci.** Pas liczymy z błędów na danych, na których model się uczył. Model prosty ma trzy
  współczynniki i nie „zapamiętuje” danych, więc jego błędy na pamięci są podobne do błędów na nowych latach.
  Drzewa (do 400) i sieć dopasowują się do pamięci: w treningu z 2021 r., horyzont 5 lat, 10.–90. centyl błędów to
  −0,71…+0,54 u Archiwisty i −0,63…+0,48 u Kompasa, a u Weterana −0,96…+0,77. Na nowych latach błędy drzew i sieci
  są co najmniej tak duże jak modelu prostego, a pas — węższy.
- **Zdegenerowana cena zakupu drzew i sieci.** Cena zakupu wymaga, żeby prognoza zwrotu spadała, gdy akcja drożeje.
  W modelu prostym wynika to wprost z powrotu wyceny. Drzewa i sieć traktują cenę/przychody jako jedną z 28 cech
  i ich prognoza prawie od niej nie zależy — warunek wymaganego zwrotu jest spełniony aż do górnej granicy zakresu.
- **Mało danych do K2 i K6.** Ceny zakupu powstały tylko dla decyzji z lat 2019–2021 (12 kwartałów): wcześniej nie
  było modeli dla 4–5 lat. Nadwyżka +1,5% przy przedziale ±11% nie mówi nic rozstrzygającego.

## Zastrzeżenia

- Panel to prawie wyłącznie spółki notowane do dziś (krok c2) — zwroty spółek w K2 są zawyżone.
- Decyzje 2016–2021 to jeden okres rynkowy; na 4–5 lat test porównawczy był niemożliwy (za mało niezależnych okien).
- Ceny zakupu dla spółek bez dywidend w raporcie liczono z dywidendą 0 (ok. 28% cen).

## Co to znaczy dla terminala

- **Pasy cenowe 1–5 lat** z modelu prostego są uczciwe (K1), choć na dolnej granicy — można je pokazywać z tym opisem.
- **Cena zakupu** z modelu prostego jest stabilna (K6), ale **nie ma dowodu**, że kupowanie po niej bije rynek (K2).
- **Drzewa i sieć** w obecnej postaci nie nadają się do terminala: bez głosu, z bezużyteczną ceną zakupu.

## Możliwe następne kroki (do decyzji właściciela)

Każda zmiana poniżej jest zmianą **po** zobaczeniu wyników, więc wymaga ponownego egzaminu i ostatecznie sprawdzenia
na sejfie 2023–2025:

1. **Pas drzew i sieci z błędów na latach, których model nie widział** (np. z roku walidacyjnego), zamiast z pamięci.
2. **Drzewa i sieć przewidują tylko to, czego model prosty nie umie** (np. wzrost przychodów), a powrót wyceny zostaje
   z modelu prostego — wtedy cena zakupu ma sens także dla nich.
3. **Zostać przy modelu prostym** jako jedynym głosującym i przejść do kroku (e) — konsensus i karta spółki — z uczciwym
   opisem: pasy skalibrowane, przewaga ceny zakupu niepotwierdzona.

## Nowe pliki

| plik | rola |
|---|---|
| `src/specialist-memory.ts` | kalendarz egzaminu i pamięć w czasie rzeczywistym |
| `src/specialist-features.ts` | cechy spółki przy dowolnej cenie, „nie wiem” |
| `src/specialists.ts` | skład zespołu, trening modelu prostego, drzew, sieci i punktów odniesienia |
| `src/gbm.ts`, `src/mlp.ts` | drzewa decyzyjne i sieć neuronowa (bez zewnętrznych bibliotek) |
| `src/buy-price.ts` | cena zakupu (średnia z 1–5 lat, trzy temperamenty) |
| `src/specialist-exam.ts`, `src/limit-backtest.ts` | miary egzaminu, zlecenia z limitem |
| `scripts/specialists-*.ts`, `scripts/download-market.ts` | przygotowanie danych, egzamin, raport |
| `artifacts/universe/specialists-exam.md`, `.json` | pełne wyniki |
