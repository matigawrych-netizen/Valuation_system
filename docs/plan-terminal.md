# Plan: od modelu wyceny do „domowego terminala Bloomberga”

**Data zapisu: 2026-09-16.** Plik powstał **przed** jakimkolwiek pomiarem nowego systemu.
Zasada jak w `acceptance-criteria.md`: progi zapisane tutaj można zmienić wyłącznie z nową datą
i uzasadnieniem, **przed** ponownym uruchomieniem pomiarów. Zmiana progu po zobaczeniu wyniku
unieważnia wynik.

## 1. Co system ma zwracać

Dla **każdej** spółki z uniwersum, w każdym dniu:

1. **Cena zakupu** — trzy poziomy (agresywny / zrównoważony / ostrożny) plus konsensus specjalistów.
   Cena zakupu to limit: „kupuj, jeśli rynek zejdzie do tego poziomu”. Aktualizowana w dniu publikacji
   raportu spółki, sprawdzana codziennie względem ceny rynkowej — więc zakup jest możliwy w środku kwartału.
2. **Przedziały cenowe na 1, 2, 3, 4 i 5 lat** — „ile to będzie kosztować, jeśli wszystko pójdzie tak samo”.
   Dwa scenariusze, oba pokazywane:
   - **A — rynek bez zmian**: firma rośnie jak dotąd, rynek płaci za nią tę samą wielokrotność co dziś.
   - **B — powrót do wartości**: firma rośnie jak dotąd, a wielokrotność wraca do poziomu typowego
     dla takich firm (tempo powrotu mierzone z danych, nie zgadywane).
   Każdy przedział ma podaną niepewność (pas 80%), a nie jedną liczbę.
3. **Dywidenda** — pokazywana osobno od ceny (właściciel: ceny i dochód z dywidend nie mieszamy).

To nie jest strategia portfelowa. Nie ma „wybierz 20 spółek”. Każda spółka dostaje własną cenę.

## 2. Uniwersum i dane

- **Tylko akcje amerykańskie** (NYSE + Nasdaq). Bez GPW.
- **Spółki warte co najmniej ~1 mld USD** (kapitalizacja liczona point-in-time, nie dzisiejsza).
- **Tylko dane darmowe**: SEC EDGAR (raporty XBRL, daty akceptacji, formularze), FRED (makro, wersje ALFRED),
  Yahoo Finance (ceny). Właściciel nie płaci za dane; płaci za obliczenia.
- Duże dane (pełne uniwersum) trafiają na dysk **E:** — na C: jest ~8 GB wolnego.

### Znane ograniczenie, które naprawiamy w kroku (a)
Dzisiejszy cache zna 818 spółek, ale realne dane ma dla 499 — i **prawie wyłącznie dla tych,
które nadal są w indeksie** (482 z 491 obecnych, ale tylko 24 z 338 usuniętych). To klasyczny
błąd przetrwania: model uczy się na firmach, które przetrwały. Krok (a) polega na dociągnięciu
z SEC zdarzeń końcowych (bankructwo, wycofanie z giełdy, koniec raportowania) dla spółek usuniętych.

## 3. Architektura docelowa

```
dane point-in-time
      │
      ▼
[1] FAKTY WSPÓLNE  ── uczone raz, na danych historycznych
      │   • jak szybko wygasa wzrost firmy (growth fade)
      │   • jak szybko wielokrotność wraca do typowej (reversion)
      │   • jak duży jest błąd prognozy na 1..5 lat (kwantyle błędu)
      │   • ryzyko zdarzenia końcowego (bankructwo / wycofanie)
      ▼
[2] SPECJALIŚCI  ── ~10 modeli liczbowych, każdy z własną „osobowością”
      │   (szkoła inwestycyjna + temperament → własna wymagana stopa zwrotu
      │    i własny sposób ważenia faktów)
      │   Każdy zdaje ten sam egzamin na tych samych danych.
      ▼
[3] KONSENSUS + KARTA SPÓŁKI
          agresywny / zrównoważony / ostrożny + konsensus,
          szczegóły specjalistów po kliknięciu
```

