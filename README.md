# Monitor XMR Price

Monitor técnico automatizado de **XMR/USD** e **XMR/BTC** que coleta candles da Kraken, calcula indicadores, acompanha estrutura de mercado e publica um relatório estático em HTML, texto e JSON para consulta humana ou consumo por bots, agentes e LLMs.

O projeto foi desenhado para acompanhamento de movimentos de prazo mais longo, com o gráfico **diário** como referência principal de timing e o **semanal** como filtro de contexto estrutural.

No prompt de alertas incluído no projeto, **XMR/BTC** é o par principal para avaliar o momento relativo de uma troca BTC → XMR, enquanto **XMR/USD** funciona como contexto complementar de preço, suporte, resistência, estrutura e momentum.

## Links públicos

- Repositório: https://github.com/matheussamadello/Monitor-XMR-Price
- Página do monitor: https://matheussamadello.github.io/Monitor-XMR-Price/
- Relatório JSON: https://matheussamadello.github.io/Monitor-XMR-Price/relatorio.json
- JSON bruto no repositório: https://raw.githubusercontent.com/matheussamadello/Monitor-XMR-Price/main/docs/relatorio.json

## Pares analisados

O monitor acompanha dois pares:

- **XMR/USD** — leitura do Monero em dólar.
- **XMR/BTC** — leitura relativa do Monero contra Bitcoin.

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

### RSI(14)

O monitor calcula RSI de 14 períodos usando suavização de Wilder/RMA.

O relatório separa:

- `rsi14_fechado`: calculado apenas com velas fechadas;
- `rsi14_provisorio`: inclui a vela atualmente em formação.

O código também detecta divergências de RSI confirmadas e provisórias a partir de pivôs de preço.

### DMI/ADX(14)

São calculados:

- `di_plus14_fechado` / `di_plus14_provisorio`;
- `di_minus14_fechado` / `di_minus14_provisorio`;
- `adx14_fechado` / `adx14_provisorio`.

O cálculo usa suavização de Wilder/RMA.

O ADX mede força direcional e deve ser interpretado junto de DI+ e DI−. O monitor não trata ADX isoladamente como indicação de direção.

### EMA89

O monitor calcula uma média móvel exponencial de 89 períodos e publica campos como:

- `ema89`;
- `posicao_vs_ema89`;
- `distancia_ema89_pct`.

A EMA89 diária pode funcionar como suporte ou resistência dinâmica para timing.

A EMA89 semanal é especialmente útil como filtro de contexto estrutural maior.

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

`HH + HL` caracteriza estrutura de alta.

`LH + LL` caracteriza estrutura de baixa.

Combinações mistas são mantidas como estrutura lateral, indefinida ou transicional.

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

Os níveis manuais ficam configurados dentro de cada par no array `PAIRS` de `monitor.mjs`.

### XMR/USD

Na versão atual do código:

| Região | Função |
| --- | --- |
| US$ 377–385 | faixa manual |
| US$ 365–375 | faixa manual |
| US$ 350–355 | região manual de suporte |
| US$ 409–410 | referência pontual de rompimento/reteste |
| US$ 350 | âncora pontual de suporte para a máquina de estados |
| US$ 430–445 | resistência macro manual/contextual |

A resistência macro de US$ 430–445 é intencionalmente diferente dos níveis da máquina de estados.

Ela funciona como **referência contextual de longo prazo** e não gera, por si só:

- evento;
- gatilho;
- alerta técnico;
- mudança na máquina de estados.

O relatório publica seu tipo, limites, estado relativo ao preço e distância.

### XMR/BTC

Na versão atual do código:

| Região | Função |
| --- | --- |
| 0,00575–0,00585 BTC | faixa manual |
| 0,00644 BTC | resistência pontual / máquina de estados |

Atualmente não existe suporte pontual fixo configurado para XMR/BTC.

As zonas automáticas podem cumprir o papel de contexto dinâmico de suporte e resistência sem exigir a criação de uma nova linha manual toda vez que o regime muda.

### Faixas manuais e JSON

As faixas manuais fazem parte da configuração do código e também são consideradas no cálculo de confluência das zonas automáticas.

No JSON público atual, a máquina de estados dos níveis pontuais e a resistência macro aparecem dentro de `niveis_manuais`.

As zonas automáticas também publicam campos próprios de confluência, como:

- `confluencia_nivel_manual`;
- `confluencia_faixa_manual`;
- `confluencia_resistencia_macro`;
- `confluencia_manual_qualquer`.

Portanto, consumidores externos não devem inferir que `confluencia_nivel_manual` representa sozinho toda forma possível de confluência manual.

## Máquina de estados de rompimento e reteste

Os níveis pontuais possuem estado persistente avaliado sobre candles fechados, para evitar que simples oscilações intradiárias mudem a leitura estrutural.

Entre os principais estados implementados estão:

- `rompimento_candidato`;
- `rompido`;
- `em_reteste`;
- `reteste_confirmado`;
- `rompimento_falhou`;
- `recuperado`.

O registro também pode marcar `afastado` quando o preço já se distanciou da região depois de um ciclo de reteste ou recuperação.

A máquina diferencia um critério mais sensível, que pode armar um candidato, de critérios mais rigorosos usados para confirmar mudanças de estado.

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
│   ├── index.html
│   ├── index.txt
│   └── relatorio.json
├── monitor.mjs
├── README.md
└── PROMPT_XMR_TECHNICAL_WATCH.md
```

## GitHub Actions

O workflow oficial está em:

```text
.github/workflows/monitor.yml
```

### Frequência

O cron atual é:

```yaml
- cron: "5 * * * *"
```

Ou seja, o GitHub Actions solicita uma execução uma vez por hora, no minuto 5 UTC.

Como todo cron do GitHub Actions, o início efetivo pode sofrer algum atraso de fila da própria plataforma.

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

1. faz `git fetch origin main`;
2. faz `git reset --hard origin/main`;
3. executa `node monitor.mjs`;
4. adiciona a pasta `docs` ao commit;
5. cria um commit caso haja mudanças;
6. tenta enviar o commit para `main`;
7. em caso de push recusado, sincroniza e tenta novamente, até três tentativas.

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
6. Execute manualmente o workflow `monitor` uma vez usando **Run workflow** para validar o fork.

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

Os pares ficam configurados no array:

```js
const PAIRS = [
  {
    key: "usd",
    label: "XMR/USD",
    par: "XMRUSD",
    // ...
  },
  {
    key: "btc",
    label: "XMR/BTC",
    par: "XMRBTC",
    // ...
  },
];
```

Cada par possui sua própria configuração de níveis.

Exemplo simplificado de XMR/BTC:

```js
niveis: {
  faixas: [[0.00575, 0.00585, "zona_000575_000585"]],
  resistencia: 0.00644,
  resistenciaLabel: "000644",
  suporte: null,
  suporteLabel: null,
}
```

Ao alterar níveis pontuais, mantenha coerentes o valor e o respectivo label, porque os labels participam dos nomes de campos publicados pela máquina de estados.

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

O arquivo:

```text
PROMPT_XMR_TECHNICAL_WATCH.md
```

contém uma política pronta e mais seletiva para uma LLM ou agente transformar snapshots sucessivos do `relatorio.json` em alertas técnicos.

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
