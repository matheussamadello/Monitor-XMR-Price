# Zonas automáticas mais próximas das manuais — XMR

Comparação com dados capturados em **2026-09-25T01:36:30.294Z**, mantendo a mesma entrada e o mesmo estado anterior. Base: `6888bce0ace8d081d7a9ee33c87b76cb65a698cc`.

## Mudança cirúrgica

- Teto estrutural total: diário **0,8 → 0,5 ATR diário**; semanal **1,2 → 0,3 ATR semanal**.
- Folga em cada borda: **0,15 → 0,05 ATR de referência**. A referência continua sendo o menor entre o ATR médio dos pivôs e o ATR fechado atual.
- A redução da folga evita gastar 0,3 ATR só em margem, preservando mais espaço para os pivôs dentro do teto menor. Um pivô isolado passa a gerar cerca de 0,1 ATR estrutural, sem se tornar uma linha.
- Clustering, split com evidência, fusão condicionada ao teto, filtros de qualidade, pesos, penalidades e publicação de até três zonas por lado permanecem iguais. Não se corta uma zona deixando seus próprios membros fora.

A tolerância operacional permanece em **centro ±0,25 ATR**, respeitando o teto percentual do par. Toques e rejeições automáticos continuam medidos nessa janela histórica de ATR, não exclusivamente dentro da faixa estrutural desenhada. Isso é diferente da auditoria estrita das faixas manuais. O score não foi artificialmente conservado: depois de um reagrupamento, cada zona recalcula suas interações. A perda de sobreposição semanal pode reduzir o score mesmo com contagens idênticas.

## Comparação diária/semanal

IDs identificam continuidade da região, não igualdade dos membros. Uma linha pode ter menos pivôs e janela histórica diferente depois do reagrupamento. Zonas novas não herdam contagens da antiga.

### XMR/USD — diario

ATR: **39,94337105**. Teto em preço: **19,97168553**. Publicadas: **5 → 5**. Contagens de toques/rejeições iguais em **5 de 5** IDs comparáveis.

| ID | Faixa anterior | Faixa atual | Score antes → agora | Toques antes → agora | Rejeições antes → agora |
|---|---|---|---:|---:|---:|
| usd|diario|z19 | 641,40603524–658,59396476 | 641,40603524–658,59396476 | 26 → 26 | 1 → 1 | 1 → 1 |
| usd|diario|z20 | 793,89849434–805,88150566 | 797,89283145–801,88716855 | 26 → 26 | 1 → 1 | 1 → 1 |
| usd|diario|z26 | 542,6143187–570,8056813 | 546,03877619–549,28122381 | 45 → 45 | 2 → 2 | 1 → 1 |
| usd|diario|z18 | 494,00849434–506,86150566 | 498,00283145–502,86716855 | 76 → 65 | 5 → 5 | 2 → 2 |
| usd|diario|z42 | 479,27854201–495,66145799 | 482,559514–492,380486 | 66 → 53 | 2 → 2 | 2 → 2 |

O conjunto completo não dormente, incluindo zonas candidatas/enfraquecidas fora da seleção pública, passou de 24 para 24. Registros antigos dormentes continuam no estado durante a carência.

### XMR/BTC — diario

ATR: **0,000473**. Teto em preço: **0,0002365**. Publicadas: **5 → 5**. Contagens de toques/rejeições iguais em **5 de 5** IDs comparáveis.

| ID | Faixa anterior | Faixa atual | Score antes → agora | Toques antes → agora | Rejeições antes → agora |
|---|---|---|---:|---:|---:|
| btc|diario|z24 | 0,00694072–0,00715328 | 0,00698024–0,00711376 | 86 → 86 | 4 → 4 | 3 → 3 |
| btc|diario|z20 | 0,00816482–0,00829318 | 0,00820761–0,00825039 | 26 → 26 | 1 → 1 | 1 → 1 |
| btc|diario|z19 | 0,00657122–0,00675278 | 0,00660641–0,00671759 | 80 → 80 | 3 → 3 | 2 → 2 |
| btc|diario|z45 | 0,00635444–0,00646756 | 0,00639215–0,00642985 | 57 → 44 | 2 → 2 | 1 → 1 |
| btc|diario|z17 | 0,00600928–0,00611672 | 0,00604509–0,00608091 | 66 → 66 | 5 → 5 | 2 → 2 |

O conjunto completo não dormente, incluindo zonas candidatas/enfraquecidas fora da seleção pública, passou de 27 para 27. Registros antigos dormentes continuam no estado durante a carência.

