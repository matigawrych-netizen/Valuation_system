# Specjaliści — projekt (krok d)

**Data zapisu: 2026-09-16, przed jakimkolwiek treningiem.** Właściciel zlecił zaprojektowanie i opis, trenowanie
na razie wstrzymane. Uzgodnione ramy: `plan-terminal.md`, krok (d). Punkty oznaczone **[decyzja właściciela]**
zostały rozstrzygnięte przez właściciela 2026-09-16.

## 1. Co jest wspólne, a co należy do specjalisty

Pomiary z kroków (b) i (c) rozdzielają zadania:

| składnik | kto liczy | dlaczego |
|---|---|---|
| **scenariusz A** — rynek płaci tę samą wielokrotność co dziś | wspólnie, z faktów wspólnych | trwałość tempa wzrostu spółki jest stabilna w czasie (1 z 5 horyzontów różnych); zmienia się poziom wzrostu całego rynku, a ten uwzględniają specjaliści w scenariuszu B |
| **dywidendy** | wspólnie: dzisiejsza dywidenda na akcję bez zmian | pokazywane osobno od ceny; założenie „wszystko bez zmian” |
| **scenariusz B / prognoza** — jak zmieni się wycena | **każdy specjalista osobno** | trwałość wyceny zmienia się w czasie (5 z 5), model z innego okresu daje cenę po 5 latach różną o 28–35% |
| **cena zakupu** (3 temperamenty) | każdy specjalista osobno | wynika z jego prognozy |
| **konsensus** | krok (e) | łączy zdania specjalistów |

Dane: panel pełnego uniwersum (NYSE + Nasdaq, ≥ 1 mld USD), nie S&P — pomiar z kroku (c) pokazał, że S&P zawyża wyniki.

## 2. Skład zespołu

Specjalista = **sposób uczenia się × długość pamięci**.

| nazwa | sposób uczenia się | pamięć | status |
|---|---|---|---|
| **Reporter** | model prosty | 4 lata | pewny |
| **Praktyk** | model prosty | 8 lat | pewny |
| **Weteran** | model prosty | cała historia | pewny |
| **Tropiciel** | drzewa decyzyjne | 4 lata | pewny |
| **Detektyw** | drzewa decyzyjne | 8 lat | pewny |
| **Archiwista** | drzewa decyzyjne | cała historia | pewny |
| **Radar** | sieć neuronowa | 4 lata | warunkowy |
| **Sejsmograf** | sieć neuronowa | 8 lat | warunkowy |
| **Kompas** | sieć neuronowa | cała historia | warunkowy |

Warunkowi wchodzą do zespołu tylko wtedy, gdy przejdą bramkę z punktu 7.

## 3. Co widzi specjalista (wejście)

Wyłącznie dane znane w dniu decyzji (panel point-in-time):

| grupa | cechy |
|---|---|
| wycena | cena/przychody, zysk/cena, wartość księgowa/cena, EBIT/wartość firmy, wolne przepływy/kapitalizacja, stopa dywidendy |
| wzrost | przychody rok do roku, przychody średniorocznie z 3 lat, zmiana marży netto rok do roku |
| jakość i ryzyko | marża netto, marża wolnych przepływów, zobowiązania/aktywa, gotówka/aktywa |
| wielkość i branża | logarytm kapitalizacji, sektor (z kodu SIC) |
| dopisane do panelu (2026-09-17) | zmiana kursu z ostatnich 12 miesięcy bez ostatniego miesiąca, zmiana liczby akcji w ostatnim roku |

- **Model prosty** używa tylko trzech wielkości — tempa wzrostu przychodów, ceny/przychodów i zmiany liczby akcji —
  tak jak fakty wspólne. Dzięki temu da się go w pełni wytłumaczyć.
- **Drzewa i sieć** używają pełnej listy.

## 4. Pamięć w czasie rzeczywistym

Specjalista w dniu decyzji *t*, prognozując horyzont *h*, uczy się wyłącznie na obserwacjach, których wynik był już
znany przed *t* (data decyzji + *h* ≤ *t*). **Pamięć M** = wynik zrealizował się w okresie [*t* − M, *t*].
„Cała historia” = od początku panelu (realnie 2010–2011).

