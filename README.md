# Monitor XMR Price

Monitor técnico automatizado de **XMR/USD** e **XMR/BTC** que coleta candles da Kraken, calcula indicadores, acompanha estrutura de mercado e publica um relatório estático em HTML, texto e JSON para consulta humana ou consumo por bots, agentes e LLMs.

Este monitor é voltado a **swing trades com horizonte mínimo aproximado de uma semana** e a **position trades**, não a operações de curto prazo ou day trade. O gráfico **diário** é a referência principal de timing e o **semanal**, o filtro de contexto estrutural.

No prompt de alertas incluído no projeto, **XMR/BTC** é o par principal para avaliar o momento relativo de uma troca BTC → XMR, enquanto **XMR/USD** funciona como contexto complementar de preço, suporte, resistência, estrutura e momentum.

## Links públicos

- Repositório: https://github.com/matheussamadello/Monitor-XMR-Price
- Página do monitor: https://matheussamadello.github.io/Monitor-XMR-Price/
- Relatório JSON: https://matheussamadello.github.io/Monitor-XMR-Price/relatorio.json
- JSON bruto no repositório: https://raw.githubusercontent.com/matheussamadello/Monitor-XMR-Price/main/docs/relatorio.json

## Pares analisados

O monitor acompanha dois pares:

- **XMR/USD** — leitura do Monero em dólar.
- **XMR/BTC** — leitura relativa do Monero contra Bitcoin. É a referência principal da decisão de troca parcial BTC → XMR, que é o objetivo deste monitor.

A análise de cada par é independente, mas o relatório permite combinar as duas leituras.

Por exemplo, XMR/USD pode continuar estruturalmente forte enquanto XMR/BTC passa por uma correção relativa contra o Bitcoin. Um agente externo pode usar essa diferença como contexto em vez de reduzir toda a análise a um único preço.

## Fonte de dados e timeframes

O monitor consulta o endpoint público OHLC da Kraken para:

- `XMRUSD`
- `XMRBTC`

em dois intervalos:

- Diário: `1440` minutos.
- Semanal: `10080` minutos.

O diário é o timeframe principal para timing de pullbacks, rompimentos, retestes, perda/recuperação de níveis, candles e mudanças de momentum.

O semanal funciona principalmente como contexto e filtro estrutural. Ele ajuda a identificar se uma leitura diária está alinhada, neutra ou em conflito com a estrutura maior.

O relatório calcula os principais indicadores nos dois timeframes e diferencia os valores da vela fechada dos valores provisórios da vela ainda em formação.

## Indicadores e leituras calculadas

### RSI

**O período é diferente em cada timeframe**, e o relatório declara qual usou:

| Timeframe | RSI Length | Papel |
| --- | --- | --- |
| Diário | 21 | momentum, perda de força e retomada, na escala de swing e position |
| Semanal | 14 | leitura estrutural de momentum |

Até 2026-09-11 o RSI usava 14 nos dois timeframes, por herdar o mesmo `PERIOD` que o DMI usava. O 14 no diário oscila demais para o horizonte deste monitor.

Uma relação foi preservada de propósito: **em cada timeframe o RSI continua mais responsivo que o DMI/ADX** — 21 contra 28/42 no diário, 14 contra 14/21 no semanal. É do RSI que se espera perceber momentum e retomada antes do DMI confirmar; se ele ficasse mais lento que o ADX, perderia essa função. Há teste fixando isso.

O cálculo usa suavização de Wilder/RMA — igual desde o início, só o período mudou.

O relatório separa:

- `rsi_length`: o período usado **naquele bloco**;
- `rsi_fechado`: calculado apenas com velas fechadas;
- `rsi_provisorio`: inclui a vela atualmente em formação.

Os campos perderam o `14` do nome pelo mesmo motivo dos de DMI: `rsi14_fechado` guardando um RSI de 21 seria mentira.

**Os limiares não mudaram** — 70, 30 e 40 continuam onde estavam. Mas um RSI de 21 é menos extremo que um de 14: `rsi_acima_70` e `rsi_abaixo_30` passam a disparar menos no diário, e `rsi_esfriando` (que exige RSI acima de 40) muda de frequência. As divergências também usam o RSI como oscilador, então mudam de período junto.

O código também detecta divergências de RSI confirmadas e provisórias a partir de pivôs de preço.

### DMI/ADX

**Os períodos são diferentes em cada timeframe**, e o relatório declara qual usou:

| Timeframe | DI Length | ADX Smoothing | Papel |
| --- | --- | --- | --- |
| Diário | 28 | 42 | leitura **operacional** de tendência e força, para swing e position |
| Semanal | 14 | 21 | **contexto** da tendência de prazo maior |

Até 2026-09-11 havia um único período, 14, servindo ao mesmo tempo de DI Length e de ADX Smoothing nos dois timeframes. O 14/14 no diário reagia a ruído de curto prazo demais para o horizonte deste monitor; 28/42 alonga a janela e alisa o ADX. No semanal, 14/21 já é lento o bastante nessa escala — alongar mais só atrasaria a leitura sem ganhar filtragem.

São calculados:

- `dmi_di_length` / `dmi_adx_smoothing` — a configuração usada **naquele bloco**;
- `di_plus_fechado` / `di_plus_provisorio`;
- `di_minus_fechado` / `di_minus_provisorio`;
- `adx_fechado` / `adx_provisorio`.

Os campos perderam o `14` do nome na mesma mudança: um campo chamado `adx14_fechado` guardando um ADX alisado em 42 seria mentira. Quem precisa do período lê `dmi_di_length` e `dmi_adx_smoothing`, que saem ao lado dos valores, e o cabeçalho do relatório lista os dois timeframes.

O **semanal não é gatilho de entrada isoladamente** — serve de confirmação e contexto. E o ADX não é o gatilho principal em nenhum dos dois: preço, estrutura, rompimentos/retestes e candles continuam com prioridade.

O cálculo usa suavização de Wilder/RMA em todas as etapas — só os períodos mudaram.

O ADX mede força direcional e deve ser interpretado junto de DI+ e DI−. O monitor não trata ADX isoladamente como indicação de direção.

### EMA89

O monitor calcula uma média móvel exponencial de 89 períodos e publica campos como:

Campos que olham a vela **em formação**:

- `ema89`;
- `posicao_vs_ema89`;
- `distancia_ema89_pct`.

`posicao_vs_ema89` e `distancia_ema89_pct` comparam a média com o preço vivo, então mudam durante o dia. Servem para contexto, nunca para confirmação.

Campos calculados **só com velas fechadas**:

- `ema89_fechada_atual`;
- `ema89_fechada_anterior`;
- `ema89_cruzamento_fechado`;
- `distancia_ema89_fechada_atr`.

`ema89_fechada_anterior` é a média no fechamento anterior. Sem ela, quem lê o relatório não conseguia saber se houve travessia sem depender da própria memória de execuções passadas — o monitor publica de hora em hora e não garante essa memória. `ema89_cruzamento_fechado` traz o veredito pronto (`acima`, `abaixo` ou `nenhum`) e `distancia_ema89_fechada_atr` mede a distância do fechamento até a média em ATR do próprio timeframe, que é a margem usada para separar travessia real de simples encostada.

Nada disso exige cálculo novo nem estado guardado entre execuções: são dois pontos de uma série que o monitor já tinha em memória e não publicava.

A EMA89 diária pode funcionar como suporte ou resistência dinâmica para timing.

A EMA89 semanal é especialmente útil como filtro de contexto estrutural maior.

### Dois horizontes

O mesmo relatório atende dois horizontes de swing, sem nenhum campo novo no JSON:

- **tático**, de 1 a 6 semanas, em que o diário pesa mais;
- **estratégico**, de vários meses a mais de um ano, em que o semanal pesa mais.

A separação vive no prompt, não no monitor: `monitor.mjs` publica fatos de mercado e não sabe qual é o horizonte de quem lê. Divergência entre os dois — semanal íntegro e diário cedendo — é o estado normal de um pullback, não erro de dados.

### ATR(14) — volatilidade

O monitor calcula **ATR de 14 períodos** por Wilder sobre velas fechadas e publica:

- `atr14` — em unidade de preço;
- `atr14_pct` — o mesmo em porcentagem do fechamento.

O ATR sempre existiu internamente, dimensionando a largura das zonas automáticas, mas não era publicado. Agora sai no relatório, porque é a leitura que permite dimensionar distância de stop e tamanho de posição sem refazer a conta por fora.

Use `atr14_pct` para comparar **o mesmo timeframe ao longo do tempo**: o valor absoluto não diz nada sozinho. `0,05` é muito ou pouco dependendo do par e da época; `1,18%` é comparável com qualquer coisa.

Já comparar o ATR diário com o semanal não rende conclusão. A amplitude escala com a raiz do número de períodos, então o semanal fica naturalmente em torno de 2 a 2,5 vezes o diário — a diferença é aritmética, não sinal.

Ele também é a unidade em que a obsolescência dos níveis manuais é medida — ver abaixo.

### Candles

O monitor registra a anatomia das velas fechadas e da vela atual, incluindo:

- abertura;
- máxima;
- mínima;
- fechamento;
- corpo;
- sombra superior;
- sombra inferior;
- proporção do corpo e das sombras em relação ao range;
- direção;
- volume.

Também detecta padrões e contextos existentes no código, entre eles:

- bullish engulfing;
- bearish engulfing;
- hammer;
- shooting star;
- Três Soldados Brancos;
- Três Corvos Negros;
- versões provisórias dos padrões de três velas;
- `advance_block`;
- `stalled_pattern`.

`advance_block` e `stalled_pattern` são tratados como sinais de enfraquecimento, e não como reversão automática.

O código também separa a geometria do padrão do contexto anterior, evitando interpretar qualquer sequência visual de três velas como se tivesse necessariamente o significado clássico do padrão.

### Volume

O relatório inclui:

- volume da vela atual;
- volume da última vela fechada;
- média de 20 períodos;
- classificação relativa;
- tendência recente de volume;
- quantidade de trades da vela atual;
- fração do período já transcorrida.

### A classificação olha a vela fechada, não a em formação

Volume é **acumulado**. Uma vela diária às 6h da manhã tem só as horas já decorridas; compará-la com a média de velas completas dá sempre um número catastrófico, sem que haja nada de anormal acontecendo.

Como este par negocia 24/7, o contador zera toda meia-noite UTC — então o problema não era raro, aparecia **toda madrugada**. Pior que o número feio: um rompimento real nessa janela saía carimbado como `rompimento_com_volume_fraco`.

A correção óbvia seria escalar a média pela fração decorrida, mas isso supõe que o giro se espalha por igual ao longo do período, o que não acontece. A saída sem suposição nenhuma é comparar **período inteiro contra período inteiro**: `volume_vs_media_pct` e `volume_classificacao` olham a última vela **fechada**, e o relatório declara isso em `volume_referencia: ultima_vela_fechada`.

O volume da vela em formação continua publicado, cru, em `volume_atual`, com `volume_parcial: sim` ao lado.

Isso também corrigiu uma incoerência antiga: `rompimento_confirmado` é avaliado sobre a vela **fechada**, mas buscava a confirmação de volume na vela **viva** — duas velas diferentes na mesma frase. O estado `inconclusivo_periodo_inicial` deixou de existir junto: não há mais período inicial a desconfiar.

Como a vela atual pode estar incompleta, o monitor marca quando o volume é parcial.

No semanal, existe também comparação equivalente considerando os dias já fechados da semana, para evitar comparar diretamente uma semana incompleta com semanas completas.

### Pivôs e estrutura de mercado

O monitor usa pivôs fractais confirmados com dois candles à esquerda e dois à direita.

Os últimos candles que ainda não possuem confirmação à direita não são classificados como pivôs confirmados, e a vela em formação não participa desse cálculo.

O relatório publica campos como:

- `estrutura_preco`;
- `estrutura_tendencia`;
- `estrutura_ultimo_topo`;
- `estrutura_ultimo_fundo`;
- `estrutura_eventos`;
- `pivos_topos_recentes`;
- `pivos_fundos_recentes`.

Internamente aparecem classificações como:

- `HH` = topo mais alto;
- `HL` = fundo mais alto;
- `LH` = topo mais baixo;
- `LL` = fundo mais baixo.

**O fractal é por timeframe**, pelo mesmo motivo do RSI e do DMI, e o relatório declara qual usou em `pivos_fractal`:

| Timeframe | Fractal | Velas mínimas por perna |
| --- | --- | --- |
| Diário | 5/5 | 10 |
| Semanal | 2/2 | 4, que são 4 semanas |

Até 2026-09-11 os dois usavam 2/2, que era o único parâmetro de análise nunca desacelerado quando o monitor assumiu horizonte de swing e position. Um fractal 2/2 no diário marca pivô a cada três velas: medido em 720 velas de série **sem tendência nenhuma**, a `estrutura_tendencia` publicada virava de alta para baixa e de volta 98 vezes, cerca de uma a cada sete dias. Com 5/5 são 43 viradas e a perna mínima passa a ter sete velas, que é a escala de um swing de 1 a 6 semanas. Havia um dano colateral: o detector de divergências exige cinco velas entre os dois pivôs, e com pivôs a cada três velas ele se recusava a avaliar em 30% das leituras. O semanal fica em 2/2 porque cada vela já cobre uma semana, e alongar ali faria o pivô só existir dez semanas depois.