Specjaliści są **modelami liczbowymi**, nie agentami LLM. Powód: LLM zna historyczne wyniki spółek,
więc nie da się na nim zrobić uczciwego testu na przeszłości.

## 4. Kryteria sukcesu (preregistracja)

Pomiar wyłącznie na danych, na których system się nie uczył. Obserwacje z tego samego kwartału są
zależne, więc wszystkie przedziały ufności liczone są bootstrapem **po kwartałach**, a testy
porównawcze — testem Diebolda-Mariano z korektą Newey-West na nakładanie się horyzontów.

| # | Kryterium | Próg | Jak mierzone |
|---|---|---|---|
| K1 | Pas 80% zawiera prawdziwą cenę | pokrycie w przedziale **72–88%** dla każdego horyzontu 1–5 lat | `artifacts/bands-calibration.json` |
| K2 | Zakup po cenie „zrównoważonej” bije kupno całego rynku | średnia roczna nadwyżka > 0 **i** dolna granica CI95 > 0 | `artifacts/limit-backtest.json` |
| K3 | System bije prostą alternatywę „cena się nie zmieni” | niższa strata pinball, DM p < 0.0167 (Bonferroni na 3) | `artifacts/bands-benchmarks.json` |
| K4 | System bije prostą alternatywę „stała wielokrotność” | niższa strata pinball, DM p < 0.0167 | `artifacts/bands-benchmarks.json` |
| K5 | Zdarzenia końcowe uwzględnione | udział spółek ze zdarzeniem końcowym w zbiorze uczącym > 0, a wyniki K1–K4 policzone z nimi | `artifacts/sec-events-report.md` |

Doprecyzowania:
- **Pas 80%** to przedział między 10. a 90. centylem prognozy. Pokrycie poniżej 72% = przedziały za wąskie
  (system udaje pewność), powyżej 88% = za szerokie (bezużyteczne).
- **Wymagana stopa zwrotu dla ceny „zrównoważonej”: 9,0% rocznie.** To środek przedziału 8–10%
  podanego przez właściciela, zbliżony do długoterminowego zwrotu rynku USA. Agresywna: 6,0%. Ostrożna: 13,0%.
  Liczby ustalone teraz, przed pomiarem.
- **„Kupno całego rynku”** = zakup indeksu S&P 500 w tym samym dniu, w którym zlecenie limit zostało
  zrealizowane, i trzymanie przez ten sam czas. Porównanie jest parowane co do daty.
- Horyzonty 4–5 lat mają mało niezależnych okresów (dane od 2006 r. to ~4 niezależne okna 5-letnie).
  Każdy wynik dla tych horyzontów raportujemy z tą informacją; nie traktujemy go jak wyniku rocznego.
- Brak artefaktu = „BRAK POMIARU”, nigdy PASS.

### Podział danych
Bez zmian względem `data-splits.md`: uczenie ≤ 2021, embargo 2022, sejf 2023–2025 (max 3 dotknięcia).
Dla horyzontów wieloletnich dochodzi **podział po spółkach**: fakty i specjaliści uczą się na jednej
połowie spółek, a pokrycie pasów mierzymy na drugiej — inaczej 5-letnie okna zlewają się z uczeniem.

## 5. Kolejność prac

- **(a) Zdarzenia końcowe z SEC** — bankructwa (8-K punkt 1.03), wycofania z giełdy (formularz 25),
  koniec raportowania (formularz 15). Naprawa błędu przetrwania.
