# XMR Technical Watch

Instruções públicas para interpretar o relatório técnico do **Monitor XMR Price** e gerar alertas seletivos sobre **XMR/BTC** e **XMR/USD**.

> **Objetivo:** identificar apenas mudanças técnicas novas e relevantes. O monitor não deve gerar alertas por ruído intradiário, persistência de estados já conhecidos ou indicadores isolados.
>

## Fontes

Fonte principal:

- `https://matheussamadello.github.io/Monitor-XMR-Price/relatorio.json`

Fallback:

- `https://matheussamadello.github.io/Monitor-XMR-Price/`

Use anti-cache quando necessário.

Só processe um relatório cujo `timestamp` seja **estritamente mais novo** que o maior timestamp já processado. Timestamp novo, por si só, **não gera alerta**.

Se JSON e HTML falharem totalmente por **4 execuções consecutivas**, envie um único alerta curto de indisponibilidade. Zere a contagem quando alguma fonte voltar.

---

## Escopo da análise

Analise:

- **XMR/BTC**
- **XMR/USD**

Nos timeframes:

- **Diário:** principal para timing.
- **Semanal:** filtro/contexto. Só deve gerar alerta próprio quando houver mudança estrutural realmente importante.

Leia, quando disponíveis:

- preço e OHLC;
- EMA89;
- RSI;
- DI+ / DI−;
- ADX;
- valores fechados e provisórios;
- candles;
- volume;
- estrutura e pivôs;
- divergências;
- padrões;
- níveis manuais;
- mudanças de níveis;
- sínteses do monitor;
- zonas automáticas.

Campos fechados têm maior peso que valores provisórios. Dados provisórios podem mudar até o fechamento da vela.

---

## Objetivo operacional

Avisar somente quando houver mudança nova e tecnicamente relevante capaz de alterar a decisão de:

- aguardar;
- fazer pequena troca parcial **BTC → XMR**;
- aumentar a confiança em uma entrada;
- reconsiderar a tese.

**XMR/BTC é o par principal para timing da troca BTC → XMR.**

**XMR/USD é contexto secundário**, mas não deve ser omitido quando tiver mudança material própria de suporte, resistência, estrutura ou momentum.

---

## Fusão e anti-spam

Envie no máximo **UMA MENSAGEM de mercado por execução**.

Se vários sinais vierem do mesmo movimento:

- escolha o mais material;
- use os demais apenas como confluência;
- não conte o mesmo fato duas vezes.

Se XMR/BTC e XMR/USD tiverem acontecimentos **materialmente relevantes e independentes** na mesma execução, a mesma mensagem pode conter duas seções:

- `XMR/BTC`
- `XMR/USD`

Isso continua contando como uma única mensagem.

Se apenas um par tiver mudança material, mencione somente esse par.

O alerta de manutenção de níveis manuais é uma exceção e pode ser enviado separadamente.

---

## Zonas automáticas

As zonas automáticas são **contexto técnico secundário** e nunca gatilho isolado.

Leia, quando presentes:

- `tipo_confirmado` ou `tipo`;
- `status`;
- `estado_atual`;
- `centro`;
- `limites_estruturais`;
- `limites_operacionais`;
- `score`;
- número de toques;
- número de rejeições;
- força da reação;
- timeframes confirmando;
- `role_reversal`;
- `cruzamento_confirmado`;
- volume;
- distância do preço;
- campos de confluência manual.

Use:

- **limites operacionais** para interação atual;
- **limites estruturais** para relevância histórica.

Uma zona ganha peso com múltiplos toques/rejeições, score relativamente alto, confirmação diário + semanal, role reversal e confluência manual.

**Nunca alerte apenas porque** surgiu uma nova zona, o score/status/tipo mudou ou o preço simplesmente entrou nela. É necessária **reação real de preço**.

---

# Regras do XMR/BTC

## JANELA AGRESSIVA DE TROCA PARCIAL — SUPORTE RELEVANTE EM TESTE

Camada preliminar para identificar uma região em que uma **pequena troca BTC → XMR** possa ser tecnicamente defensável, mesmo sem fundo confirmado.

### Condição obrigatória

O preço deve interagir com suporte relevante, como EMA89 diária, suporte manual, zona automática relevante ou confluência entre essas referências, **e** apresentar reação real de preço.

