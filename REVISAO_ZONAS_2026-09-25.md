# Revisão de largura das zonas — XMR

Dados capturados em **2026-09-25T01:36:30.294000+00:00**. Comparação dos dois códigos usando os mesmos candles e o mesmo estado inicial. Base: `1f51ccfbdb458f4dc8b843f4f0d90e4e98cdebd3`.

## Causa e alteração

O cluster antigo aceitava distância de até 1 ATR histórico entre seus membros e acrescentava 0,15 ATR por borda. A fusão por sobreposição não voltava a verificar todos os pares nem limitava a largura resultante. Além disso, o ATR dos membros era descartado antes da fusão. O centro suavizado de uma ficha antiga podia ficar entre os novos agrupamentos.

A revisão mantém a arquitetura: pivôs, clusters, episódios, score, casamento e ciclo de vida. Adiciona teto de 0,8 ATR diário e 1,2 ATR semanal na admissão e fusão, incluindo as margens. Separa concentrações com evidência ou conserva o núcleo compacto mais povoado quando não há duas concentrações. Não cria duas zonas a partir de dois pivôs isolados. A janela operacional passa a centro ±0,25 ATR, respeitando o teto percentual do ativo.

O split exige pelo menos dois pivôs de datas diferentes por parte, vão ≥0,2 ATR de referência e ≥2 vezes o espaçamento interno médio de cada lado. A divisão é recursiva. Uma filha não herda o score ou os episódios da mãe: esses valores são recalculados, com os mesmos pesos, penalidades e condições de confirmação. Apenas uma filha pode herdar cada ID anterior. Fichas legadas largas permanecem dormentes no estado durante a carência e não são publicadas.

## Faixas manuais

O teto foi aplicado na data da calibração. As faixas continuam fixas, portanto poderão precisar de nova revisão se a volatilidade mudar. Faixas já dentro do teto foram mantidas, inclusive as de XMR/USD e a faixa promovida de 0,00524–0,00544 no XMR/BTC.

### XMR/USD

ATR diário de referência: **39,94**.

| Antes | Depois |
| --- | --- |
| 494–507 | 494–507 |
| 463–477 | 463–477 |
| 423–445 | 423–445 |
| 399–423 | 399–423 |
### XMR/BTC

ATR diário de referência: **0,000473**.

| Antes | Depois |
| --- | --- |
| 0,00656–0,00705 | 0,00694072–0,00715328 / 0,00657122–0,00675278 |
| 0,00602–0,00639 | 0,00602–0,00639 |
| 0,00565–0,00603 | 0,00561647–0,00586953 |
| 0,00524–0,00544 | 0,00524–0,00544 |

## Zonas automáticas publicadas

A comparação por ID mostra a continuidade da ficha, não uma garantia de que todos os pivôs antigos pertencem à nova região. IDs novos identificam as demais regiões resultantes.

| Par / período | ID | Antes | Depois | Score / toques / rejeições depois |
| --- | --- | --- | --- | --- |
| XMR/USD / semanal | `usd\|semanal\|z15` | 788,35939806–811,42060194 | 790,08038826–809,69961174 | 30 / 1 / 1 |
| XMR/USD / semanal | `usd\|semanal\|z14` | 461,41394143–525,68605857 | 461,41394143–525,68605857 | 77 / 3 / 2 |
| XMR/USD / semanal | `usd\|semanal\|z13` | 409,86617664–466,11382336 | 410,19038826–465,78961174 | 87 / 5 / 4 |
| XMR/USD / semanal | `usd\|semanal\|z12` | 339,68–382,12 | 330,13682979–391,66317021 | 91 / 6 / 5 |
| XMR/BTC / semanal | `btc\|semanal\|z21` | não publicado | 0,00656883–0,00727417 | 81 / 12 / 8 |
| XMR/BTC / semanal | `btc\|semanal\|z22` | não publicado | 0,00690983–0,00761517 | 81 / 9 / 4 |
| XMR/BTC / semanal | `btc\|semanal\|z7` | 0,0067–0,009 | 0,00763683–0,00791517 | 74 / 10 / 3 |
| XMR/BTC / semanal | `btc\|semanal\|z19` | 0,00591344–0,00698156 | 0,00594883–0,00652517 | 76 / 12 / 6 |
| XMR/BTC / semanal | `btc\|semanal\|z6` | 0,005162–0,00594 | 0,00520161–0,00591939 | 80 / 10 / 5 |
| XMR/BTC / semanal | `btc\|semanal\|z29` | não publicado | 0,00505649–0,00572551 | 75 / 15 / 9 |
| XMR/USD / diario | `usd\|diario\|z19` | 641,40603524–658,59396476 | 641,40603524–658,59396476 | 26 / 1 / 1 |
| XMR/USD / diario | `usd\|diario\|z20` | 793,37139826–806,40860174 | 793,89849434–805,88150566 | 26 / 1 / 1 |
| XMR/USD / diario | `usd\|diario\|z26` | 542,6143187–570,8056813 | 542,6143187–570,8056813 | 45 / 2 / 1 |
| XMR/USD / diario | `usd\|diario\|z18` | 493,92253685–506,94746315 | 494,00849434–506,86150566 | 76 / 5 / 2 |
| XMR/USD / diario | `usd\|diario\|z42` | 479,27854201–495,66145799 | 479,27854201–495,66145799 | 66 / 2 / 2 |
| XMR/BTC / diario | `btc\|diario\|z24` | 0,00694072–0,00715328 | 0,00694072–0,00715328 | 86 / 4 / 3 |
| XMR/BTC / diario | `btc\|diario\|z20` | 0,00816482–0,00829318 | 0,00816482–0,00829318 | 26 / 1 / 1 |
| XMR/BTC / diario | `btc\|diario\|z19` | 0,00657122–0,00675278 | 0,00657122–0,00675278 | 80 / 3 / 2 |
| XMR/BTC / diario | `btc\|diario\|z45` | 0,00635444–0,00646756 | 0,00635444–0,00646756 | 57 / 2 / 1 |
| XMR/BTC / diario | `btc\|diario\|z17` | 0,00600928–0,00611672 | 0,00600928–0,00611672 | 66 / 5 / 2 |

## Alertas e compatibilidade

A alteração isolada do detector preservou os gatilhos, os estados dos níveis pontuais, a EMA89 semanal, RSI, DMI/ADX, divergências e estrutura. As faixas manuais alteram onde as condições de entrada em faixa são verdadeiras.

No snapshot: **2 gatilhos ativos antes e 2 depois**. As listas exatas constam no JSON desta revisão. Labels de faixas alteradas mudaram. Essa manutenção pode gerar uma diferença de assinatura na primeira execução, sem representar por si só movimento novo do mercado.

Não é possível concluir a frequência futura de notificações da automação externa a partir de um snapshot. As regras de sinais, horários e anti-spam não foram alteradas. Faixas menores cobrem menos preços, mas faixas divididas criam fronteiras distintas. `docs/historico.jsonl` não foi reescrito. Os nomes de campos dos relatórios e estados foram preservados, e memórias antigas continuam legíveis.

## Validação

A suíte `teste-zonas.mjs` cobre os casos solicitados e a calibração manual. As suítes completas, os retratos e a paridade passaram nos três projetos. A validação com dados reais confirmou os tetos e três reexecuções estáveis por monitor. A comparação real utiliza as séries da Kraken para BTC/XMR, Binance para USDT/BRL e Yahoo para USD/BRL, sem troca de fonte entre antes e depois.