- **(b) Fakty wspólne na S&P** — wygasanie wzrostu, powrót wielokrotności, kwantyle błędu 1–5 lat.
  **Warunek uzgodniony z właścicielem:** zanim powstaną „specjaliści od różnych okresów”, mierzymy,
  czy te fakty faktycznie różnią się między okresami. Reguła zapisana przed pomiarem:
  okresy to **2009–2013, 2014–2017, 2018–2021** (rozłączne), a fakty uznajemy za różne w czasie,
  gdy przedziały ufności 95% współczynnika (bootstrap po kwartałach) **nie nachodzą na siebie
  dla co najmniej 3 z 5 horyzontów**. Poniżej tego progu budujemy jeden wspólny fakt i nie tworzymy
  specjalistów od okresów. Pomiar: `artifacts/facts-stability.md`.

  **Wynik pomiaru (2026-09-16, po korekcie danych): warunek spełniony.** Powrót wielokrotności: różny
  w 5 z 5 horyzontów. Wygasanie wzrostu: 2 z 5, czyli według reguły stabilne (na granicy; przed usunięciem
  przestarzałych danych było 4 z 5). W praktyce oba fakty dają przy modelu z innego okresu prognozę 5-letnią
  różną o ok. 22–26%, bo zmienia się poziom wzrostu i wycen całego rynku. Wniosek: specjaliści uczeni na
  różnych okresach mają uzasadnienie i wchodzą do kroku (d).
- **(c) Pełne uniwersum NYSE/Nasdaq** (≥ ~1 mld USD) na dysku E:.
  **Wykonane 2026-09-16** (`docs/RAPORT-KROK-C.md`): 1 836 spółek, 63 590 wierszy, K1 zdane (79,7–81,5%).
  Fakty do dalszych kroków bierzemy z pełnego uniwersum, nie z S&P. Otwarte: panel zawiera praktycznie
  wyłącznie spółki notowane do dziś (brak darmowych cen 2 008 spółek wycofanych) — do zmierzenia rocznym
  kursem przybliżonym z SEC, zanim pasy trafią do terminala.
- **(c2) Pomiar błędu przetrwania** — zapisane 2026-09-16, **przed** pomiarem. Właściciel: najpierw ten pomiar,
  specjalistów na razie nie trenujemy.

  *Pytanie:* o ile szersze byłyby pasy cenowe, gdyby spółki, które zniknęły z rynku, były w danych.

  *Miara:* wartość akcji w wolnym obrocie z raportów rocznych SEC (`dei:EntityPublicFloat`) — ta sama dla wszystkich
  spółek, także tych bez notowań. Obserwacja = spółka z floatem ≥ 1 mld USD na dzień wyceny z lat 2009–2021.
  Wynik = zmiana tej wartości po h = 1..5 latach (wycena z tego samego miesiąca ± 75 dni), tylko gdy dzień
  t+h ≤ 2025-08-15 (później dane SEC są jeszcze niekompletne).

  *Grupy:* **A — ocalałe**: obserwacje, dla których wartość po h latach istnieje. **B — wszystkie**: A plus spółki,
  które przestały raportować przed t+h, z wartością końcową liczoną od ostatniej znanej wartości:

  | co się stało | wariant podstawowy | wariant alternatywny |
  |---|---|---|
  | upadłość (8-K 1.03 między t a ostatnim raportem) | −99% | −70% |
  | zniknięcie z formularzem 25/15, bez upadłości (zwykle przejęcie) | 0% | +30% (premia za przejęcie) |
  | zniknięcie bez żadnego z tych formularzy | 0% | −50% |

  Spółki, które nadal raportują, ale nie mają floatu po h latach, są pomijane w obu grupach i liczone osobno.

  *Kryteria:*
  - **S1 — czy błąd jest istotny:** jeśli w wariancie podstawowym 10. centyl zmiany w grupie B leży o ≥ 5 punktów
    procentowych niżej niż w grupie A dla któregokolwiek horyzontu, pasy w terminalu trzeba poszerzyć w dół
    (poprawka: prawdopodobieństwo zniknięcia w h latach × wartość końcowa).
  - **K1b — K1 po uwzględnieniu spółek, które zniknęły:** pas 80% wyznaczony na grupie A (10.–90. centyl),
    sprawdzony na grupie B. Pokrycie < 72% dla któregokolwiek horyzontu = K1 niezdane po uwzględnieniu
    spółek, które zniknęły.
  - **Kontrola zastępnika:** dla spółek z potwierdzonymi notowaniami porównujemy centyle zmiany floatu z centylami
    zmiany kursu z Yahoo w tych samych obserwacjach. Zastępnik uznajemy za użyteczny, gdy 10. i 90. centyl
    różnią się o mniej niż 10 punktów procentowych.

