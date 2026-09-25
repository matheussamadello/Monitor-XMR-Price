# Auditoria de qualidade das faixas manuais — XMR

Séries capturadas em **2026-09-25T01:36:30.294Z**. As medidas abaixo são uma auditoria retrospectiva específica dos limites manuais, não scores canônicos publicados pelo monitor nem probabilidades de sucesso.

## Método

- Contato exige interseção da máxima/mínima com a faixa exata. Nenhuma margem ATR aumenta suas bordas.
- Várias velas do mesmo episódio contam como um toque. Novo episódio exige saída confirmada de pelo menos 1 ATR histórico.
- Rejeição exige retorno ao lado de origem, com reação de pelo menos 1 ATR. A excursão é medida em até três velas, como no motor atual. Episódios abertos não são tratados como rejeições.
- Pesos, penalidades, volume histórico e role reversal reutilizam as funções do monitor. Volume é não aplicável no USD/BRL.
- Confirmação semanal conserva o critério do motor: sobreposição de pelo menos 35% com zona semanal ativa/candidata não absorvida. O score sem esse bônus também é mostrado para distinguir evidência própria de corroboração contextual.
- Antes/depois usam a mesma janela desde o primeiro pivô da faixa anterior. Isso inclui contatos anteriores à seleção do núcleo. Uma segunda medição começa depois da confirmação do primeiro pivô do núcleo atual (cinco velas à direita), excluindo a formação inicial.
- O contador pode subir ao estreitar: a borda muda a distância de saída de 1 ATR e, portanto, pode separar episódios antes agrupados. Isso não representa mais velas de contato.
- No semanal, entram apenas velas cujo início está dentro da janela; uma semana iniciada antes do corte não é contada parcialmente. Isso pode excluir a vela de formação inicial.
- A auditoria usa velas fechadas OHLC. Não é backtest, não demonstra rentabilidade e não resolve a ordem intradiária dos movimentos.

## Diário — mesma janela histórica para antes/depois

| Par | Faixa atual | Início da janela | Score antes → depois | Depois sem bônus semanal | Toques antes → depois | Rejeições antes → depois | Último toque |
|---|---|---|---|---|---|---|---|
| XMR/USD | 498–503 | 2025-12-20 | 76 → 82 | 71 | 5 → 6 | 2 → 3 | 2026-09-17 |
| XMR/USD | 468–472 | 2025-11-09 | 72 → 66 | 55 | 7 → 5 | 4 → 2 | 2026-08-30 |
| XMR/USD | 437–441 | 2025-11-15 | 71 → 77 | 66 | 7 → 7 | 4 → 4 | 2026-08-27 |
| XMR/USD | 410–414 | 2025-05-26 | 77 → 76 | 65 | 13 → 13 | 9 → 9 | 2026-08-23 |
| XMR/USD macro | 797–803 | 2026-01-14 | 26 → 26 | 26 | 1 → 1 | 1 → 1 | 2026-01-14 |
| XMR/BTC | 0,00707–0,00712 | 2026-09-02 | 86 → 68 | 55 | 4 → 2 | 3 → 2 | 2026-09-21 |
| XMR/BTC | 0,0066–0,00665 | 2026-06-12 | 80 → 80 | 67 | 3 → 3 | 2 → 2 | 2026-09-24 |
| XMR/BTC | 0,00602–0,006075 | 2026-01-31 | 90 → 72 | 61 | 6 → 6 | 5 → 3 | 2026-08-30 |
| XMR/BTC | 0,00579–0,005845 | 2025-12-20 | 77 → 68 | 57 | 9 → 11 | 6 → 6 | 2026-08-28 |
| XMR/BTC | 0,005255–0,005305 | 2026-02-13 | 85 → 76 | 65 | 13 → 14 | 12 → 9 | 2026-08-24 |

## Diário — testes depois da confirmação do núcleo atual

Esta janela é menor quando o pivô que ancora o núcleo é recente. Ela verifica retestes posteriores sem reaproveitar a reação da própria formação.

| Par | Faixa | Desde | Score | Sem bônus semanal | Toques / rejeições | Episódios abertos |
|---|---|---|---|---|---|---|
| XMR/USD | 498–503 | 2025-12-25 | 76 | 65 | 5 / 2 | 0 |
| XMR/USD | 468–472 | 2025-11-14 | 60 | 49 | 4 / 1 | 0 |
| XMR/USD | 437–441 | 2025-11-20 | 77 | 66 | 6 / 3 | 0 |
| XMR/USD | 410–414 | 2026-01-07 | 73 | 62 | 7 / 5 | 0 |
| XMR/USD macro | 797–803 | 2026-01-19 | 0 | 0 | 0 / 0 | 0 |
| XMR/BTC | 0,00707–0,00712 | 2026-09-17 | 43 | 32 | 1 / 1 | 0 |
| XMR/BTC | 0,0066–0,00665 | 2026-08-22 | 31 | 20 | 1 / 0 | 1 |
| XMR/BTC | 0,00602–0,006075 | 2026-02-05 | 66 | 55 | 5 / 2 | 0 |
| XMR/BTC | 0,00579–0,005845 | 2026-07-30 | 65 | 54 | 5 / 2 | 0 |
| XMR/BTC | 0,005255–0,005305 | 2026-02-18 | 76 | 65 | 13 / 8 | 0 |