Skutki, które trzeba znać:
- Dla horyzontu 5 lat „krótka pamięć” to decyzje sprzed 5–9 lat, których wynik poznaliśmy w ostatnich 4 latach.
- Panel zaczyna się w 2010–2011, więc pełna 8-letnia pamięć dla 5 lat jest dostępna dopiero pod koniec okresu
  egzaminu. We wczesnych latach specjaliści o dłuższej pamięci widzą to samo co krótsza — to ograniczenie danych,
  które raport z egzaminu musi pokazać.

Trening powtarzany **raz w roku** (luty — dochodzi nowy rok wyników). Prognozy liczone co kwartał, po każdym nowym
raporcie spółki. Cena zakupu sprawdzana codziennie względem kursu, jak zlecenie z limitem.

## 5. Jak uczy się każdy sposób

Wszystkie trzy przewidują to samo: **logarytm stosunku ceny za *h* lat do dzisiejszej ceny** (medianę), osobno dla
*h* = 1..5. Pas 80% = mediana przesunięta o 10. i 90. centyl błędów tego specjalisty z jego własnej pamięci.
Jedna metoda wyznaczania pasa dla wszystkich — różnice w pasach wynikają z pamięci i trafności, nie z techniki.

### Model prosty
Trzy dopasowania liniowe na horyzont (jak w `src/facts.ts`): wygasanie wzrostu, powrót ceny/przychodów, zmiana
liczby akcji. Cena = dzisiejsza cena × wzrost przychodów × zmiana wielokrotności ÷ zmiana liczby akcji.
Uzasadnienie w jednym zdaniu, np. „Przychody rosły 20% rocznie, zakładam ok. 8% rocznie przez 5 lat; cena/przychody
spadnie z 8 do ok. 5,3” (liczby z faktów pełnego uniwersum).

### Drzewa decyzyjne (gradient boosting)
Kolejne małe drzewa decyzyjne, z których każde poprawia błąd poprzednich. Parametry ustalone **przed** treningiem,
żeby nie dopasowywać ich do wyniku egzaminu:

| parametr | wartość |
|---|---|
| głębokość drzewa | 4 |
| krok uczenia | 0,05 |
| najmniej obserwacji w liściu | 200 |
| najwięcej drzew | 400, z wcześniejszym zatrzymaniem na ostatnim roku pamięci |
| funkcja straty | błąd bezwzględny (przewiduje medianę) |
| wartości skrajne cech | obcięte do 1. i 99. centyla danych uczących |

Uzasadnienie: trzy cechy, które najbardziej przesunęły prognozę dla tej spółki.

### Sieć neuronowa (warunkowa)
Mała sieć: dwie warstwy ukryte po 32 neurony, te same wejścia i wyjście co drzewa, cechy standaryzowane na danych
uczących, regularyzacja L2, wcześniejsze zatrzymanie na ostatnim roku pamięci. Uzasadnienia nie podaje —
w terminalu widać „nie potrafi wyjaśnić”.

Implementacja wszystkich trzech: w TypeScript, w repozytorium, bez nowych zewnętrznych bibliotek — jeden zestaw
narzędzi na komputerze właściciela. Trening uruchamiany jako **jedno zadanie o obniżonym priorytecie**.

## 6. Wyjście specjalisty dla spółki

1. Prognoza ceny po 1, 2, 3, 4, 5 latach: mediana i pas 80%.
2. Trzy ceny zakupu — temperamenty (punkt 6a).
3. Jedno zdanie uzasadnienia (prosty i drzewa) albo „nie potrafi wyjaśnić” (sieć).
4. **„Nie wiem”** — specjalista wstrzymuje się, gdy spółka wypada poza to, na czym się uczył: brak wymaganych danych
   (np. banki bez przychodów w standardowych pozycjach) albo co najmniej jedna kluczowa cecha poza 1.–99. centylem
   jego danych uczących. Liczba wstrzymanych głosów jest widoczna w karcie spółki.

### 6a. Cena zakupu

Temperament = wymagany zwrot roczny: **agresywny 6%, zrównoważony 9%, ostrożny 13%** (sekcja 4 planu).

Cena zakupu = **średnia z pięciu cen zakupu**, liczonych osobno dla horyzontów H = 1, 2, 3, 4, 5 lat
**[decyzja właściciela]**. Dla każdego horyzontu: najwyższa cena, przy której mediana prognozy daje co najmniej
wymagany zwrot:

> prognoza_H(P) + dywidendy_H(P) ≥ P × (1 + r)^H