`estrutura_tendencia` tem **cinco** valores, não três:

- `alta` — HH + HL;
- `baixa` — LH + LL;
- `lateral_contracao` — LH + HL, o range aperta com o fundo subindo;
- `lateral_expansao` — HH + LL, o range abre pelas duas pontas;
- `indefinida` — não há pivôs suficientes para declarar estrutura.

Antes, os três últimos saíam todos como `lateral_indefinida`. Isso juntava duas situações opostas, contração e expansão, e chamava de lateral um mercado cujo range está **abrindo**. Pior, afirmava um estado de mercado quando o que havia era ausência de dado. A distinção não é acadêmica: o prompt usa a estrutura semanal como uma das condições que promovem um alerta tático a estratégico, e um semanal fazendo fundo mais alto contava como deterioração da tese de prazo longo.

### Divergências

O monitor publica:

- `divergencia_rsi`: divergências confirmadas;
- `divergencia_rsi_provisoria`: divergências que ainda dependem da vela em formação.

A lógica usa pivôs e diferencia:

- divergência regular bullish;
- divergência regular bearish;
- divergência oculta bullish;
- divergência oculta bearish.

Como uma divergência provisória ainda depende da vela atual, ela pode desaparecer antes do fechamento.

## Dados fechados x dados provisórios

Essa distinção é central no projeto.

Campos `*_fechado` usam somente velas concluídas e são a referência principal para confirmação.

Campos `*_provisorio` incorporam a vela em formação e podem mudar até o fechamento.

O mesmo princípio vale para:

- padrões;
- divergências;
- candle atual;
- volume parcial.

Em integrações com bots ou LLMs, sinais de maior convicção podem exigir fechamento quando a regra depender explicitamente de confirmação, enquanto os dados provisórios podem servir para acompanhamento antecipado.

## Níveis manuais

Os níveis manuais ficam centralizados em `NIVEIS_USD` e `NIVEIS_BTC`, no topo de `monitor.mjs`. Cada entrada de `PAIRS` apenas aponta para o objeto do seu par.

Três consumidores leem daí e só daí: `alertasTecnicos` (faixas e rompimento/perda intradiários), `niveisDoPar` (máquina de estados de rompimento/reteste) e `avaliarGatilhos` (a linha `GATILHOS ATIVOS`). Nenhum valor de preço aparece duas vezes no arquivo, então revisar níveis é editar um bloco só.

### XMR/USD

Na versão atual do código:

Calibrado em 2026-09-05, com o XMR/USD a 528,43:

| Região | Função | De onde veio |
| --- | --- | --- |
| US$ 544–553 | faixa manual | zona diária acima do preço |
| US$ 494–507 | faixa manual | zona diária de score 67 |
| US$ 423–445 | região manual de suporte | zona diária de score 82 sobre a semanal de score 91 |
| US$ 550 | resistência pontual | centro da zona diária (548,34), que é também o pivô de topo de 31/08 |
| US$ 500 | suporte pontual | centro da zona diária de score 67 (500,44) |
| US$ 788–811 | resistência macro manual/contextual | única estrutura acima do preço, presente no diário **e** no semanal |