- **(d) Specjaliści** — projekt uzgodniony z właścicielem 2026-09-16, zapisany przed budową:

  Specjalista = **sposób uczenia się × długość pamięci**. Temperament nie tworzy osobnych modeli.

  | | krótka pamięć (~4 lata) | średnia (~8 lat) | cała historia |
  |---|---|---|---|
  | model prosty (liniowy, jak fakty wspólne) | ✓ | ✓ | ✓ |
  | drzewa decyzyjne (gradient boosting) | ✓ | ✓ | ✓ |
  | sieć neuronowa | tylko jeśli po kroku (c) danych wystarczy | | |

  Zasady:
  1. **Pamięć działa w czasie rzeczywistym.** Specjalista w dniu decyzji uczy się wyłącznie na obserwacjach,
     których wynik był już znany tego dnia (wynik po 5 latach z 2015 r. jest znany dopiero w 2020 r.).
     „Krótka pamięć” = obserwacje z ostatnich ~4 lat przed dniem decyzji.
  2. **Temperament = wymagany zwrot**: agresywny 6%, zrównoważony 9%, ostrożny 13% rocznie
     (liczby z sekcji 4). Każdy specjalista podaje więc trzy ceny zakupu, a konsensus zbiera je razem.
  3. **Zakryte daty zostają egzaminem, nie osobowością.** W starym systemie 8 ekspertów z jednym zakrytym
     okresem 2-letnim zachowywało się jak 1,17 eksperta (widzieli 7/8 tych samych danych). Zakrywanie lat
     służy do sprawdzania każdego specjalisty na latach, których nie widział.
  4. **Wszyscy zdają ten sam egzamin** (K1–K4, te same dane, te same progi).
  5. **Specjaliści muszą się naprawdę różnić.** Po zbudowaniu mierzymy korelację ich błędów prognozy.
     Para z korelacją ≥ 0,95 zostaje połączona w jednego specjalistę. Cel dla całego zespołu: efektywna
     liczba niezależnych specjalistów (n_eff) > 3 — ten sam próg co w `acceptance-criteria.md`.
  6. **Drzewa i sieć muszą zapracować na miejsce.** Wchodzą do konsensusu tylko wtedy, gdy zdają K1 i nie są
     istotnie gorsze od modelu prostego z tą samą pamięcią (test Diebolda-Mariano, p < 0,05).
  7. Otwarte na później: „szkoła inwestycyjna” (której wielokrotności specjalista ufa: przychody / zyski /
     wartość księgowa) jako trzecia oś — tylko jeśli pomiar z punktu 5 pokaże, że specjaliści są zbyt podobni.
- **(e) Konsensus i karta spółki** — wyjście dla terminala.

## 6. Zasady, które obowiązują w każdym kroku

1. Żadnych zaszytych na sztywno liczb udających pomiar.
2. Żadnych danych syntetycznych raportowanych jako wynik.
3. Brak danych = błąd lub wyjście z kodem ≠ 0. Nigdy cicha wartość domyślna.
4. Żaden test nie dostaje odpowiedzi na wejściu.
5. Jeśli czegoś nie da się zrobić — piszemy to wprost, zamiast udawać, że się udało.
