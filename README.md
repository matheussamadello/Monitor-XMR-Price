# Monitor XMR Price

Monitor técnico automatizado de **Monero (XMR)** com dados OHLC da Kraken.

O projeto acompanha **XMR/USD** e **XMR/BTC** nos timeframes **diário** e **semanal**, calcula indicadores técnicos, estrutura de preço, divergências, volume, níveis manuais e zonas automáticas de suporte/resistência, e publica os resultados em HTML, texto e JSON.

## Monitor online

**Página principal**

https://matheussamadello.github.io/Monitor-XMR-Price/

**Relatório JSON**

https://matheussamadello.github.io/Monitor-XMR-Price/relatorio.json

O relatório é atualizado automaticamente pelo GitHub Actions.

---

## O que o monitor analisa

### Pares

- `XMR/USD`
- `XMR/BTC`

### Timeframes

- **Diário (`1440`)** — principal para timing, pullbacks, rompimentos e mudanças de curto/médio prazo.
- **Semanal (`10080`)** — contexto estrutural e confirmação da tendência maior.

### Indicadores

- **RSI(14)**
- **DMI/ADX(14)**
- **EMA(89)**

RSI e DMI/ADX usam suavização **Wilder/RMA**.

O monitor diferencia valores calculados somente com candles fechados de valores provisórios da vela ainda em formação:

- `*_fechado`
- `*_provisorio`

Isso evita tratar uma mudança intradiária temporária como se já estivesse confirmada.

---

## Recursos técnicos

O `monitor.mjs` inclui, entre outras coisas:

- OHLC da Kraken;
- EMA89;
- RSI(14);
- DI+, DI− e ADX(14);
- anatomia dos candles;
- análise de corpo e sombras;
- volume e média de volume;
- comparação de volume parcial;
- pivôs de preço;
- estrutura de mercado:
  - topo mais alto;
  - fundo mais alto;
  - topo mais baixo;
  - fundo mais baixo;
- divergências de RSI:
  - regulares;
  - ocultas;
  - bullish;
  - bearish;
- padrões de candles;
- níveis manuais;
- estados persistentes de rompimento e reteste;
- zonas automáticas de suporte e resistência;
- limites estruturais e operacionais das zonas;
- score de relevância;
- número de toques e rejeições;
- role reversal;
- confluência entre diário e semanal;
- confluência entre zonas automáticas e referências manuais;
- sínteses de entrada, pullback, risco e deterioração de tendência.

---

## Zonas automáticas

Além dos níveis manuais, o monitor calcula automaticamente regiões relevantes de suporte e resistência usando pivôs e volatilidade.

Cada zona pode trazer informações como:

```text
tipo
status
estado_atual
centro
limites_estruturais
limites_operacionais
score
numero_toques
numero_rejeicoes
forca_reacao_atr
timeframes_confirmando
role_reversal
volume_contexto
distancia_preco_atual_pct
confluencias manuais
```

### Limites estruturais

Representam a região histórica associada aos pivôs que formaram a zona.

### Limites operacionais

Representam uma área mais estreita usada para interpretar a interação atual do preço.

As zonas automáticas são mantidas de forma persistente para preservar identidade e histórico ao longo das execuções.

---

## Níveis manuais

O monitor também possui níveis/faixas definidos manualmente para regiões consideradas estruturalmente importantes.

Exemplos atuais incluem:

### XMR/USD

- faixas históricas de suporte;
- região de US$ 409–410;
- suporte próximo de US$ 350–355;
- resistência macro de **US$ 430–445**.

### XMR/BTC

- faixa de **0,00575–0,00585**;
- resistência de **0,00644**.

Os níveis automáticos e manuais coexistem. As zonas automáticas fazem o ajuste dinâmico, enquanto os níveis manuais preservam referências consideradas importantes.

---

## Arquivos principais

```text
Monitor-XMR-Price/
├── .github/
│   └── workflows/
│       └── monitor.yml
├── docs/
│   ├── index.html
│   ├── index.txt
│   ├── relatorio.json
│   ├── estado.json
│   └── .nojekyll
├── monitor.mjs
├── PROMPT_XMR_TECHNICAL_WATCH.md
└── README.md
```

### `monitor.mjs`

Código principal do monitor.

Busca os candles na Kraken, calcula os indicadores e gera os relatórios.

### `docs/index.html`

Versão web do relatório técnico.

### `docs/index.txt`

Relatório completo em texto puro.

### `docs/relatorio.json`

Versão estruturada do relatório.

É o arquivo mais indicado para integração com:

- agentes de IA;
- bots;
- scripts;
- automações;
- sistemas de alerta.

### `docs/estado.json`

Mantém o estado persistente entre execuções, incluindo informações necessárias para acompanhar níveis e zonas ao longo do tempo.

Evite apagá-lo sem necessidade se quiser preservar a continuidade do monitor.

Se você fizer alterações profundas na configuração ao criar uma versão própria, pode optar por reiniciar esse estado antes da primeira execução.

### `PROMPT_XMR_TECHNICAL_WATCH.md`