- **Dywidendy wliczone** do wymaganego zwrotu **[decyzja właściciela]**; w prognozach cen nadal pokazywane osobno.
- Skutek średniej: ceny trzech temperamentów są bliżej siebie i bliżej dzisiejszego kursu niż przy samym horyzoncie
  5-letnim (krótkie horyzonty dyskontują mniej). Przykład przy prognozach 108/117/127/138/150 za 1–5 lat, bez dywidend:
  średnia 106,8 / 98,2 / 88,3 zamiast 112,1 / 97,5 / 81,4 dla samego 5-letniego horyzontu. Ostrożny kupuje częściej.
  (Poprawka rachunkowa 2026-09-17: wcześniej podane 107,0 / 98,4 / 88,4 i 111,8 / 97,3 / 81,2 nie wynikały dokładnie
  z tych prognoz; ten sam rachunek sprawdza test `tests/buy-price.test.ts`.)

Prognoza sama zależy od ceny: przy niższej cenie spółka jest tańsza, więc jej wycena ma więcej miejsca do powrotu.
Dlatego cena zakupu jest szukana krok po kroku (bisekcja po cenie), a nie liczona z dzisiejszej prognozy.
Dla modelu prostego istnieje wzór zamknięty: P* = (K / (1+r)^H)^(1/(1−b)), gdzie b to trwałość wyceny.

**Znane ryzyko:** przy trwałości wyceny b ≈ 0,73 (5 lat) błąd prognozy przenosi się na cenę zakupu ze wzmocnieniem
ok. 3,7×, a przy b ≈ 0,84 (pamięć z lat 2014–2017) — ok. 6×. Dla krótkich horyzontów trwałość jest wyższa (ok. 0,88 po
roku), więc wzmocnienie jest największe — średnia z 1–5 lat zawiera właśnie te najbardziej rozchwiane ceny. Stąd warunek
K6 w egzaminie; jeśli K6 nie zostanie zdany, raport pokaże, które horyzonty psują stabilność, i decyzja wróci do właściciela.

## 7. Egzamin — taki sam dla wszystkich

Egzamin „kroczący”: co roku nowy trening na danych znanych w tym momencie, prognozy na kolejny rok, decyzje z lat
2016–2021 (okres treningowy). Sejf 2023–2025 nietknięty. Obserwacje z tego samego kwartału są zależne — przedziały
ufności bootstrapem po kwartałach, testy porównawcze z korektą Newey-West.

| # | warunek | próg | skąd |
|---|---|---|---|
| K1 | pas 80% zawiera prawdziwą cenę | 72–88% dla każdego horyzontu | preregistracja |
| K2 | zakup po cenie zrównoważonej bije kupno S&P 500 w tym samym dniu (zwrot całkowity) | średnia nadwyżka > 0 i dolna granica CI95 > 0 | preregistracja |
| K3 | lepszy od „cena się nie zmieni” | niższa strata kwantylowa, DM p < 0,0167 | preregistracja |
| K4 | lepszy od „stała wielokrotność” | niższa strata kwantylowa, DM p < 0,0167 | preregistracja |
| K6 | cena zakupu nie skacze bez powodu | mediana \|zmiany\| ceny zrównoważonej między kolejnymi kwartałami ≤ 15% | **nowy, dopisany 2026-09-16 przed treningiem** |

Dodatkowo:
- **Bramka dla drzew i sieci:** wchodzą do konsensusu tylko wtedy, gdy zdają K1 i nie są istotnie gorsze od modelu
  prostego z tą samą pamięcią (test Diebolda-Mariano, p < 0,05).
- **Różnorodność:** para specjalistów z korelacją prognoz ≥ 0,95 zostaje połączona w jednego. Cel dla
  zespołu: efektywna liczba niezależnych specjalistów n_eff > 3. (Zmiana 2026-09-17, przed treningiem: pierwotnie
  „korelacja błędów” — uzasadnienie w punkcie 10.)
- **Specjalista, który nie zda K1:** nie ma głosu w konsensusie, ale jest widoczny w szczegółach z oznaczeniem
  „nie zdał egzaminu” **[decyzja właściciela]**.
- K2 wymaga porównania ze zwrotem całkowitym S&P 500 (z dywidendami) — trzeba pobrać notowania funduszu SPY,
  bo w danych jest tylko indeks cenowy ^GSPC.

## 8. Konsensus (zapowiedź kroku e)