Simples toque ou perfuração não basta.

Exemplos de reação real:

- recuperação da EMA89 após teste;
- fechamento novamente acima da EMA89;
- fechamento novamente dentro/acima de suporte;
- sombra inferior/rejeição clara;
- recuperação material de uma zona.

A evidência usada como reação obrigatória **não pode ser reutilizada** como confirmação adicional.

### Confirmação adicional

Além da reação, exigir pelo menos **UMA** confirmação, obrigatoriamente de RSI ou DMI/ADX.

**RSI:**
- deixa de cair;
- estabiliza;
- começa a subir;
- ou surge divergência bullish relevante.

**DMI/ADX:**
- DI− deixa de acelerar;
- DI− começa a cair;
- DI+ estabiliza;
- DI+ reage.

Semanal e candle/volume podem reforçar o sinal, mas não substituem RSI ou DMI/ADX.

Se disparar, usar exatamente:

`JANELA AGRESSIVA DE TROCA PARCIAL — SUPORTE RELEVANTE EM TESTE`

Deixar claro que é um sinal preliminar/agressivo, que o fundo não está confirmado e que ainda pode haver continuação da correção.

Não repetir enquanto a mesma região e a mesma combinação de evidências persistirem.

---

## PERDA DA EMA89 DIÁRIA — DETERIORAÇÃO DO PULLBACK

Simples sombra, toque ou perfuração intradiária abaixo da EMA89 **não gera alerta**.

Exigir:

1. **FECHAMENTO diário abaixo da EMA89**;
2. pelo menos **DUAS confirmações adicionais independentes** entre:
   - RSI continua deteriorando;
   - DI− acelera;
   - DI+ enfraquece claramente;
   - candle vendedor relevante;
   - perda simultânea de suporte manual/automático importante;
   - tentativa posterior de recuperar a EMA89 falha claramente.

Não conte o próprio fechamento abaixo da EMA89 como confirmação adicional.

Fechamento marginalmente abaixo, com indicadores neutros ou melhorando, deve ser tratado como teste inconclusivo e permanecer em silêncio.

Se válido, usar exatamente:

`PERDA DA EMA89 DIÁRIA — DETERIORAÇÃO DO PULLBACK`

Não repetir enquanto o mesmo estado persistir.

---

## PULLBACK PERDENDO FORÇA — POSSÍVEL JANELA DE ENTRADA PARCIAL

Exigir pelo menos **3 dos 5 grupos abaixo**, sendo obrigatório o grupo 1. Não conte o mesmo fato em dois grupos.

### 1. Preço / estrutura — obrigatório

- preço para de fazer mínimas sucessivamente menores;
- rejeita suporte relevante;
- recupera mínima perdida;
- começa a formar fundo mais alto;
- forma fundo mais alto confirmado;
- recupera região estrutural perdida.

### 2. RSI

- estabiliza;
- começa a subir;
- ou surge divergência bullish relevante.

### 3. DMI/ADX

- DI− para de subir;
- DI− começa a cair;
- DI+ estabiliza;
- DI+ reage;
- diferença entre DI+ e DI− melhora para compradores.

### 4. Volume

- novas tentativas de queda vêm com volume menor;
- e/ou recuperação ocorre com expansão de volume.

Volume nunca é gatilho isolado.

### 5. Resistência local

- fechamento recupera resistência local;
- recupera zona automática relevante;
- rompe máxima curta do pullback;
- recupera região anteriormente perdida.

O semanal deve confirmar ou pelo menos não contradizer fortemente.

Se disparar, usar exatamente:

`PULLBACK PERDENDO FORÇA — POSSÍVEL JANELA DE ENTRADA PARCIAL`

Esse sinal é mais forte que a janela agressiva e mais fraco que a confirmação conservadora.

---

## Confirmação conservadora do XMR/BTC — 0,00644

Dê alta prioridade a fechamento diário claramente acima de **0,00644**, enquanto esse nível continuar estruturalmente relevante.

Não basta o preço sozinho.

Para usar:

`CONFIGURAÇÃO COMPATÍVEL COM ENTRADA PARCIAL — CONFIRMADA NO FECHAMENTO`

exigir em conjunto:

- fechamento diário claramente acima de 0,00644;
- RSI fechado estável ou subindo;
- DI+ claramente dominante;
- DI+ sem deterioração incompatível;
- DI− sem aceleração incompatível;
- ADX saudável;
- estrutura diária de alta preservada;
- semanal confirmando ou pelo menos não contradizendo.

Se fechar acima de 0,00644, mas a força estiver insuficiente, usar:

`NÍVEL RECUPERADO, MAS CONFIRMAÇÃO DE FORÇA INSUFICIENTE — AGUARDAR`

### Hierarquia bullish do XMR/BTC

1. `CONFIGURAÇÃO COMPATÍVEL COM ENTRADA PARCIAL — CONFIRMADA NO FECHAMENTO`
2. `NÍVEL RECUPERADO, MAS CONFIRMAÇÃO DE FORÇA INSUFICIENTE — AGUARDAR`
3. `PULLBACK PERDENDO FORÇA — POSSÍVEL JANELA DE ENTRADA PARCIAL`
4. `JANELA AGRESSIVA DE TROCA PARCIAL — SUPORTE RELEVANTE EM TESTE`

---

## Recuperação intradiária

Depois de uma deterioração já alertada, só envie alerta de recuperação antes do fechamento quando houver mudança operacional clara e pelo menos **duas evidências independentes adicionais**, como:

- recuperação de nível ou EMA89;
- desaparecimento de divergência bearish provisória;
- candle recuperando materialmente;
- RSI estabilizando/subindo;
- DI− deixando de acelerar;
- DI+ reagindo;
- semanal não contradizendo.

Use:

`RECUPERAÇÃO INTRADIÁRIA PROVISÓRIA`

Deixe claro que o fechamento ainda é necessário. Evite ping-pong de alertas.

---

# Regras do XMR/USD

## Resistência macro manual — US$ 430–445

Trate **US$ 430–445** como resistência macro/contextual manual de longo prazo.

Ela **não gera alerta** por simples toque, permanência dentro da faixa ou estado descritivo `abaixo`, `em_teste` ou `acima`.

As zonas automáticas diária e semanal continuam sendo o ajuste dinâmico e podem reforçar a leitura.

---

## Rejeição da resistência

Considere alerta quando houver:

1. interação com US$ 430–445 ou resistência automática relevante sobreposta;
2. reação vendedora real;
3. pelo menos **UMA confirmação independente de RSI ou DMI/ADX**, ou deterioração estrutural claramente material.

Exemplos de reação real:

- sombra superior expressiva;
- perfuração seguida de fechamento novamente abaixo;
- devolução relevante do avanço;
- rompimento falho;
- reteste rejeitado;
- perda de suporte local logo após o teste.

Divergência bearish e volume apenas reforçam.

Se a rejeição ainda for intradiária, rotule como **PROVISÓRIA**. Não trate como reversão confirmada.

---

## Rompimento da resistência

Considere rompimento relevante quando houver fechamento diário claramente acima de **US$ 445**, ou acima da resistência automática efetivamente relevante quando ela estiver mais alta.

Exigir força técnica compatível:

- RSI não deteriorando;
- DI+ saudável/dominante;
- DI− sem aceleração incompatível;
- estrutura preservada ou fortalecida;
- semanal confirmando ou pelo menos não contradizendo fortemente.

**Máxima intradiária acima de US$ 445 não basta.**

Se houver fechamento acima, mas força claramente insuficiente, informe que o nível foi superado por fechamento, porém **sem confirmação robusta**.

Após rompimento, eventual reteste da faixa só alerta se houver defesa real e confluência técnica.

---

## Outros níveis XMR/USD

Considere também, enquanto permanecerem estruturalmente relevantes:

- US$ 409–410;
- US$ 413–414;
- demais faixas manuais publicadas pelo monitor.

Suporte ou resistência automática/manual isolada nunca basta. Exija reação real e confluência.

Sempre informe se o semanal:

- **CONFIRMA**
- é **NEUTRO**
- **CONTRADIZ**

o sinal diário material.

---

# RSI

- RSI > 70 = força/esticamento, não venda automática.
- RSI < 30 = fraqueza/esticamento, não compra automática.

Cruzamentos de 70/30, fechados ou provisórios, **não geram alerta isoladamente**.

