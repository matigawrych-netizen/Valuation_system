# Zdarzenia końcowe spółek z formularzy SEC

Wygenerowano: 2026-09-15T23:56:21.828Z. Źródło: listy formularzy z EDGAR oraz `dei:EntityPublicFloat`.

Po co ten raport: dotychczasowy cache znał niemal wyłącznie spółki, które nadal są w indeksie,
więc model uczył się na tych, które przetrwały. Poniżej jest zmierzone, ile spółek zniknęło i dlaczego.

## 1. Pokrycie danych

| grupa | spółek | ma listę formularzy | brak |
|---|---|---|---|
| wszystkie ze składu | 818 | 817 | 1 |
| obecne w indeksie | 491 | 491 | 0 |
| usunięte z indeksu | 338 | 337 | 1 |

## 2. Zdarzenia końcowe

| rodzaj zdarzenia | spółek ogółem | w tym usunięte z indeksu | w tym nadal w indeksie |
|---|---|---|---|
| upadłość (8-K 1.03) | 33 | 25 | 9 |
| zawiadomienie o wycofaniu (8-K 3.01) | 306 | 185 | 128 |
| wycofanie z giełdy (formularz 25) | 487 | 221 | 275 |
| koniec raportowania (formularz 15) | 355 | 190 | 169 |

Uwaga: wycofanie z giełdy i koniec raportowania towarzyszą także **przejęciom** — same w sobie nie oznaczają kłopotów.

## 3. Upadłości a powód usunięcia ze składu indeksu

| powód w składzie indeksu | spółek | z 8-K 1.03 (upadłość) |
|---|---|---|
| index_decision | 181 | 17 |
| acquisition | 146 | 6 |
| merger | 7 | 0 |
| bankruptcy | 3 | 2 |
| delisting_other | 1 | 0 |

## 4. Zgłoszenia upadłości i skutek dla akcjonariusza (33)

Samo zgłoszenie 8-K punkt 1.03 nie oznacza, że akcjonariusz stracił: EDGAR oznacza tak również
upadłości spółek zależnych i zatwierdzenia układu przy wychodzeniu z upadłości.
Rozstrzygamy tylko przypadki, w których spółka przestała raportować — wtedy dawne akcje przepadły.
Gdy spółka raportuje dalej, po reorganizacji stare akcje są zwykle umarzane i emitowane nowe,
więc kurs jednej akcji przed i po jest nieporównywalny; takie przypadki zostają nierozstrzygnięte.

| ticker | data 8-K 1.03 | rozstrzygnięcie | kurs przed | kurs po | zmiana liczby akcji | kursy porównywalne? |
|---|---|---|---|---|---|---|
| TGNA | 2004-12-17 | upadłość, spółka dalej raportuje — nierozstrzygnięte | — | 3.73 | — | nie |
| CE | 2005-01-28 | upadłość, spółka dalej raportuje — nierozstrzygnięte | — | 23.64 | — | nie |
| DAL | 2005-09-15 | upadłość, spółka dalej raportuje — nierozstrzygnięte | — | 11.79 | — | nie |
| ETR | 2005-09-28 | upadłość, spółka dalej raportuje — nierozstrzygnięte | — | 77.63 | — | nie |
| UAL | 2006-01-23 | upadłość, spółka dalej raportuje — nierozstrzygnięte | — | 24.26 | — | nie |
| LEH | 2008-09-19 | upadłość, spółka dalej raportuje — nierozstrzygnięte | — | — | — | nie |
| TRB | 2008-12-11 | upadłość i koniec raportowania — akcje przepadły | — | — | — | nie |
| CHTR | 2009-03-27 | upadłość, spółka dalej raportuje — nierozstrzygnięte | — | 11.81 | — | nie |
| ABK | 2010-11-10 | upadłość, spółka dalej raportuje — nierozstrzygnięte | — | 0.10 | — | nie |
| DUK | 2011-07-07 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 18.79 | 23.00 | 0% | tak |
| AAL | 2011-11-29 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 5.37 | 1.00 | 0% | tak |
| T | 2012-01-13 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 31.40 | 35.88 | -3% | tak |
| EK | 2012-01-19 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 3.70 | 0.22 | 1% | tak |
| RSH | 2015-02-11 | upadłość i koniec raportowania — akcje przepadły | 2.53 | — | — | nie |
| BTU | 2016-04-13 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 16.21 | 1.37 | -93% | nie |
| WFR | 2016-04-27 | upadłość i koniec raportowania — akcje przepadły | 22.58 | — | — | nie |
| AV | 2017-01-19 | upadłość i koniec raportowania — akcje przepadły | — | — | — | nie |
| NRG | 2017-06-14 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 13.26 | 15.42 | 0% | tak |
| FE | 2018-04-05 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 29.08 | 35.20 | 9% | tak |
| SHLD | 2018-10-15 | upadłość i koniec raportowania — akcje przepadły | 1.86 | — | — | nie |
| PCG | 2019-01-14 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 43.74 | 22.92 | 2% | tak |
| DF | 2019-11-12 | upadłość i koniec raportowania — akcje przepadły | 0.67 | — | — | nie |
| FTR | 2020-04-15 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 1.72 | 0.10 | -0% | tak |
| DO | 2020-04-27 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 4.16 | 0.12 | 0% | tak |
| CHK | 2020-06-29 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 1.35 | 4.91 | -99% | nie |
| DNR | 2020-07-30 | upadłość i koniec raportowania — akcje przepadły | 0.27 | 76.62 | -90% | nie |
| ESV | 2020-08-19 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 0.53 | 25.33 | -62% | nie |
| MNK | 2020-10-13 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 2.75 | 0.46 | 0% | tak |
| ENDP | 2022-08-17 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 0.47 | 0.02 | 0% | tak |
| SIVB | 2023-03-10 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 394.98 | — | — | nie |
| RAD | 2023-10-16 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 7.92 | — | — | nie |
| BIG | 2024-09-10 | upadłość, spółka dalej raportuje — nierozstrzygnięte | 10.10 | — | — | nie |
| ECHO | 2026-08-03 | upadłość, spółka dalej raportuje — nierozstrzygnięte | — | — | — | nie |

## 5. Rozkład skutków

| skutek | spółek |
|---|---|
| zniknięcie z giełdy bez upadłości | 457 |
| brak zdarzenia końcowego | 327 |
| upadłość, spółka dalej raportuje — nierozstrzygnięte | 26 |
| upadłość i koniec raportowania — akcje przepadły | 7 |

Przybliżony kurs z raportów SEC udało się policzyć dla 703 z 817 spółek.
Tam, gdzie go nie ma, skutek albo wynika z trwałego zaprzestania raportowania, albo pozostaje nierozstrzygnięty —
i jest tak oznaczony, zamiast być zastąpiony założeniem.

## 6. Spółki usunięte bez żadnego zdarzenia końcowego: 86

Najczęściej to przejęcia, w których wyrejestrowania dokonuje spółka przejmująca pod własnym numerem CIK,
albo usunięcia decyzją komitetu indeksu przy dalszym notowaniu spółki.

## 7. Spółki bez listy formularzy w cache: 1

Uruchom `npx tsx scripts/download-submissions.ts --only-missing`. Dopóki ich brakuje, pomiar udziału zdarzeń jest zaniżony.