Dla każdego temperamentu: **mediana** cen zakupu specjalistów, którzy mają głos i się nie wstrzymali.
Wagi **[decyzja właściciela]**: równe głosy do czasu egzaminu, potem wagi według wyniku egzaminu (sposób liczenia wag
ustalimy i zapiszemy przed pierwszym egzaminem).
Do sprawdzenia przy konsensusie: środek prognozy może być zawyżony przez ocalałe spółki o ok. 5–11 p.p. po 5 latach
(krok c2).

## 9. Koszt obliczeń (szacunek)

Egzamin: 6 lat treningów × 5 horyzontów × 3 długości pamięci. Model prosty — sekundy. Drzewa — ok. 1–2 godzin,
sieć — podobnie lub dłużej. Uruchamiane pojedynczo, z obniżonym priorytetem, najlepiej w nocy.

## 10. Doprecyzowania zapisane przed treningiem (2026-09-17)

Kod specjalistów i egzaminu powstał 2026-09-17, **przed jakimkolwiek treningiem na prawdziwych danych** (sprawdzony
testami i jednym przebiegiem na danych sztucznych, których wyniki nie są raportowane). Poniższe reguły obowiązują
od tej chwili; zmiana po zobaczeniu wyników egzaminu wymaga opisania jej jako zmiany po fakcie.

**Kalendarz i pamięć** (`src/specialist-memory.ts`)
- Treningi 15 lutego 2016–2021; model obsługuje decyzje do następnego lutego. Decyzje egzaminu: 2016–2021.
- Pamięć M lat = wynik zrealizowany w przedziale (dzień treningu − M, dzień treningu]. Walidacja do wcześniejszego
  zatrzymania = ostatni rok pamięci; model końcowy uczy się na całej pamięci z wybraną liczbą drzew / epok.
- Do pamięci wchodzą obserwacje ze znanym wynikiem i obiema kluczowymi cechami: cena/przychody oraz tempo wzrostu
  przychodów z 3 lat. Model powstaje, gdy pamięć ma ≥ 1 000 obserwacji, a jej ostatni rok ≥ 300 — ta sama reguła
  dla wszystkich metod. Inaczej specjalista nie ma modelu dla tego horyzontu.
- Nie stosujemy dodatkowego podziału po spółkach (plan, „Podział danych”): w egzaminie kroczącym wyniki z pamięci
  kończą się najpóźniej w dniu treningu, a oceniane decyzje zaczynają się tego dnia lub później — okna się nie nakładają.

**Pas i mediana** (`src/specialists.ts`)
- Centyle 10/50/90 błędów (prawdziwa zmiana − surowa prognoza) na całej pamięci. Mediana = surowa prognoza + 50. centyl,
  pas 80% = surowa prognoza + 10. i 90. centyl. Jedna metoda dla wszystkich.

**Parametry techniczne ustalone teraz**
- Drzewa: dodatkowo 64 przedziały wartości cechy, zatrzymanie po 50 drzewach bez poprawy na walidacji.
- Sieć: ReLU, Adam (krok 0,001), paczki po 256, L2 = 0,0001, najwyżej 100 epok, zatrzymanie po 10 epokach bez poprawy,
  brak wartości = 0 plus kolumna „brak danych”, ziarno losowości wyznaczone z nazwy specjalisty, dnia treningu i horyzontu.

**Wstrzymanie się od głosu**
- Kluczowe cechy: cena/przychody i tempo wzrostu przychodów z 3 lat. Brak którejś albo wartość poza 1.–99. centylem
  pamięci tego specjalisty = „nie wiem” dla danego horyzontu. Cena zakupu wymaga prognoz dla wszystkich 5 horyzontów.

**Cena zakupu** (`src/buy-price.ts`)
- Szukana wyłącznie w zakresie cen, przy których cena/przychody spółki mieści się między 1. a 99. centylem pamięci
  specjalisty (81 punktów siatki, potem 20 kroków bisekcji). Poza tym zakresem drzewa i sieć nie mają oparcia w danych.
  Jeśli warunek nie jest spełniony nawet na dole zakresu albo jest spełniony jeszcze na górze, cena = granica zakresu
  z oznaczeniem; udział takich cen jest w raporcie.
- Brak dywidend w raporcie spółki liczony jako brak dywidendy; udział takich przypadków jest w raporcie.

**Punkty odniesienia**
- K3 „cena się nie zmieni”: mediana 0, pas z centyli zrealizowanych zmian ceny w tej samej pamięci.
- K4 „stała wielokrotność”: model prosty z tą samą pamięcią bez powrotu wyceny (wzrost przychodów i zmiana liczby
  akcji jak w modelu prostym, cena/przychody bez zmian).