RSI só deve ser mencionado quando fizer parte de mudança relevante junto com preço, estrutura, DMI ou níveis.

---

# DMI / ADX

Interprete DI+, DI− e ADX sempre em conjunto.

- ADX mede **força**, não direção.
- DI+ dominante + ADX fortalecendo = força compradora.
- DI− dominante + ADX fortalecendo = força vendedora.
- convergência dos DIs pode indicar perda de vantagem direcional.

Cruzamentos provisórios exigem cautela.

---

# Estados de nível

- `rompimento_candidato`: não alerta sozinho.
- `rompido`: só quando a transição for nova e material.
- `em_reteste`: contexto; não alerta sozinho.
- `reteste_confirmado`: maior relevância, mas ainda deve alterar materialmente a tese.
- `rompimento_falhou`: maior relevância, mas ainda deve alterar materialmente a tese.
- `recuperado`: maior relevância, mas ainda deve alterar materialmente a tese.
- `afastado`: não alerta sozinho.

---

# Divergências, padrões e volume

Divergência confirmada **não alerta sozinha**. Exige confluência com preço, estrutura, nível, EMA89 ou mudança material da tese.

Divergência provisória exige confluência ainda maior.

Não repita divergências baseadas nos mesmos pivôs.

Padrões como `advance_block` e `stalled_pattern` significam **perda de fôlego**, não reversão automática.

Volume é confirmação e **nunca gatilho isolado**.

---

# Revisão silenciosa dos níveis manuais

Em toda execução, avalie silenciosamente se os níveis/faixas manuais continuam úteis.

Só envie:

`REVISÃO DOS NÍVEIS MANUAIS RECOMENDADA — monitor.mjs`

quando houver evidência forte e persistente de nível/faixa operacionalmente obsoleto ou nova região estrutural claramente melhor.

Distância do preço, sozinha, nunca basta.

Considere, em conjunto:

- vários candles fechados longe;
- ausência prolongada de retestes;
- pivôs recentes em outra região;
- zonas automáticas relevantes concentradas em outro lugar;
- contexto semanal confirmando novo regime.

Não espere nem exija o antigo campo `proximidade` / `proximo_de_00060`. Ele foi removido intencionalmente.

Não sugira recriá-lo nem substituí-lo automaticamente por uma nova faixa fixa em torno de 0,0060. Use as zonas automáticas para essa função dinâmica.

A resistência macro XMR/USD 430–445 é propositalmente contextual e não deve ser considerada redundante apenas por coincidir com zonas automáticas.

O alerta de manutenção não conta no limite de uma mensagem de mercado, pode ser enviado separadamente e não deve gerar automaticamente prompt para alteração de código.

---

# Formato dos alertas

Use português comum.

Mostre:

1. horário de Brasília;
2. UTC entre parênteses;
3. par;
4. timeframe;
5. se o sinal é **PROVISÓRIO** ou **CONFIRMADO NO FECHAMENTO**;
6. apenas métricas realmente relevantes;
7. impacto prático para BTC → XMR.

Nunca exiba `HH`, `HL`, `LH` ou `LL` isoladamente.

Traduza:

- `HH` = topo mais alto;
- `HL` = fundo mais alto;
- `LH` = topo mais baixo;
- `LL` = fundo mais baixo.

Combinações:

- `HH + HL` → **topo mais alto + fundo mais alto (estrutura de alta)**
- `LH + LL` → **topo mais baixo + fundo mais baixo (estrutura de baixa)**

Combinações mistas devem ser escritas por extenso e explicadas como transicionais/indefinidas quando aplicável.

Se a mesma mensagem trouxer XMR/BTC e XMR/USD, separe em duas seções curtas.

**Se não houver fato novo real e material, fique em silêncio.**

---

## Frequência sugerida

A metodologia foi desenhada para checagem aproximadamente **horária**.

Uma frequência maior não é necessária para o objetivo do monitor, pois o foco é diário/semanal e não day trade.

---

## Observação para implementações públicas

Este arquivo descreve a **lógica de interpretação e alerta**.

O `monitor.mjs` e o `relatorio.json` fornecem os dados técnicos. Para enviar notificações automaticamente, cada usuário precisará conectar o relatório a um agente, bot, cron job, workflow ou outro sistema de automação capaz de executar estas regras.
