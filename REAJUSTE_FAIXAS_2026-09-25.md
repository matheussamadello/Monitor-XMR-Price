# Reajuste seletivo das faixas manuais — XMR

Dados congelados capturados em **2026-09-25T01:36:30.294Z**. Comparação na mesma janela histórica da auditoria anterior. Revisão de geometria, sem otimizar score ou criar faixas adicionais.

## Critério

O teto anterior de 0,25 ATR diário e 1% podia excluir pivôs e reações próximos. A largura agora segue a evidência de cada região, com teto de segurança de **0,5 ATR diário na calibração**. Esse teto não é uma largura alvo nem um mecanismo de ajuste automático. Todas as faixas continuam menores que as regiões amplas originais. As que já representavam bem o núcleo foram mantidas.

Contato exige interseção OHLC com a faixa exata, sem margem ATR. Episódios, reações de pelo menos 1 ATR, volume, role reversal, pesos e penalidades seguem a auditoria anterior. O score abaixo é diagnóstico, não um novo campo canônico do monitor. Alargar uma borda pode reagrupar episódios e mudar o momento da saída e a classificação de rejeição, portanto mais toques não significam necessariamente mais evidência independente. Não é backtest prospectivo.

## Faixas alteradas — diário

| Par | Antes | Agora | Largura em ATR diário | Score antes → agora | Toques antes → agora | Rejeições antes → agora | Score atual sem bônus semanal |
|---|---|---|---:|---:|---:|---:|---:|
| XMR/USD | 468–472 | 463–473 | 0.250 | 66 → 72 | 5 → 7 | 2 → 4 | 61 |
| XMR/BTC | 0,00707–0,00712 | 0,00698–0,00712 | 0.296 | 68 → 86 | 2 → 4 | 2 → 3 | 73 |
| XMR/BTC | 0,0066–0,00665 | 0,0066–0,00672 | 0.254 | 80 → 80 | 3 → 3 | 2 → 2 | 67 |

- **XMR/USD 463–473**: O nucleo ao redor de 470 excluia duas rejeicoes historicas distintas, com extremos em 463,01 e 464,69. Recupera esses contatos, sem voltar ao topo antigo de 477.
- **XMR/BTC 0,00698–0,00712**: Inclui os dois topos confirmados proximos em 0,00700 e 0,007094, com folga nas bordas. Nao herda confirmacao recente da faixa estreita.
- **XMR/BTC 0,0066–0,00672**: Inclui os dois topos confirmados proximos em 0,006624 e 0,006700. O segundo havia sido excluido pelo teto percentual anterior.

## Retestes após confirmação do núcleo anterior

Mantém o mesmo início da medição anterior (cinco velas após o pivô selecionado naquela revisão). Não reinicia a janela num pivô mais antigo acrescentado agora. Isso impede que a comparação melhore apenas por incluir mais história. Não representa validação prospectiva dos limites escolhidos hoje.

| Par | Faixa nova | Score antes → agora | Toques antes → agora | Rejeições antes → agora | Episódios abertos agora |
|---|---|---:|---:|---:|---:|
| XMR/USD | 463–473 | 60 → 72 | 4 → 6 | 1 → 3 | 0 |
| XMR/BTC | 0,00698–0,00712 | 43 → 29 | 1 → 1 | 1 → 0 | 1 |
| XMR/BTC | 0,0066–0,00672 | 31 → 31 | 1 → 1 | 0 → 0 | 1 |

**Ressalva:** em XMR/BTC 0,00698–0,00712, a rejeição posterior à confirmação que existia na faixa estreita deixa de se confirmar nos limites mais amplos. A faixa nova recupera os dois pivôs e três rejeições históricas, mas tem só um episódio posterior à confirmação, sem rejeição. A faixa 0,00660–0,00672 também continua com um episódio aberto nesse recorte. Não devem ganhar aparência de confirmação recente pelo score histórico. A macro 797–803 foi mantida: a falta de testes não seria resolvida alargando uma referência de pivô único.

## Compatibilidade e alertas

Só foram alterados limites/labels de faixas selecionadas e sua documentação. Pontos de suporte/resistência, macro, EMA89, RSI, DMI/ADX, pivôs, estrutura, divergências, motor automático, pesos e regras de alertas permanecem iguais. Os campos canônicos e o histórico não foram renomeados ou reescritos.

As faixas ampliadas podem reconhecer presença em preços antes excluídos, aumentando o tempo dentro da região. A troca de label pode mudar a assinatura uma vez. Não se promete a mesma frequência futura de alertas, nem se interpreta essa mudança de configuração como novo movimento de mercado.

Na comparação antes/depois com as mesmas respostas reais congeladas, os gatilhos ativos permaneceram idênticos. Também foram verificadas a igualdade dos indicadores, estrutura, ciclos de níveis pontuais e geometria/score/toques/rejeições das zonas automáticas. A lista de campos alterados está no registro de evidência.

## Reprodução

```sh
node teste-fumaca.mjs
node teste-auditoria-faixas.mjs
node teste-reajuste-faixas.mjs
```

Os [dados congelados](auditoria-faixas-dados-2026-09-25.json) são os mesmos da auditoria anterior. O [registro completo](reajuste-faixas-manuais-2026-09-25.json) contém os pivôs e os resultados diário/semanal das faixas alteradas e mantidas. O teste recalcula as medidas e verifica os limites, janelas e evidências, sem rede.
