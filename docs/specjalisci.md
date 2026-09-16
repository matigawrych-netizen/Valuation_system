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
| do dodania do panelu | zmiana kursu z ostatnich 12 miesięcy bez ostatniego miesiąca, zmiana liczby akcji w ostatnim roku |

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
  średnia 107,0 / 98,4 / 88,4 zamiast 111,8 / 97,3 / 81,2 dla samego 5-letniego horyzontu. Ostrożny kupuje częściej.

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
- **Różnorodność:** para specjalistów z korelacją błędów prognozy ≥ 0,95 zostaje połączona w jednego. Cel dla
  zespołu: efektywna liczba niezależnych specjalistów n_eff > 3.
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