- Informacyjnie „typowy zwrot”: mediana zrealizowanych zmian ceny w pamięci, bez patrzenia na spółkę.

**Egzamin** (`src/specialist-exam.ts`, `src/limit-backtest.ts`)
- K1 zmierzone, gdy jest ≥ 100 ocenionych prognoz z ≥ 4 kwartałów. Głos: K1 PASS na wszystkich 5 horyzontach.
- K3, K4 i bramka: strata kwantylowa (centyle 10/50/90) uśredniona w każdym kwartale, test Diebolda-Mariano na szeregu
  kwartalnym z korektą Newey-West (opóźnienie 4h − 1). Test tylko przy co najmniej 2 nienachodzących na siebie oknach
  h-letnich (kwartałów ≥ 8h); inaczej „brak pomiaru”. Przy danych z 2016–2021 oznacza to zwykle brak testu dla 4–5 lat.
- Bramka: FAIL, gdy na którymkolwiek zmierzonym horyzoncie strata jest wyższa przy p < 0,05; PASS, gdy zmierzono co
  najmniej jeden horyzont i żaden nie jest FAIL.
- K2: zlecenie ważne od następnej sesji do dnia następnej decyzji (3 miesiące), realizacja po pierwszym zamknięciu
  ≤ cena zrównoważona, po tym zamknięciu. Trzymanie **1 rok**; zwrot z dywidendami spółki minus zwrot SPY z tych samych
  dni. Średnia po transakcjach; CI95 bootstrapem ruchomych bloków po 4 kwartały decyzji (roczne trzymania zachodzą na
  siebie). Pomiar od 30 transakcji z 4 kwartałów. Informacyjnie: zakup bez limitu w następnej sesji — pokazuje, ile daje
  sam wybór spółek z panelu (zawyżony przez błąd przetrwania) — oraz te same transakcje względem funduszu całego rynku
  USA (VTI: NYSE, Nasdaq, także małe spółki; dopisane 2026-09-17 na prośbę właściciela, przed egzaminem). Kryterium K2
  zostaje względem S&P 500, jak w preregistracji: to fundusz, który realnie można kupić zamiast akcji.
- K6: pary kolejnych kwartałów tej samej spółki (decyzje odległe o 3 miesiące); dodatkowo ta sama miara dla każdego
  horyzontu osobno, żeby było widać, które składniki średniej są rozchwiane.
- **Różnorodność — zmiana miary.** Korelacja *błędów* jest bliska 1 dla każdych dwóch prognoz, gdy prawdziwy ruch
  kursu jest dużo większy niż różnice między prognozami (tak jest przy cenach akcji). Pokazuje to test na danych
  sztucznych: dwie niezależne prognozy mają korelację błędów > 0,95 i korelację prognoz ≈ 0. Reguła łączenia i n_eff
  liczone są więc z korelacji median prognoz; korelacja błędów zostaje w raporcie informacyjnie.

**Wagi głosów po egzaminie (propozycja do kroku e, zapisana przed egzaminem)**
- Waga specjalisty z głosem ∝ 1 / średnia strata kwantylowa (horyzonty 1–5, obserwacje ocenione przez wszystkich
  głosujących); bez głosu = 0. Właściciel może tę regułę zmienić **przed** uruchomieniem egzaminu.

**Czego spodziewamy się po danych (zanim zobaczymy wyniki)**
- Tempo wzrostu z 3 lat jest w panelu od 2012–2013 r., więc modele dla 4–5 lat powstaną dopiero w treningach
  2017–2019. Ceny zakupu (wymagają wszystkich 5 horyzontów) będą więc tylko dla decyzji z ok. 2018–2021 i tylko na nich
  zmierzymy K2 i K6.

**Uruchomienie** (każdy skrypt sam obniża swój priorytet; przerwany egzamin można wznowić)
1. `npm run download:market` — notowania SPY i VTI do K2.
2. `npm run specialists:features` — dopisanie zmiany kursu 12-1 i zmiany liczby akcji (czyta notowania z dysku E:).
3. `npm run specialists:exam -- --method simple` — model prosty i punkty odniesienia.
4. `npm run specialists:exam -- --method trees --probe`, potem `--method trees` — drzewa.
5. `npm run specialists:exam -- --method nn --probe`, potem `--method nn` — sieć.
6. `npm run specialists:report` — raport `artifacts/universe/specialists-exam.md`.