## Reação, volume e papel — núcleo diário

| Par | Faixa | Reação média em ATR | Volume relativo mediano nos contatos | Role reversals confirmados | Toques / rejeições nas últimas 90 velas | Velas desde último contato |
|---|---|---|---|---|---|---|
| XMR/USD | 498–503 | 3.37 | 2.22 | 1 | 3 / 2 | 7 |
| XMR/USD | 468–472 | 4 | 1.38 | 0 | 1 / 0 | 25 |
| XMR/USD | 437–441 | 3.48 | 1.67 | 2 | 1 / 0 | 28 |
| XMR/USD | 410–414 | 2.49 | 1.26 | 3 | 2 / 1 | 32 |
| XMR/USD macro | 797–803 | 4.56 | 3.13 | 0 | 0 / 0 | 253 |
| XMR/BTC | 0,00707–0,00712 | 1.5 | 1.44 | 0 | 2 / 2 | 3 |
| XMR/BTC | 0,0066–0,00665 | 2.99 | 1.23 | 0 | 2 / 1 | 0 |
| XMR/BTC | 0,00602–0,006075 | 2.56 | 1.3 | 0 | 3 / 0 | 25 |
| XMR/BTC | 0,00579–0,005845 | 2.52 | 1.1 | 0 | 6 / 3 | 27 |
| XMR/BTC | 0,005255–0,005305 | 1.92 | 1.25 | 1 | 4 / 2 | 31 |

## Semanal — mesmos limites manuais

| Par | Faixa | Score antes → depois | Toques antes → depois | Rejeições antes → depois | Último toque |
|---|---|---|---|---|---|
| XMR/USD | 498–503 | 54 → 54 | 2 → 2 | 1 → 1 | 2026-09-17 |
| XMR/USD | 468–472 | 56 → 56 | 2 → 2 | 1 → 1 | 2026-08-27 |
| XMR/USD | 437–441 | 82 → 67 | 4 → 3 | 3 → 2 | 2026-08-27 |
| XMR/USD | 410–414 | 59 → 66 | 4 → 5 | 1 → 2 | 2026-08-20 |
| XMR/USD macro | 797–803 | 0 → 0 | 0 → 0 | 0 → 0 | nenhum |
| XMR/BTC | 0,00707–0,00712 | 20 → 20 | 1 → 1 | 0 → 0 | 2026-09-17 |
| XMR/BTC | 0,0066–0,00665 | 49 → 49 | 2 → 2 | 1 → 1 | 2026-09-17 |
| XMR/BTC | 0,00602–0,006075 | 48 → 46 | 2 → 2 | 1 → 1 | 2026-08-27 |
| XMR/BTC | 0,00579–0,005845 | 45 → 61 | 2 → 3 | 1 → 2 | 2026-08-27 |
| XMR/BTC | 0,005255–0,005305 | 59 → 59 | 2 → 2 | 1 → 1 | 2026-08-20 |

## Interpretação

As quatro faixas de XMR/USD conservam contatos e rejeições históricos próprios. **468–472 é a mais fraca das quatro**: perde duas rejeições e parte do score. No XMR/BTC, **0,00707–0,00712** passa de quatro para dois episódios e perde score. **0,00660–0,00665** tem três episódios históricos, mas apenas um episódio ainda aberto e sem rejeição depois da confirmação do pivô atual. A macro **797–803** tem só um episódio histórico, score 26, e nenhum reteste posterior à confirmação: continua sendo referência contextual pouco testada, sem validação como faixa operacional forte.

O corte de ativação do detector é 45, mas ultrapassá-lo nesta auditoria não ativa uma faixa manual nem garante sua maturidade. A máquina automática também considera evidência, duas velas e envelhecimento. Nenhuma faixa ou regra operacional foi alterada nesta validação.

## Reprodução e testes

```sh
node auditar-faixas-manuais.mjs
node teste-auditoria-faixas.mjs
```

Os [dados congelados](auditoria-faixas-dados-2026-09-25.json) incluem as séries e fontes utilizadas. Os [resultados detalhados](auditoria-faixas-qualidade-2026-09-25.json) registram cada episódio, rejeição, penalidade e role reversal. Os testes verificam equivalência com o motor quando a geometria coincide, exclusão de contatos fora do núcleo, independência de episódios, rejeição versus travessia, episódio aberto, volume, role reversal e ausência de mutação das entradas.