### XMR/USD — semanal

ATR: **65,39741157**. Teto em preço: **19,61922347**. Publicadas: **4 → 4**. Contagens de toques/rejeições iguais em **1 de 3** IDs comparáveis.

| ID | Faixa anterior | Faixa atual | Score antes → agora | Toques antes → agora | Rejeições antes → agora |
|---|---|---|---:|---:|---:|
| usd|semanal|z15 | 790,08038826–809,69961174 | 796,62012942–803,15987058 | 30 → 30 | 1 → 1 | 1 → 1 |
| usd|semanal|z14 | 461,41394143–525,68605857 | 467,00437624–472,49562376 | 77 → 82 | 3 → 5 | 2 → 4 |
| usd|semanal|z13 | 410,19038826–465,78961174 | 417,23091597–429,08908403 | 87 → 73 | 5 → 6 | 4 → 3 |
| usd|semanal|z24 | nova na seleção | 375,73012942–385,38987058 | — → 71 | — → 6 | — → 3 |

O conjunto completo não dormente, incluindo zonas candidatas/enfraquecidas fora da seleção pública, passou de 21 para 26. Registros antigos dormentes continuam no estado durante a carência.

### XMR/BTC — semanal

ATR: **0,00076779**. Teto em preço: **0,00023034**. Publicadas: **6 → 6**. Contagens de toques/rejeições iguais em **1 de 5** IDs comparáveis.

| ID | Faixa anterior | Faixa atual | Score antes → agora | Toques antes → agora | Rejeições antes → agora |
|---|---|---|---:|---:|---:|
| btc|semanal|z38 | nova na seleção | 0,00664561–0,00686939 | — → 80 | — → 15 | — → 9 |
| btc|semanal|z21 | 0,00656883–0,00727417 | 0,00698998–0,00706002 | 81 → 86 | 12 → 4 | 8 → 2 |
| btc|semanal|z22 | 0,00690983–0,00761517 | 0,0070966–0,0071944 | 81 → 67 | 9 → 5 | 4 → 2 |
| btc|semanal|z19 | 0,00594883–0,00652517 | 0,00602561–0,00624439 | 76 → 80 | 12 → 12 | 6 → 6 |
| btc|semanal|z6 | 0,00520161–0,00591939 | 0,00562257–0,00584943 | 80 → 67 | 10 → 8 | 5 → 5 |
| btc|semanal|z29 | 0,00505649–0,00572551 | 0,00526161–0,00545339 | 75 → 75 | 15 → 14 | 9 → 9 |

O conjunto completo não dormente, incluindo zonas candidatas/enfraquecidas fora da seleção pública, passou de 31 para 35. Registros antigos dormentes continuam no estado durante a carência.

## Limitações e compatibilidade

O semanal pode continuar mais largo em preço porque seu ATR é maior. Os números escolhidos aproximam as escalas, sem transformar zonas em linhas ou prometer identidade com os manuais. Uma zona de pivô único e score baixo não se torna forte por ficar estreita. Não foi aumentado nenhum score para compensar perda de evidência.

No XMR/USD diário, a zona em torno de 500 manteve cinco toques e duas rejeições, mas o score caiu de 76 para 65 por perder confirmação semanal. Na região semanal em torno de 420–426, o score caiu de 87 para 73. A tabela não representa validação prospectiva ou rentabilidade.

Os cálculos de RSI, DMI/ADX, EMA89, estrutura, divergências, níveis manuais e suas máquinas de estado foram comparados antes/depois e permaneceram iguais. Gatilhos ativos também ficaram idênticos nessa entrada. Nenhuma regra de alerta, prompt, campo canônico ou agendamento foi alterado. Os consumidores externos podem observar outra seleção de zonas, menos confluência ou avisos de manutenção, pois esses dados mudam legitimamente com a geometria. Isso não permite garantir frequência idêntica de notificações externas.

## Verificação reproduzível

```sh
node teste-fumaca.mjs
node teste-auditoria-faixas.mjs
```

O teste de fumaça inclui os novos testes de fronteira, folga e preservação das interações, além de `teste-auto-equivalencia.mjs`, que reproduz o pipeline com [respostas reais congeladas](fixture-auto-equivalencia-2026-09-25.json), valida o [resultado registrado](comparacao-auto-equivalencia-2026-09-25.json) e executa três retries para verificar estabilidade de zonas, IDs e score. Os testes anteriores de split, ausência de microzonas artificiais, fusão, role reversal e qualidade continuam ativos.