Prompt com uma metodologia de interpretação do `relatorio.json` para produzir alertas técnicos mais seletivos.

Ele pode ser usado como base em ChatGPT, Claude ou outro agente/sistema de automação capaz de consultar periodicamente o relatório.

---

## Como funciona

Fluxo simplificado:

```text
Kraken OHLC
     │
     ▼
 monitor.mjs
     │
     ├── indicadores
     ├── candles
     ├── volume
     ├── estrutura/pivôs
     ├── divergências
     ├── níveis manuais
     └── zonas automáticas
     │
     ▼
 docs/
     ├── index.html
     ├── index.txt
     ├── relatorio.json
     └── estado.json
     │
     ▼
 GitHub Pages / automações externas
```

---

## Execução automática

O projeto usa **GitHub Actions**.

Workflow:

```text
.github/workflows/monitor.yml
```

A execução programada ocorre aproximadamente uma vez por hora:

```yaml
cron: "5 * * * *"
```

Também existe suporte a execução manual através de:

```yaml
workflow_dispatch:
```

O workflow atual:

1. faz checkout do repositório;
2. configura Node.js;
3. executa `node monitor.mjs`;
4. atualiza os arquivos em `docs/`;
5. cria um commit quando há mudanças;
6. envia o commit para o branch `main`.

---

## Executar localmente

O projeto não exige pacotes npm externos.

Recomendado:

- **Node.js 22**

O código usa APIs nativas do Node e pode funcionar em versões modernas compatíveis com `fetch`.

Clone o repositório:

```bash
git clone https://github.com/matheussamadello/Monitor-XMR-Price.git
cd Monitor-XMR-Price
```

Execute:

```bash
node monitor.mjs
```

Depois da execução, os arquivos atualizados serão gravados em:

```text
docs/
```

---

## Criar seu próprio monitor

### 1. Faça um fork

No GitHub, clique em **Fork** para criar sua própria cópia.

### 2. Ative o GitHub Actions

Em forks de repositórios públicos, pode ser necessário habilitar manualmente os workflows na aba **Actions**.

Verifique também se o workflow possui permissão para escrever no repositório, pois ele precisa atualizar a pasta `docs/`.

### 3. Configure o GitHub Pages

Abra:

**Settings → Pages**

Use:

```text
Source: Deploy from a branch
Branch: main
Folder: /docs
```

Depois disso, o monitor poderá ficar disponível em um endereço semelhante a:

```text
https://SEU_USUARIO.github.io/Monitor-XMR-Price/
```

E o JSON em:

```text
https://SEU_USUARIO.github.io/Monitor-XMR-Price/relatorio.json
```

### 4. Execute o workflow

Você pode:

- aguardar a execução horária; ou
- entrar em **Actions → monitor → Run workflow**.

---

## Personalização

Os pares e níveis manuais ficam configurados no início do `monitor.mjs`.

Exemplo simplificado:

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

Você pode adaptar níveis e faixas para sua própria metodologia.

Ao alterar o código, tenha cuidado com campos usados por integrações externas.

Em especial, o projeto mantém separadamente:

```text
eventos:
```

no diário e:

```text
eventos_semanal:
```

no semanal.

Evite mudar nomes ou semântica de campos existentes sem revisar as automações que consomem o relatório.

---

## Usando o prompt de alerta

O arquivo:

```text
PROMPT_XMR_TECHNICAL_WATCH.md
```

contém uma lógica mais seletiva de alerta.

A ideia é que um agente consulte periodicamente:

```text
relatorio.json
```

e compare o novo estado com a análise anterior.

A lógica procura evitar alertas por:

- simples atualização de timestamp;
- RSI cruzando 70 ou 30 isoladamente;
- simples toque em uma zona;
- mudanças pequenas de score;
- persistência de um estado já conhecido;
- sinais duplicados causados pelo mesmo movimento.

Ela prioriza mudanças que realmente alterem a leitura técnica.

---

## Estrutura do `relatorio.json`

O JSON é dividido principalmente em:

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

Cada par contém indicadores, candles, estrutura, divergências, volume, níveis e zonas.

Para integrações, prefira o JSON em vez de tentar interpretar o HTML.

---

## Fonte dos dados

Os dados OHLC são obtidos pela API pública da **Kraken**.

Endpoints utilizados pelo monitor seguem o formato:

```text
https://api.kraken.com/0/public/OHLC
```

com os pares:

```text
XMRUSD
XMRBTC
```

e intervalos diário e semanal.

---

## Contribuições e versões próprias

Você pode usar o projeto como base para:

- criar um fork;
- testar outras regras de alerta;
- modificar níveis manuais;
- adicionar integrações;
- criar uma interface diferente para o JSON;
- conectar o relatório a bots ou agentes de IA.

Se alterar a lógica das zonas ou dos indicadores, é recomendável preservar a diferença entre:

- dados **fechados**;
- dados **provisórios**;
- estado persistente;
- contexto diário;
- contexto semanal.

Isso evita transformar movimentos ainda não confirmados em sinais definitivos.
