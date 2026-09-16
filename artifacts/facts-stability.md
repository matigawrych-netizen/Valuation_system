# Czy fakty zmieniają się w czasie?

Wygenerowano: 2026-09-16T00:10:25.345Z.

Pytanie: czy budować osobnych specjalistów uczonych na różnych okresach.
Reguła zapisana przed pomiarem: fakty są różne w czasie, gdy przedziały ufności 95% nie nachodzą
na siebie dla co najmniej **3 z 5** horyzontów.

| okres | wierszy panelu | kwartałów |
|---|---|---|
| 2009-2013 | 3430 | 17 |
| 2014-2017 | 4607 | 16 |
| 2018-2021 | 5775 | 16 |

Uwaga: przy horyzoncie 5 lat wynik wiersza z 2013 r. realizuje się w 2018 r., czyli już w następnym okresie.
Okresy dzielą daty **decyzji**, nie daty wyników — inaczej nie dałoby się ich rozdzielić.

## wygasanie wzrostu (trwałość dotychczasowego tempa)

Współczynnik trwałości (o tym mówi reguła):

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.278 [0.233; 0.345] | 0.292 [0.226; 0.371] | -0.026 [-0.432; 0.206] | RÓŻNE |
| 2 lat | 0.253 [0.226; 0.285] | 0.221 [0.184; 0.268] | -0.002 [-0.234; 0.160] | RÓŻNE |
| 3 lat | 0.201 [0.161; 0.255] | 0.221 [0.195; 0.252] | 0.087 [-0.080; 0.221] | zgodne |
| 4 lat | 0.155 [0.120; 0.203] | 0.249 [0.228; 0.274] | 0.100 [-0.020; 0.195] | RÓŻNE |
| 5 lat | 0.170 [0.142; 0.215] | 0.219 [0.204; 0.239] | 0.115 [0.007; 0.192] | RÓŻNE |

Stała — poziom niezależny od spółki, czyli wspólny dryf całego rynku w danym okresie.
Traktujemy ją jako informację dodatkową: reguła z preregistracji dotyczy współczynnika trwałości.

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.030 [0.019; 0.040] | 0.027 [0.009; 0.046] | 0.089 [0.040; 0.151] | RÓŻNE |
| 2 lat | 0.024 [0.021; 0.030] | 0.033 [0.018; 0.047] | 0.079 [0.048; 0.114] | RÓŻNE |
| 3 lat | 0.013 [0.008; 0.020] | 0.033 [0.024; 0.042] | 0.071 [0.050; 0.091] | RÓŻNE |
| 4 lat | 0.016 [0.012; 0.020] | 0.031 [0.028; 0.035] | 0.069 [0.058; 0.080] | RÓŻNE |
| 5 lat | 0.021 [0.018; 0.023] | 0.037 [0.030; 0.045] | 0.063 [0.053; 0.075] | RÓŻNE |

**Wniosek z reguły: RÓŻNE W CZASIE (4/5 horyzontów) — specjaliści od okresów mają uzasadnienie.**

### O ile różnią się same prognozy

Dwa modele o różnych współczynnikach mogą przewidywać prawie to samo, bo stała i nachylenie
kompensują się nawzajem. Dlatego poniżej każdy model z osobnego okresu liczy prognozę dla **tych samych**
spółek (całego panelu), a porównywana jest największa rozbieżność między okresami.

| horyzont | średnia rozbieżność prognoz | przełożenie na cenę po tylu latach |
|---|---|---|
| 1 lat | 4.65 p.p. rocznie | 4.6% |
| 2 lat | 4.14 p.p. rocznie | 8.5% |
| 3 lat | 5.03 p.p. rocznie | 15.9% |
| 4 lat | 4.97 p.p. rocznie | 21.4% |
| 5 lat | 3.93 p.p. rocznie | 21.3% |

Ostatnia kolumna mówi, o ile różniłaby się przewidywana cena, gdyby użyć modelu z innego okresu.

## powrót wielokrotności (trwałość dzisiejszej wyceny)

Współczynnik trwałości (o tym mówi reguła):

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.903 [0.879; 0.927] | 0.949 [0.929; 0.968] | 0.914 [0.845; 0.973] | RÓŻNE |
| 2 lat | 0.864 [0.843; 0.891] | 0.949 [0.926; 0.972] | 0.882 [0.833; 0.936] | RÓŻNE |
| 3 lat | 0.842 [0.818; 0.872] | 0.960 [0.942; 0.978] | 0.875 [0.851; 0.904] | RÓŻNE |
| 4 lat | 0.823 [0.798; 0.854] | 0.964 [0.949; 0.978] | 0.869 [0.835; 0.899] | RÓŻNE |
| 5 lat | 0.817 [0.789; 0.849] | 0.931 [0.904; 0.955] | 0.850 [0.812; 0.890] | RÓŻNE |

Stała — poziom niezależny od spółki, czyli wspólny dryf całego rynku w danym okresie.
Traktujemy ją jako informację dodatkową: reguła z preregistracji dotyczy współczynnika trwałości.

| horyzont | 2009-2013 | 2014-2017 | 2018-2021 | ocena |
|---|---|---|---|---|
| 1 lat | 0.117 [0.068; 0.164] | 0.085 [0.032; 0.142] | 0.106 [-0.014; 0.246] | zgodne |
| 2 lat | 0.214 [0.153; 0.270] | 0.113 [0.058; 0.174] | 0.134 [0.012; 0.230] | zgodne |
| 3 lat | 0.284 [0.230; 0.332] | 0.138 [0.075; 0.193] | 0.157 [0.094; 0.216] | RÓŻNE |
| 4 lat | 0.351 [0.312; 0.387] | 0.205 [0.157; 0.259] | 0.127 [0.068; 0.191] | RÓŻNE |
| 5 lat | 0.402 [0.345; 0.448] | 0.245 [0.170; 0.333] | 0.165 [0.107; 0.226] | RÓŻNE |

**Wniosek z reguły: RÓŻNE W CZASIE (5/5 horyzontów) — specjaliści od okresów mają uzasadnienie.**

### O ile różnią się same prognozy

Dwa modele o różnych współczynnikach mogą przewidywać prawie to samo, bo stała i nachylenie
kompensują się nawzajem. Dlatego poniżej każdy model z osobnego okresu liczy prognozę dla **tych samych**
spółek (całego panelu), a porównywana jest największa rozbieżność między okresami.

| horyzont | średnia rozbieżność prognoz | przełożenie na cenę po tylu latach |
|---|---|---|
| 1 lat | 3.6% (log) | 3.7% |
| 2 lat | 9.6% (log) | 10.1% |
| 3 lat | 13.6% (log) | 14.5% |
| 4 lat | 22.9% (log) | 25.7% |
| 5 lat | 23.0% (log) | 25.9% |

Ostatnia kolumna mówi, o ile różniłaby się przewidywana cena, gdyby użyć modelu z innego okresu.
