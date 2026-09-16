# Czy fakty zmieniają się w czasie?

Zbiór: **pełne uniwersum (NYSE + Nasdaq, kapitalizacja ≥ 1 mld USD)**.

Wygenerowano: 2026-09-16T19:06:43.442Z.

Pytanie: czy budować osobnych specjalistów uczonych na różnych okresach.
Reguła zapisana przed pomiarem: fakty są różne w czasie, gdy przedziały ufności 95% nie nachodzą
na siebie dla co najmniej **3 z 5** horyzontów.

| okres | wierszy panelu | kwartałów |
|---|---|---|
| 2009-2013 | 8225 | 17 |
| 2014-2017 | 13752 | 16 |
| 2018-2021 | 18222 | 16 |

Uwaga: przy horyzoncie 5 lat wynik wiersza z 2013 r. realizuje się w 2018 r., czyli już w następnym okresie.
Okresy dzielą daty **decyzji**, nie daty wyników — inaczej nie dałoby się ich rozdzielić.

## wygasanie wzrostu (trwałość dotychczasowego tempa)

Współczynnik trwałości (o tym mówi reguła):

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.243 [0.148; 0.308] | 0.245 [0.215; 0.274] | 0.149 [-0.000; 0.260] | zgodne |
| 2 lat | 0.159 [0.098; 0.203] | 0.170 [0.147; 0.193] | 0.117 [0.016; 0.212] | zgodne |
| 3 lat | 0.089 [0.024; 0.132] | 0.152 [0.126; 0.172] | 0.111 [0.038; 0.183] | zgodne |
| 4 lat | 0.053 [-0.026; 0.096] | 0.147 [0.127; 0.160] | 0.102 [0.049; 0.153] | RÓŻNE |
| 5 lat | 0.091 [0.020; 0.125] | 0.132 [0.119; 0.144] | 0.099 [0.054; 0.140] | zgodne |

Stała — poziom niezależny od spółki, czyli wspólny dryf całego rynku w danym okresie.
Traktujemy ją jako informację dodatkową: reguła z preregistracji dotyczy współczynnika trwałości.

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.035 [0.023; 0.047] | 0.047 [0.031; 0.063] | 0.112 [0.061; 0.170] | RÓŻNE |
| 2 lat | 0.028 [0.023; 0.036] | 0.048 [0.035; 0.061] | 0.090 [0.059; 0.122] | RÓŻNE |
| 3 lat | 0.015 [0.010; 0.024] | 0.045 [0.037; 0.054] | 0.080 [0.062; 0.096] | RÓŻNE |
| 4 lat | 0.016 [0.008; 0.022] | 0.042 [0.039; 0.046] | 0.075 [0.067; 0.083] | RÓŻNE |
| 5 lat | 0.018 [0.012; 0.024] | 0.047 [0.041; 0.054] | 0.068 [0.061; 0.076] | RÓŻNE |

**Wniosek z reguły: STABILNE (1/5 horyzontów różnych) — jeden wspólny fakt wystarcza.**

### O ile różnią się same prognozy

Dwa modele o różnych współczynnikach mogą przewidywać prawie to samo, bo stała i nachylenie
kompensują się nawzajem. Dlatego poniżej każdy model z osobnego okresu liczy prognozę dla **tych samych**
spółek (całego panelu), a porównywana jest największa rozbieżność między okresami.

| horyzont | średnia rozbieżność prognoz | przełożenie na cenę po tylu latach |
|---|---|---|
| 1 lat | 6.95 p.p. rocznie | 6.9% |
| 2 lat | 5.82 p.p. rocznie | 12.0% |
| 3 lat | 6.75 p.p. rocznie | 21.6% |
| 4 lat | 6.53 p.p. rocznie | 28.8% |
| 5 lat | 5.13 p.p. rocznie | 28.4% |

Ostatnia kolumna mówi, o ile różniłaby się przewidywana cena, gdyby użyć modelu z innego okresu.

## powrót wielokrotności (trwałość dzisiejszej wyceny)

Współczynnik trwałości (o tym mówi reguła):

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.880 [0.852; 0.906] | 0.929 [0.907; 0.955] | 0.877 [0.828; 0.930] | RÓŻNE |
| 2 lat | 0.838 [0.805; 0.871] | 0.896 [0.861; 0.938] | 0.796 [0.756; 0.856] | RÓŻNE |
| 3 lat | 0.803 [0.772; 0.828] | 0.888 [0.843; 0.934] | 0.744 [0.711; 0.790] | RÓŻNE |
| 4 lat | 0.781 [0.763; 0.799] | 0.872 [0.840; 0.903] | 0.725 [0.691; 0.765] | RÓŻNE |
| 5 lat | 0.765 [0.737; 0.792] | 0.843 [0.827; 0.862] | 0.705 [0.669; 0.749] | RÓŻNE |

Stała — poziom niezależny od spółki, czyli wspólny dryf całego rynku w danym okresie.
Traktujemy ją jako informację dodatkową: reguła z preregistracji dotyczy współczynnika trwałości.

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.108 [0.054; 0.159] | 0.048 [-0.005; 0.107] | 0.051 [-0.080; 0.192] | zgodne |
| 2 lat | 0.176 [0.108; 0.231] | 0.067 [0.001; 0.128] | 0.069 [-0.069; 0.179] | zgodne |
| 3 lat | 0.201 [0.142; 0.261] | 0.065 [-0.019; 0.132] | 0.106 [0.040; 0.168] | RÓŻNE |
| 4 lat | 0.244 [0.197; 0.289] | 0.133 [0.076; 0.192] | 0.035 [-0.029; 0.102] | RÓŻNE |
| 5 lat | 0.285 [0.231; 0.331] | 0.133 [0.035; 0.238] | 0.046 [-0.007; 0.100] | RÓŻNE |

**Wniosek z reguły: RÓŻNE W CZASIE (5/5 horyzontów) — specjaliści od okresów mają uzasadnienie.**

### O ile różnią się same prognozy

Dwa modele o różnych współczynnikach mogą przewidywać prawie to samo, bo stała i nachylenie
kompensują się nawzajem. Dlatego poniżej każdy model z osobnego okresu liczy prognozę dla **tych samych**
spółek (całego panelu), a porównywana jest największa rozbieżność między okresami.

| horyzont | średnia rozbieżność prognoz | przełożenie na cenę po tylu latach |
|---|---|---|
| 1 lat | 8.3% (log) | 8.6% |
| 2 lat | 16.4% (log) | 17.8% |
| 3 lat | 19.2% (log) | 21.2% |
| 4 lat | 28.7% (log) | 33.3% |
| 5 lat | 30.2% (log) | 35.2% |

Ostatnia kolumna mówi, o ile różniłaby się przewidywana cena, gdyby użyć modelu z innego okresu.
