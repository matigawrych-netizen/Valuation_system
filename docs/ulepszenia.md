# Ulepszenia po egzaminie specjalistów

Wszystko w tym pliku powstaje **po** zobaczeniu wyników egzaminu z 2026-09-17 (`docs/RAPORT-KROK-D.md`), więc są to
zmiany po fakcie. Zasady:

1. Każde ulepszenie ma zapisane **przed pomiarem**: pytanie, miarę, próg i to, co zrobimy przy każdym wyniku.
2. Pierwszy egzamin zostaje nienaruszony (`<UNIVERSE_DATA_DIR>/specialists`). Każde ulepszenie to osobny wariant
   z własnym katalogiem wyników i własnym raportem.
3. Ostatecznym sprawdzianem wersji końcowej jest sejf 2023–2025 (limit 3 użyć), dopiero po zakończeniu ulepszeń.
4. Właściciel 2026-09-17: na razie bez podłączania do głównego programu — tylko ulepszanie.

## U1. Czy pas 80% pasuje do różnych typów spółek

**Zapisane 2026-09-17, przed pomiarem.**

*Pytanie.* Pas 80% ma dziś tę samą szerokość (w logarytmie zmiany ceny) dla każdej spółki. Średnio trafia w 72–76%.
Czy trafia tak samo w spółki spokojne i zmienne, małe i duże, z różnych branż?

*Dane.* Istniejące wyniki egzaminu (decyzje 2016–2021), bez nowego treningu. Prognozujący: Weteran i Reporter
(model prosty, mają głos); informacyjnie Archiwista i Kompas.

*Grupy* — wyłącznie z informacji znanych w dniu decyzji:
- **zmienność kursu z ostatnich 12 miesięcy** (odchylenie dziennych zmian × √252, min. 200 sesji) — 5 grup:
  kwintyle wśród wszystkich decyzji egzaminu z tego samego dnia;
- **wielkość** (kapitalizacja w dniu decyzji) — 5 grup, kwintyle w tym samym dniu;
- **sektor** (dywizja SIC) — sektory z mniej niż 300 ocenionymi prognozami na danym horyzoncie łączone w „inne”.

*Miary* dla każdej grupy i horyzontu: pokrycie pasa, udział wyników poniżej pasa, udział powyżej pasa, liczba
prognoz i kwartałów; pomiar jak w K1 (co najmniej 100 prognoz z 4 kwartałów, inaczej „brak pomiaru”).

*Próg.* Pas **wymaga zależności od zmienności**, jeśli u Weterana na co najmniej 2 z 5 horyzontów pokrycie w grupie
najspokojniejszych albo najbardziej zmiennych spółek leży poza 72–88%. Wielkość i sektor są informacyjne
(osobne ulepszenie tylko wtedy, gdy po poprawce U1b nadal widać odchylenia poza 72–88%).

*Co zrobimy.*
- Próg nie przekroczony → pas zostaje bez zmian, U1b się nie odbywa.
- Próg przekroczony → **U1b**.

## U1b. Pas zależny od zmienności (wykonywane tylko, gdy U1 przekroczy próg)

**Zapisane 2026-09-17, przed pomiarem U1.**

*Zmiana.* Dla każdego prognozującego (specjaliści i punkty odniesienia, żeby porównania K3/K4 zostały uczciwe) 10. i 90.
centyl błędów liczone są osobno w 5 grupach zmienności jego pamięci (granice grup = kwintyle zmienności w pamięci).
Prognoza spółki dostaje pas swojej grupy. **Mediana i cena zakupu bez zmian** — ulepszenie dotyczy tylko szerokości pasa.
Obserwacja bez zmienności (za krótkie notowania) — prognozujący się wstrzymuje („brak zmienności”); liczba takich
przypadków w raporcie.

*Egzamin.* Model prosty i punkty odniesienia, ten sam kalendarz i te same reguły co egzamin z 2026-09-17, wariant `u1`
(wyniki w `<UNIVERSE_DATA_DIR>/specialists/u1`, raport `artifacts/universe/u1/`).

*Poprawka zostaje, gdy u Weterana:* pokrycie ogólne na każdym horyzoncie nadal mieści się w 72–88% **oraz** we wszystkich
5 grupach zmienności pokrycie mieści się w 72–88% na każdym horyzoncie, na którym było mierzone. Inaczej raportujemy
wynik i decyzja wraca do właściciela.

### Wynik U1 i U1b (2026-09-17)

Pełne tabele: `artifacts/universe/band-groups.md` (pierwszy egzamin), `artifacts/universe/u1/band-groups.md` i
`artifacts/universe/u1/specialists-exam.md` (wariant u1).

**U1 — próg przekroczony na 5 z 5 horyzontów.** Pas o jednej szerokości myli się w przeciwne strony (Weteran):

| grupa zmienności | 1 r. | 2 r. | 3 r. | 4 r. | 5 r. |
|---|---|---|---|---|---|
| najspokojniejsze | 87,5% | 89,8% | 87,9% | 89,5% | 87,3% |
| najbardziej zmienne | 52,7% | 54,8% | 56,1% | 60,6% | 59,9% |

To samo dla wielkości (najmniejsze 62–68%, największe 80–83%) i sektorów (usługi 64–72%, energetyka komunalna 87–92%).

**U1b — warunek utrzymania NIESPEŁNIONY, ale na granicy.** Po poprawce (Weteran):

| | 1 r. | 2 r. | 3 r. | 4 r. | 5 r. |
|---|---|---|---|---|---|
| pokrycie ogólne (było) | 77,3% (72,3%) | 79,8% (74,9%) | 80,2% (74,7%) | 81,9% (75,6%) | 82,3% (73,7%) |
| najspokojniejsze (było) | 79,7% (87,5%) | 82,0% (89,8%) | 80,8% (87,9%) | 85,3% (89,5%) | 87,0% (87,3%) |
| najbardziej zmienne (było) | **69,8%** (52,7%) | **70,2%** (54,8%) | 73,7% (56,1%) | 74,5% (60,6%) | 73,3% (59,9%) |
| strata kwantylowa (było) | 0,255 (0,261) | 0,345 (0,350) | 0,416 (0,422) | 0,486 (0,496) | 0,590 (0,600) |

- Najbardziej zmienne spółki na 1 i 2 lata nadal nieznacznie poniżej 72% — dlatego warunek niespełniony.
- Wszystkie grupy wielkości mieszczą się teraz w 72–88% (73,6–86,9%).
- Sektory poza progiem: górnictwo i energia 1–2 lata (63–65%), usługi 1–2 lata (71%), energetyka komunalna 2 lata (88,6%).
- K2 i K6 bez zmian co do wniosków (mediana i cena zakupu nie zmieniły się); K3 i K4 nadal niezdane — punkty odniesienia
  dostały ten sam rodzaj pasa.

Zgodnie z regułą decyzja o pozostawieniu U1b wraca do właściciela.
