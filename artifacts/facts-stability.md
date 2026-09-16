# Czy fakty zmieniają się w czasie?

Wygenerowano: 2026-09-16T17:38:21.127Z.

Pytanie: czy budować osobnych specjalistów uczonych na różnych okresach.
Reguła zapisana przed pomiarem: fakty są różne w czasie, gdy przedziały ufności 95% nie nachodzą
na siebie dla co najmniej **3 z 5** horyzontów.

| okres | wierszy panelu | kwartałów |
|---|---|---|
| 2009-2013 | 3300 | 17 |
| 2014-2017 | 4318 | 16 |
| 2018-2021 | 5402 | 16 |

Uwaga: przy horyzoncie 5 lat wynik wiersza z 2013 r. realizuje się w 2018 r., czyli już w następnym okresie.
Okresy dzielą daty **decyzji**, nie daty wyników — inaczej nie dałoby się ich rozdzielić.

## wygasanie wzrostu (trwałość dotychczasowego tempa)

Współczynnik trwałości (o tym mówi reguła):

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.261 [0.215; 0.330] | 0.277 [0.210; 0.358] | -0.013 [-0.416; 0.231] | zgodne |
| 2 lat | 0.251 [0.224; 0.287] | 0.203 [0.167; 0.251] | -0.003 [-0.242; 0.180] | RÓŻNE |
| 3 lat | 0.197 [0.163; 0.247] | 0.209 [0.178; 0.243] | 0.091 [-0.087; 0.238] | zgodne |
| 4 lat | 0.150 [0.117; 0.200] | 0.243 [0.218; 0.269] | 0.096 [-0.035; 0.199] | RÓŻNE |
| 5 lat | 0.158 [0.130; 0.204] | 0.205 [0.189; 0.227] | 0.111 [-0.000; 0.191] | zgodne |

Stała — poziom niezależny od spółki, czyli wspólny dryf całego rynku w danym okresie.
Traktujemy ją jako informację dodatkową: reguła z preregistracji dotyczy współczynnika trwałości.

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.029 [0.018; 0.039] | 0.029 [0.010; 0.048] | 0.087 [0.037; 0.148] | zgodne |
| 2 lat | 0.023 [0.020; 0.028] | 0.034 [0.018; 0.048] | 0.078 [0.044; 0.114] | RÓŻNE |
| 3 lat | 0.012 [0.007; 0.019] | 0.033 [0.024; 0.042] | 0.070 [0.048; 0.091] | RÓŻNE |
| 4 lat | 0.015 [0.011; 0.019] | 0.031 [0.028; 0.035] | 0.068 [0.057; 0.081] | RÓŻNE |
| 5 lat | 0.021 [0.017; 0.024] | 0.037 [0.030; 0.046] | 0.063 [0.053; 0.076] | RÓŻNE |

**Wniosek z reguły: STABILNE (2/5 horyzontów różnych) — jeden wspólny fakt wystarcza.**

### O ile różnią się same prognozy

Dwa modele o różnych współczynnikach mogą przewidywać prawie to samo, bo stała i nachylenie
kompensują się nawzajem. Dlatego poniżej każdy model z osobnego okresu liczy prognozę dla **tych samych**
spółek (całego panelu), a porównywana jest największa rozbieżność między okresami.

| horyzont | średnia rozbieżność prognoz | przełożenie na cenę po tylu latach |
|---|---|---|
| 1 lat | 4.42 p.p. rocznie | 4.4% |
| 2 lat | 4.12 p.p. rocznie | 8.4% |
| 3 lat | 5.09 p.p. rocznie | 16.1% |
| 4 lat | 5.05 p.p. rocznie | 21.8% |
| 5 lat | 3.98 p.p. rocznie | 21.6% |

Ostatnia kolumna mówi, o ile różniłaby się przewidywana cena, gdyby użyć modelu z innego okresu.

## powrót wielokrotności (trwałość dzisiejszej wyceny)

Współczynnik trwałości (o tym mówi reguła):

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.895 [0.868; 0.922] | 0.944 [0.925; 0.965] | 0.915 [0.845; 0.979] | RÓŻNE |
| 2 lat | 0.849 [0.824; 0.878] | 0.942 [0.920; 0.965] | 0.884 [0.834; 0.944] | RÓŻNE |
| 3 lat | 0.824 [0.798; 0.859] | 0.952 [0.938; 0.972] | 0.876 [0.849; 0.912] | RÓŻNE |
| 4 lat | 0.802 [0.774; 0.838] | 0.960 [0.946; 0.974] | 0.867 [0.829; 0.905] | RÓŻNE |
| 5 lat | 0.794 [0.762; 0.827] | 0.929 [0.903; 0.951] | 0.850 [0.808; 0.895] | RÓŻNE |

Stała — poziom niezależny od spółki, czyli wspólny dryf całego rynku w danym okresie.
Traktujemy ją jako informację dodatkową: reguła z preregistracji dotyczy współczynnika trwałości.

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.119 [0.070; 0.169] | 0.088 [0.034; 0.145] | 0.104 [-0.020; 0.247] | zgodne |
| 2 lat | 0.219 [0.158; 0.276] | 0.119 [0.064; 0.178] | 0.126 [0.002; 0.222] | zgodne |
| 3 lat | 0.292 [0.239; 0.339] | 0.142 [0.078; 0.196] | 0.152 [0.088; 0.208] | RÓŻNE |
| 4 lat | 0.362 [0.321; 0.397] | 0.208 [0.159; 0.261] | 0.127 [0.066; 0.198] | RÓŻNE |
| 5 lat | 0.411 [0.355; 0.457] | 0.246 [0.170; 0.333] | 0.165 [0.101; 0.231] | RÓŻNE |

**Wniosek z reguły: RÓŻNE W CZASIE (5/5 horyzontów) — specjaliści od okresów mają uzasadnienie.**

### O ile różnią się same prognozy

Dwa modele o różnych współczynnikach mogą przewidywać prawie to samo, bo stała i nachylenie
kompensują się nawzajem. Dlatego poniżej każdy model z osobnego okresu liczy prognozę dla **tych samych**
spółek (całego panelu), a porównywana jest największa rozbieżność między okresami.

| horyzont | średnia rozbieżność prognoz | przełożenie na cenę po tylu latach |
|---|---|---|
| 1 lat | 3.9% (log) | 3.9% |
| 2 lat | 9.6% (log) | 10.1% |
| 3 lat | 13.5% (log) | 14.5% |
| 4 lat | 23.1% (log) | 26.0% |
| 5 lat | 22.9% (log) | 25.8% |

Ostatnia kolumna mówi, o ile różniłaby się przewidywana cena, gdyby użyć modelu z innego okresu.