Os anteriores (resistência 410, faixas 350–385) ficaram obsoletos: o nível de 410 foi rompido em 17/08 e o preço seguiu 29% acima da faixa mais alta. Foi esse caso que motivou a [vigilância dos níveis manuais](#vigilância-dos-níveis-manuais).

A resistência macro é intencionalmente diferente dos níveis da máquina de estados.

Ela funciona como **referência contextual de longo prazo** e não gera, por si só:

- evento;
- gatilho;
- alerta técnico;
- mudança na máquina de estados.

O relatório publica seu tipo, limites, estado relativo ao preço e distância.

### XMR/BTC

Na versão atual do código:

Calibrado em 2026-09-05, com o XMR/BTC a 0,006643:

| Região | Função | De onde veio |
| --- | --- | --- |
| 0,00656–0,00705 BTC | faixa manual | zona diária onde o preço está |
| 0,00602–0,00639 BTC | faixa manual | zona diária de score 66 |
| 0,00565–0,00603 BTC | região manual de suporte | zona diária de score 83, por dentro da semanal de score 83 |
| 0,00700 BTC | resistência pontual | centro da zona diária **e** pivô de topo de 02/09 — o mesmo número por duas leituras |
| 0,00584 BTC | suporte pontual | centro da zona de score 83 |

Antes havia uma faixa só, já abaixo do preço, e o suporte pontual era `null` — metade da máquina de estados ficava inerte. Agora os dois lados existem.

As zonas automáticas seguem cumprindo o papel de contexto dinâmico, sem exigir uma nova linha manual toda vez que o regime muda.

### Faixas manuais e JSON

As faixas manuais fazem parte da configuração do código e também são consideradas no cálculo de confluência das zonas automáticas.

Dentro de `niveis_manuais` aparecem, por par e por timeframe: as faixas manuais, a máquina de estados dos níveis pontuais e — apenas em XMR/USD — a resistência macro.

As faixas são publicadas como metadado derivado da configuração:

```json
"faixas": [
  { "inferior": 377, "superior": 385, "label": "faixa_377_385" },
  { "inferior": 365, "superior": 375, "label": "faixa_365_375" },
  { "inferior": 350, "superior": 355, "label": "regiao_suporte_350_355" }
]
```

Não existe cópia manual desses números na serialização: alterar `NIVEIS_USD.faixas` ou `NIVEIS_BTC.faixas` muda o JSON sozinho. Consumidores externos devem preferir o JSON como fonte de verdade em vez de manter cópias eternas dos valores.

As zonas automáticas também publicam campos próprios de confluência, como:

- `confluencia_nivel_manual`;
- `confluencia_faixa_manual`;
- `confluencia_resistencia_macro`;
- `confluencia_manual_qualquer`.

Portanto, consumidores externos não devem inferir que `confluencia_nivel_manual` representa sozinho toda forma possível de confluência manual.

## Vigilância dos níveis manuais

Os níveis manuais são a espinha da política de alerta: janela agressiva, confirmação conservadora e a própria revisão de níveis partem todos deles. Quando envelhecem, o monitor não passa a errar — ele fica **mudo** justamente na parte que mais importa, e nada avisa.

Foi o que aconteceu no monitor de XMR: o preço rompeu a resistência manual em 17/08 e seguiu até 29% acima da faixa mais alta configurada, republicando de hora em hora um rompimento que havia muito deixara de ser notícia. Detectar isso estava delegado a quem lesse o relatório, e é exatamente o tipo de coisa que ninguém nota, porque nada acontece.

Agora o relatório publica, por par e por timeframe:

| Campo | O que traz |
| --- | --- |
| `niveis_manuais_situacao` | `atual`, `monitorar` ou `obsoleto` |
| `niveis_manuais_distancia_atr` | distância do **último fechamento** até a faixa manual mais próxima, em ATR |
| `niveis_manuais_faixa_mais_proxima` | qual faixa é essa |
| `niveis_manuais_alinhamento` | `alinhado`, `parcial`, `desalinhado` ou `indefinido` |
| `niveis_manuais_faixas_corroboradas` | quantas faixas caem sobre uma zona automática |

Os cortes são **1 ATR** e **3 ATR**: dentro de uma faixa ou a menos de 1 ATR dela é `atual`; entre 1 e 3 é `monitorar`; além de 3 é `obsoleto`.

As duas pontas da conta usam **vela fechada** — o fechamento e o ATR. A primeira versão passava o preço da vela em formação, o que misturava provisório com confirmado num híbrido sem significado limpo, e contrariava a convenção do próprio monitor, em que o que alimenta decisão usa vela fechada. E este campo alimenta uma: a revisão dos níveis manuais. O custo é uma vela de latência, irrelevante para um sinal cujo caso de origem levou 19 dias para ser notado.

A distância é medida em ATR, e não em porcentagem, de propósito. Cinco por cento é muito num par de câmbio e pouco num de cripto, enquanto "três vezes a volatilidade diária" quer dizer a mesma coisa em qualquer um — um limiar só serve para os três monitores, sem recalibragem.

**Situação e alinhamento medem coisas diferentes.** A situação mede a distância do preço; o alinhamento mede se as faixas continuam caindo onde o mercado de fato reage, comparando cada uma com as zonas automáticas pelo mesmo critério de sobreposição usado nas confluências. Os dois podem discordar, e é justamente a discordância que interessa: uma faixa pode estar a 0,66 ATR do preço, portanto `atual`, e mesmo assim estar deslocada da região que o mercado respeita.

Era o caso do monitor de BTC quando este campo foi criado. Nenhuma das três faixas manuais atingia o limite de sobreposição em nenhum dos dois timeframes, e as duas do diário ficavam logo abaixo dele porque estavam cerca de 1.500 dólares abaixo de onde o mercado reagia: a zona automática de score 99 ficava em 79.536 a 81.093, contra a faixa configurada de 78.000 a 80.000. Nada no relatório dizia isso, porque o único campo que olhava as faixas media distância até o preço. O sinal existia por zona, em `confluencia_faixa_manual`, mas nunca era somado.

`obsoleto` não é alerta de mercado: é aviso de manutenção. Significa que os níveis descrevem um regime que ficou para trás e precisam de revisão.

### Perda de suporte: forte x fraca

`rompimento_confirmado_X` só sai quando o **corpo inteiro** da vela fechada está acima da resistência; se só o fechamento passou, sai `rompimento_confirmado_fraco_X`. O suporte não tinha essa distinção: qualquer fechamento abaixo, por qualquer margem, virava `perda_suporte_confirmada_X` e entrava em `deterioracao_tendencia`.

O caso que expôs isso foi o XMR/USD em 2026-09-08: abriu 519,23 e fechou 499,77 com suporte em 500. Fechou 0,23 abaixo — menos de um centésimo de ATR — com o corpo inteiro em cima do nível. Saía como perda confirmada enquanto a máquina de estados, que olha o corpo, dizia `sem_registro`.

Agora o suporte espelha a resistência: `perda_suporte_confirmada_X` exige o corpo abaixo; só o fechamento abaixo vira `perda_suporte_confirmada_fraca_X`. A versão fraca continua contando como `suporte_sob_pressao` em `riscos_tecnicos`, mas não entra em `deterioracao_tendencia`. A síntese também passou a ignorar a versão fraca do rompimento em `confluencia_entrada`, que antes escapava por causa do prefixo.

## Máquina de estados de rompimento e reteste

Os níveis pontuais possuem estado persistente avaliado sobre candles fechados, para evitar que simples oscilações intradiárias mudem a leitura estrutural.

Entre os principais estados implementados estão:

- `rompimento_candidato`;
- `rompido`;
- `em_reteste`;
- `reteste_confirmado`;
- `rompimento_falhou`;
- `recuperado`.

O registro marca `afastado` sempre que o preço estiver além da distância de reset do nível, **em qualquer estado**. Isso já foi diferente: a marcação só valia ao encerrar um ciclo de reteste, então um nível rompido semanas antes e deixado 29% para trás continuava publicando `afastado: nao`, e quem lesse concluía que o preço ainda estava por perto. O encerramento do ciclo — voltar de `reteste_confirmado` ou `recuperado` para `rompido` — continua restrito aos dois estados em que faz sentido.

A máquina diferencia um critério mais sensível, que pode armar um candidato, de critérios mais rigorosos usados para confirmar mudanças de estado.

**A tolerância e a distância de reset são medidas em ATR**, como todo o resto do projeto: 0,25 ATR de largura em torno do nível e 1,5 ATR para encerrar o ciclo. Eram percentuais fixos, e um percentual fixo vale coisas diferentes em cada ativo. Com 0,5%, a janela de reteste valia 0,077 ATR no XMR/USD e 0,592 ATR no USDT/BRL, quase oito vezes mais larga: num par ela era dez vezes mais estreita que uma zona automática e no outro quase do tamanho de uma zona inteira, de modo que `reteste_confirmado` queria dizer coisas diferentes em cada lugar. O reset do USDT/BRL chegava a 3,55 ATR, além dos 3 ATR em que os níveis já são declarados obsoletos, então o ciclo praticamente nunca reiniciava. O monitor de câmbio já tinha os números cortados pela metade à mão para contornar isso; medidos em ATR, aqueles valores ajustados davam 0,23 a 0,30 ATR e 1,36 a 1,78 ATR, quase exatamente os valores que agora valem para qualquer par sem ajuste por fonte.

**Um nível abandonado é arquivado, nunca apagado.** Quando passa da janela de inatividade sem contato, o registro vira `arquivado` e fica dormente; se o preço voltar a encostar, ele acorda e o ciclo recomeça em reteste. Antes o registro era apagado quando ainda não tinha histórico, e na vela seguinte o nível nascia do zero em `rompido` — que o relatório anuncia como rompimento novo. Uma resistência rompida com o preço indo embora reanunciava o mesmo rompimento a cada 32 velas diárias, indefinidamente: sete anúncios em duzentos dias, contra o que o prompt promete, que um rompimento vira notícia uma vez só.

## Zonas automáticas de suporte e resistência

Além dos níveis manuais, o monitor calcula zonas automáticas a partir de pivôs confirmados.

No código atual essas zonas funcionam como **contexto técnico**.

Elas não alteram sozinhas:

- `gatilhos_ativos`;
- a máquina de estados dos níveis manuais;
- `confluencia_entrada`;
- `confluencia_pullback`;
- `deterioracao_tendencia`.

### ATR e agrupamento de pivôs

As zonas usam ATR(14) de Wilder calculado sobre velas fechadas.

Cada pivô recebe o ATR correspondente à época em que ocorreu.

Os pivôs são agrupados usando distância normalizada pela volatilidade histórica.

O algoritmo também verifica a compatibilidade entre os membros do cluster para evitar que uma cadeia de pivôs próximos acabe juntando artificialmente extremos que já não pertencem à mesma região.

### Limites estruturais

`limites_estruturais` representam a região histórica da zona.

Eles são derivados dos pivôs que formaram o cluster e da volatilidade existente na época desses pivôs.

São usados principalmente para:

- identidade da zona;
- matching entre execuções;
- merge de regiões;
- confluência histórica.

Eles não são recalculados retroativamente apenas porque o ATR atual mudou.

### Limites operacionais

`limites_operacionais` representam uma área mais estreita adaptada à volatilidade atual.

No código atual, a meia largura operacional usa aproximadamente `0.35 × ATR` fechado atual, respeitando limites mínimos e máximos relativos.

Esses limites são usados principalmente para:

- interação atual do preço;
- estado `em_teste`, `acima` ou `abaixo`;
- distância operacional;
- confluência atual com faixas manuais.

Assim, uma zona pode preservar sua identidade histórica enquanto sua área operacional se adapta ao regime corrente de volatilidade.

### Score e qualidade da zona

Cada zona recebe um `score` normalizado.

Entre os fatores considerados estão:

- número de episódios/toques;
- número de rejeições;
- recência;
- força média da reação em ATR;
- confluência semanal para zonas diárias;
- `role_reversal`;
- contexto de volume.

Também existem penalidades para situações como:

- repetidos rompimentos sem reação;
- episódio único;
- wick isolado sem rejeição suficiente.

A proximidade do preço não determina a força histórica da zona. Ela é usada principalmente para selecionar quais regiões relevantes próximas serão publicadas.

### Toques, rejeições e role reversal

O monitor reconstrói episódios históricos de contato com as zonas e publica informações como:

- `numero_toques`;
- `numero_rejeicoes`;
- `forca_reacao_atr`;
- `primeiro_toque`;
- `ultimo_toque`;
- `velas_desde_ultimo_toque`.

Um `role_reversal` não é marcado simplesmente porque o preço cruzou a região.

O código procura uma sequência cronológica com interação de um lado, cruzamento confirmado e reação posterior pelo lado oposto.

### Confluências

Uma zona automática pode publicar, entre outros campos:

- `timeframes_confirmando`;
- `confluencia_nivel_manual`;
- `confluencia_faixa_manual`;
- `confluencia_resistencia_macro`;
- `confluencia_manual_qualquer`;
- `cruzamento_confirmado`;
- `volume_contexto`;
- `volume_relativo_mediano`;
- `distancia_preco_atual_pct`.

No relatório público são mostradas até três zonas acima e três abaixo do preço entre as zonas publicáveis.

O `estado.json` mantém também zonas vivas que podem não aparecer entre as mais próximas no relatório, preservando identidade e histórico entre execuções.

## `relatorio.json`

`docs/relatorio.json` é a principal interface estruturada do projeto para integrações.

A estrutura geral é semelhante a:

```json
{
  "cabecalho": {},
  "diario": {
    "XMR/USD": {},
    "XMR/BTC": {}
  },
  "semanal": {
    "XMR/USD": {},
    "XMR/BTC": {}
  },
  "gatilhos_ativos": [],
  "timestamp": ""
}
```

Cada bloco pode conter:

- preço e OHLC atual;
- EMA89;
- RSI e DMI/ADX fechados e provisórios;
- candles recentes;
- volume;
- estrutura e pivôs;
- divergências;
- padrões;
- alertas técnicos internos;
- `confluencia_entrada`;
- `confluencia_pullback`;
- `riscos_tecnicos`;
- `deterioracao_tendencia`;
- `niveis_manuais`;
- `zonas_automaticas`.

O JSON é derivado do mesmo relatório técnico usado para gerar a página, e as zonas automáticas são injetadas a partir do objeto canônico calculado pelo monitor.

Para bots, agentes e LLMs, este é o arquivo recomendado para leitura periódica.

## `estado.json`

`docs/estado.json` funciona como memória persistente entre execuções.

Ele armazena atualmente:

- `ativos`: gatilhos internos ativos;
- `em`: timestamp da atualização;
- `niveis`: estado persistente da máquina de rompimento/reteste;
- `zonas`: coleção das zonas vivas por par/timeframe;
- `contadoresZona`: contadores usados para preservar identidade das zonas.

O arquivo não substitui `relatorio.json` como interface pública de consumo.

Sua função principal é impedir que o monitor esqueça estados, ciclos, IDs, históricos e contadores entre uma execução e outra.

## Arquivos gerados

Ao executar:

```bash
node monitor.mjs
```

o monitor cria ou atualiza:

```text
docs/
├── .nojekyll
├── estado.json
├── index.html
├── index.txt
└── relatorio.json
```

### A página publicada (`index.html`)

A página serve a dois leitores ao mesmo tempo, com prioridades opostas.

**Tema.** Segue o **`prefers-color-scheme` do sistema**: quem usa tema escuro no SO ou no navegador abre em *night mode* — fundo azul-noite, azul nos títulos e nas etiquetas —, quem usa claro abre no tema claro, com fundo quase branco e texto quase preto. O botão no topo alterna, e a partir daí a escolha fica salva no navegador e passa a mandar sobre o sistema. Quem nunca clicou continua seguindo o SO até enquanto a página está aberta: trocar o tema do sistema muda a página na hora.

Não há regra por **horário**, de propósito. Quem quer tema escuro à noite já liga o agendamento automático do próprio sistema, e o `prefers-color-scheme` entrega isso de graça. Uma regra própria brigaria com quem escolheu claro deliberadamente, e faria a página mudar de cara sozinha conforme a hora de abrir — o que se lê como defeito, não como recurso. O tema claro **só redefine tokens de cor**: nenhuma regra de layout existe duas vezes, então os dois não têm como divergir de estrutura. Há um teste que compara os dois conjuntos de tokens e falha se alguém acrescentar uma cor no escuro e esquecer do claro — senão o tema claro herdaria uma cor de fundo escuro em silêncio.

Para **você**: um cartão por par com o resumo dos dois timeframes — último fechamento, lado e distância da EMA89 **em porcentagem**, RSI e ADX com DI+/DI− (ambos rotulados com os períodos daquele timeframe), estrutura, situação dos níveis manuais —, mais os alertas técnicos como etiquetas.

**O ATR não aparece no cartão**, e a distância da EMA89 sai em porcentagem em vez de em múltiplos de ATR. Isso é só apresentação, e a razão é que ATR é unidade de **cálculo**, não leitura de relance: `0,0418` é muito ou pouco dependendo do par, enquanto `0,56%` se lê na hora.

Internamente nada mudou. O ATR continua dimensionando a largura das zonas automáticas, medindo a obsolescência dos níveis manuais e servindo de unidade para as margens do prompt — 0,25 ATR para a travessia semanal, 1,0 ATR para a corroboração da perda diária. E o relatório continua publicando `atr14`, `atr14_pct` e `distancia_ema89_fechada_atr` para quem dimensiona stop e tamanho de posição.

A porcentagem da EMA89 é calculada direto pela relação entre o **fechamento** e a EMA89, não convertida do múltiplo de ATR. O denominador é a própria EMA, mesma convenção do `distancia_ema89_pct` — só que com o fechamento no lugar do preço vivo, para o cartão não voltar a misturar vela fechada com vela em formação. O que está em `deterioracao_tendencia` sai em vermelho; o resto, em azul. O carimbo de tempo no topo calcula sozinho, no navegador, há quanto tempo o relatório foi gerado, e muda de cor a partir de 90 minutos.

Para o **agente**: o relatório inteiro continua saindo *verbatim* dentro de um único `<pre>`, em texto puro, com o mesmo escape de sempre (`&` e `<`, nada mais). O prompt usa esta página como fallback quando o `relatorio.json` não responde, e quem lê procura linhas `campo: valor` no fonte — uma única `<span>` ali dentro quebraria isso, e quebraria justamente quando a fonte principal já estivesse fora do ar. Por isso o tema é moldura em volta do bloco, nunca dentro dele, e há um teste de fumaça que compara o `<pre>` byte a byte com o relatório e falha se aparecer qualquer tag lá.

Os cartões **não** reparseiam o texto: eles leem o mesmo objeto de `relatorioParaJSON` que vira o `relatorio.json`, gerado uma vez só e passado para os dois. Dois leitores do mesmo objeto não têm como discordar.

O par que tiver cartão e `grafico` na configuração ganha também um gráfico embutido — com a **EMA89** e o **RSI** já carregados, e uma barra com **Diário** e **Semanal** logo acima dele. Trocar ali troca o intervalo do desenho **e o período do RSI junto** — 21 no diário, 14 no semanal, os mesmos que o cartão de cada timeframe publica, para o desenho nunca contradizer o número ao lado. Os períodos são **derivados da configuração**: mudar `tf.rsi.length` move o desenho junto, sem ninguém precisar lembrar de vir aqui. A EMA89 é a mesma nos dois intervalos, porque não é um valor por timeframe.

Esses botões são **nossos**, e não os da barra do TradingView. O widget público roda num iframe de outra origem e não avisa quando alguém troca o intervalo por dentro dele: trocar por lá muda as velas e deixa o RSI como estava. Acompanhar a troca feita na barra do próprio widget exigiria a Charting Library licenciada, que é outro produto — por isso o controle fica do lado de fora, onde dá para redesenhar o widget inteiro com o período certo. Um clique em qualquer uma das barras move todos os gráficos da página, que assim nunca ficam mostrando intervalos diferentes. A EMA é a mesma linha que o cartão cita, e o RSI vai sem a média móvel que o TradingView inclui por padrão nele, que só polui. O ADX/DMI fica de fora de propósito: junto com o RSI o embed fica carregado, e o padrão dele já serve quando se adiciona na hora, pelo próprio widget. Ele é desenhado pelo TradingView e redesenhado quando o tema muda, porque mora num iframe e o tema dele é escolhido na criação do widget, não por CSS. A Kraken não publica widget de embed próprio; o TradingView publica, e serve a série da **própria Kraken** sob o símbolo `KRAKEN:…` — é a mesma fonte do relatório, não uma segunda opinião. Se o script não carregar, fica no lugar um link para o gráfico completo e nada mais na página se perde.

Uma diferença que vale conhecer antes de comparar número com desenho: a Kraken alinha a vela semanal pela **época do Unix**, que caiu numa quinta-feira, então a semana dela vai de quinta a quarta. O TradingView desenha a semana de segunda a domingo. Os dois estão certos dentro da própria régua, mas as velas semanais do gráfico não coincidem com o `ultimo_fechamento_data` semanal do relatório. No diário não há divergência.

Também pode ser criado `alerta.txt` na raiz quando surgem novos gatilhos internos.

O workflow oficial faz `git add docs`, portanto `alerta.txt` não é publicado automaticamente pelo processo atual.

## Estrutura simplificada do repositório

Considerando a estrutura atual do monitor e os arquivos de documentação:

```text
Monitor-XMR-Price/
├── .github/
│   └── workflows/
│       └── monitor.yml
├── docs/
│   ├── .nojekyll
│   ├── estado.json
│   ├── historico.jsonl
│   ├── index.html
│   ├── index.txt
│   └── relatorio.json
├── monitor.mjs
├── teste-fumaca.mjs
├── analisar-historico.mjs
├── README.md
└── PROMPT_XMR_TECHNICAL_WATCH.md
```

## Contexto longo: a linha para quem não é trader

O relatório tem mais de cem campos por bloco. Quase todos são refinamento, e refinamento serve para quem opera com frequência. Quem acumula ao longo do tempo e às vezes gasta precisa responder uma pergunta só: **é um momento melhor para comprar mais, para esperar ou para converter parte?**

A faixa **Contexto longo**, no topo da página antes dos cartões, responde isso em uma linha por par. Ela usa **cinco campos, todos do bloco semanal**: o fechamento, a EMA89, a distância entre os dois em ATR, o RSI e a estrutura.

| Rótulo | Quando aparece |
| --- | --- |
| barato ante a média longa | fechou 1 ATR ou mais **abaixo** da EMA89 semanal, sem estrutura de baixa |
| barato, mas em tendência de baixa | o mesmo, porém com a estrutura semanal já em `baixa` |
| esticado ante a média longa | fechou 1 ATR ou mais **acima**, com RSI semanal em 70 ou mais |
| acima da média, sem esticamento | longe acima, mas o RSI não acompanha |
| na média longa | a menos de 1 ATR da EMA89, para qualquer lado |

Nenhuma regra nova de mercado nasce aí. O corte de 1 ATR é o mesmo que o monitor já usa para separar perto de longe na obsolescência dos níveis, e 70 é a referência de RSI que o prompt usa em todo lugar. Barato e caindo saem com rótulos diferentes de propósito: juntar os dois seria mentira. E uma alta longe da média sem RSI esticado não vira alarme, porque alta saudável é o estado normal de uma tendência.

**A linha mostra os números que a produziram**, ao lado do rótulo. É o que permite conferir a leitura sem ler o resto da página: se o rótulo disser "esticado" e a razão disser 3,05 ATR acima com RSI 72, dá para julgar por conta própria se concorda.

Ela **descreve enquadramento, não recomenda operação e não gera alerta**. É contexto que muda de estado poucas vezes por ano, e é essa lentidão que a torna útil para horizonte longo.

## Histórico: o substrato para medir

Nenhum parâmetro deste projeto foi validado contra resultado. Os períodos, os limiares, os pesos do score das zonas: tudo foi escolhido por raciocínio, e raciocínio bem argumentado continua sendo palpite até alguém medir. `docs/historico.jsonl` existe para que um dia seja possível medir.

É um arquivo **append-only**, uma linha JSON por entrada, versionado junto com o resto. Ele não altera o relatório, não dispara nada e não é lido por nenhuma decisão do monitor.

**Por que registra condição, e não alerta.** Os alertas não saem daqui. Quem decide alertar é o agente no ChatGPT, que lê o prompt e resolve sozinho, e o monitor não tem como ver essa decisão. O que o monitor vê, e pode registrar com precisão, são as condições que ele publicou e o preço de cada fechamento. Isso basta para a pergunta que importa: cada condição foi seguida de que movimento?

Grava uma linha por par e timeframe sempre que a **vela fechada** muda ou qualquer condição muda. Execuções horárias sobre a mesma vela fechada não repetem linha, porque a assinatura que decide isso ignora o horário. Como a vela entra na assinatura, todo fechamento gera linha mesmo sem condição nenhuma, e é dessa série de preços que saem os retornos futuros. Bloco em falha não vira entrada: registrar uma queda de fonte como se fosse leitura de mercado contaminaria a medição depois.

Cada linha traz a vela, o fechamento, o ATR, RSI, ADX com DI+/DI−, estrutura, lado e cruzamento da EMA89, os alertas técnicos, deterioração, confluências, riscos, mudanças de nível e a situação e o alinhamento das faixas manuais.

### Como medir

```bash
node analisar-historico.mjs 10
```

O argumento é o horizonte em velas fechadas. O script junta cada condição ao que o preço fez depois e imprime, por condição, a quantidade de amostras, o retorno mediano **em ATR** e a fração de vezes em que subiu. Em ATR, e não em porcentagem, pelo mesmo motivo do resto do projeto: 3% é muito num par de câmbio e pouco num de cripto, e uma tabela que mistura os dois não quer dizer nada.

A linha `TODAS AS VELAS (referência)` é o que o par fez em toda vela do período. **É contra ela que se compara, não contra zero.** Uma condição que não bate a referência não está acrescentando informação, por melhor que pareça o número absoluto. Condições com menos de cinco amostras são omitidas.

Vale rodar em mais de um horizonte. Uma condição útil deveria continuar útil em 5 e em 20 velas; uma que só funciona num horizonte específico é ruído que encontrou um número.

**Não espere resposta nos primeiros meses.** Detectar uma vantagem pequena contra a volatilidade diária exige muitas amostras, e o script prefere dizer que não sabe a inventar conclusão com uma dúzia de casos.

### O que o histórico não alcança

Ele não sabe o que o agente escolheu enviar. Se você quiser medir isso também, o prompt pede que cada alerta termine numa linha compacta de registro; basta colar essas linhas em `alertas-enviados.jsonl` na raiz. Sem isso, dá para saber quais condições têm valor, mas não se o agente está encaminhando as certas.

## Teste de fumaça

`teste-fumaca.mjs` roda o monitor inteiro contra séries sintéticas no formato OHLC da Kraken, **sem tocar na rede**. Existe porque o monitor publica sozinho de hora em hora: sem ele, um refactor que quebre o parse ou o cálculo só apareceria em produção, com o relatório já no ar.

Verifica:

- que o relatório sai inteiro, sem `NaN` e sem `undefined`;
- que RSI, ADX, EMA89 e a estrutura de pivôs são calculados;
- que as linhas `eventos:` e `eventos_semanal:` continuam nos seus blocos;
- que a fonte fora do ar vira `FALHA:` citando o status, sem interromper o relatório;
- que um erro de aplicação da fonte aparece no relatório;
- que a vela em formação não puxa a classificação de volume, e que uma queda ou um pico reais na vela fechada continuam sendo detectados;
- que o `relatorio.json` continua parseável e tipado, com as faixas manuais de cada par;
- que uma segunda execução lê o estado da anterior sem quebrar.

Rode com:

```bash
node teste-fumaca.mjs
```

O workflow roda esse teste **antes** de gerar o relatório: se algo quebrou, o job para ali em vez de publicar um relatório pela metade.

## GitHub Actions

O workflow oficial está em:

```text
.github/workflows/monitor.yml
```

### Frequência

O cron atual é:

```yaml
- cron: "0 * * * *"
```

Ou seja, o GitHub Actions solicita uma execução **uma vez por hora, no minuto 0 UTC**. Os três monitores da família são espaçados em 20 minutos — **XMR no 00, BTC no 20, USD no 40** — para as chamadas às fontes ficarem distribuídas e dar para saber qual execução é qual só pelo horário no log. Como todo cron do GitHub Actions, o início efetivo pode sofrer atraso de fila da própria plataforma.

O workflow também possui `workflow_dispatch`, permitindo execução manual pela aba **Actions**.

### Node.js usado oficialmente

O workflow atual usa:

```yaml
- uses: actions/setup-node@v5
  with:
    node-version: "22"
```

Portanto, **Node.js 22** é a versão usada pelo workflow oficial.

Isso não significa que Node.js 22 seja obrigatoriamente a única versão possível para execução local.

O próprio `monitor.mjs` declara não ter dependências externas e usar o `fetch` nativo disponível em Node 20+.

Assim:

- Node 22 é a versão exercitada oficialmente pelo workflow;
- o código foi escrito para Node moderno com `fetch` nativo;
- não existe etapa obrigatória de `npm install` no projeto atual.

### Persistência e publicação

A cada execução, o workflow:

0. roda `node teste-fumaca.mjs`;
1. faz `git fetch origin main`;
2. faz `git reset --hard origin/main`;
3. executa `node monitor.mjs`;
4. adiciona a pasta `docs` ao commit;
5. cria um commit caso haja mudanças;
6. tenta enviar o commit para `main`;
7. em caso de push recusado, sincroniza e tenta novamente, até cinco tentativas, com espera progressiva entre elas.

O `reset` antes da execução é importante porque `docs/estado.json` funciona como memória persistente.

Cada tentativa passa a partir do estado mais recente já publicado no branch principal.

## Executando localmente

Clone o repositório:

```bash
git clone https://github.com/matheussamadello/Monitor-XMR-Price.git
cd Monitor-XMR-Price
```

Confira a versão instalada do Node:

```bash
node --version
```

O workflow oficial usa Node.js 22.

O código atual não possui dependências npm externas e usa `fetch` nativo, portanto não há etapa de `npm install`.

Execute:

```bash
node monitor.mjs
```

Os arquivos em `docs/` serão atualizados localmente.

O monitor consulta a Kraken pela internet durante a execução.

## Fazendo um fork

1. Abra o repositório no GitHub.
2. Clique em **Fork**.
3. Crie o fork na sua conta.
4. Abra a aba **Actions** do fork e habilite os workflows, se o GitHub os tiver deixado desativados.
5. Confira em **Settings → Actions → General** se o workflow possui permissão para gravar no repositório.
6. Execute manualmente o workflow `Monitor XMR` uma vez usando **Run workflow** para validar o fork.

O workflow solicita:

```yaml
permissions:
  contents: write
```

Ele precisa dessa permissão para atualizar os arquivos em `docs/`.

O workflow atual não utiliza API keys privadas para consultar a Kraken.

## Configurando GitHub Pages

O projeto gera o conteúdo estático dentro de `docs/`.

Para publicar um fork no mesmo modelo:

1. abra **Settings → Pages**;
2. em **Build and deployment**, escolha publicação a partir de uma branch;
3. selecione a branch `main`;
4. escolha a pasta `/docs`;
5. salve e aguarde a publicação.

Com isso:

```text
docs/index.html
```

passa a ser a página principal, e:

```text
docs/relatorio.json
```

fica disponível como endpoint estático.

Em um fork com outro usuário ou outro nome de repositório, ajuste os URLs usados por bots, agentes ou LLMs para o novo endereço do GitHub Pages.

## Personalizando pares, níveis e faixas

Os níveis ficam em objetos próprios, e o array de pares apenas aponta para eles:

```js
const NIVEIS_BTC = {
  faixas: [
    [0.00656, 0.00705, "faixa_000656_000705"],
    [0.00602, 0.00639, "faixa_000602_000639"],
    [0.00565, 0.00603, "regiao_suporte_000565_000603"],
  ],
  resistencia: 0.00700,
  resistenciaLabel: "000700",
  suporte: 0.00584,
  suporteLabel: "000584",
};

const PAIRS = [
  {
    key: "usd",
    label: "XMR/USD",
    par: "XMRUSD",
    dec: 2,
    niveis: NIVEIS_USD,
  },
  {
    key: "btc",
    label: "XMR/BTC",
    par: "XMRBTC",
    dec: 8,
    niveis: NIVEIS_BTC,
  },
];
```

`NIVEIS_USD` tem a mesma forma, com o acréscimo de `resistenciaMacro`.

Ao alterar níveis pontuais, mantenha coerentes o valor e o respectivo label, porque os labels participam dos nomes de campos publicados pela máquina de estados.

Os labels também formam os ids publicados em `gatilhos_ativos`: uma faixa gera `<par>_<label>`, a resistência gera `<par>_rompe_<resistenciaLabel>` e o suporte gera `<par>_perde_<suporteLabel>`. Trocar um label muda o id correspondente, e o gatilho volta a contar como novo uma única vez.

Ao alterar faixas manuais, revise também consumidores externos que dependam da leitura dessas regiões.

## Compatibilidade com automações externas

O código mantém deliberadamente algumas convenções de compatibilidade.

No diário, existe o campo:

```text
eventos:
```

No semanal, o campo equivalente se chama:

```text
eventos_semanal:
```

Essa separação evita colisão entre consumidores externos que dependem especificamente do bloco diário.

Novos sinais internos também podem aparecer em:

```text
alertas_tecnicos:
```

Evite renomear campos existentes sem revisar previamente bots, scripts ou LLMs que consomem o relatório.

## Usando o JSON com bots, agentes e LLMs

Uma integração externa pode consultar periodicamente:

```text
https://matheussamadello.github.io/Monitor-XMR-Price/relatorio.json
```

Um consumidor robusto deve, no mínimo:

1. guardar o maior `timestamp` já processado;
2. ignorar snapshots iguais ou mais antigos;
3. diferenciar valores fechados de provisórios;
4. interpretar XMR/BTC e XMR/USD separadamente;
5. tratar zonas automáticas como contexto/confluência, e não como gatilho isolado;
6. interpretar corretamente as diferentes formas de confluência manual;
7. evitar transformar cada item de `alertas_tecnicos` em uma notificação independente;
8. fundir sinais relacionados para reduzir spam.

O arquivo [`PROMPT_XMR_TECHNICAL_WATCH.md`](./PROMPT_XMR_TECHNICAL_WATCH.md) contém uma política pronta e mais seletiva para uma LLM ou agente transformar snapshots sucessivos do `relatorio.json` em alertas técnicos.

No prompt atual:

- XMR/BTC é a referência principal para timing relativo de BTC → XMR;
- XMR/USD funciona como contexto secundário, mas pode gerar leitura própria quando houver mudança material;
- dados provisórios e fechados recebem pesos diferentes;
- RSI, DMI/ADX, divergências, volume e zonas não devem gerar alertas isolados sem contexto;
- sinais relacionados são fundidos para reduzir spam.

## Relação entre o monitor e o prompt de alerta

São duas camadas separadas:

- `monitor.mjs` coleta os dados, calcula indicadores, estrutura, níveis, estados e zonas e publica o snapshot técnico;
- `PROMPT_XMR_TECHNICAL_WATCH.md` define como uma LLM ou agente deve interpretar snapshots sucessivos para decidir se existe uma mudança nova e material que merece uma mensagem.

O prompt **não é necessário** para gerar `relatorio.json`.

Ele funciona como uma camada externa de interpretação e notificação sobre os dados produzidos pelo monitor.
