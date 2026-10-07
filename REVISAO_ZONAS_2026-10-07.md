# Revisão de XMR e zonas automáticas — 2026-10-07

Coleta real: 2026-10-07T09:48:03.724Z. Referência de main: 2026-10-07 07:53 UTC. A evidência detalhada, com hashes das respostas, está em revisao-zonas-2026-10-07.json.

## Resultado das zonas

- **XMR/USD:** nenhuma região adicional elegível para promoção. As novas regiões com poucos episódios ou score insuficiente permanecem automáticas.
- **XMR/BTC:** nenhuma região adicional elegível para promoção. As novas regiões com poucos episódios ou score insuficiente permanecem automáticas.

## Correções necessárias

- Bloco semanal com falha preserva memoria, mas nao confirma nem pontua zonas diarias.
- Sem pivos na serie valida, as fichas antigas passam pela reconciliacao e pela carencia de orfas.

As correções da auditoria de 01/10 ainda estavam fora de main e foram mantidas nesta revisão. As faixas existentes e os níveis pontuais foram preservados. O código dos branches anteriores de Codex e Claude foi considerado; não houve alteração nova do motor em main desde 28/09.

## Verificação

- `node teste-fumaca.mjs`: suíte completa aprovada nos três projetos.
- `PARIDADE_SEM_REDE=1 node paridade.mjs`: motor compartilhado em paridade.
- Reproduções das duas falhas novas reprovaram antes da correção e passaram depois.
- Replay das respostas reais: níveis, EMA89, IDs, geometria, score e contadores preservados; reexecução da mesma vela estável.
- No USD, o snapshot mudou apenas quatro linhas de contagem das faixas (7 para 8). Nos demais, snapshots idênticos.

A validação de lacunas de horas e a tolerância de idade do câmbio permanecem conservadoras e não substituem calendário oficial de sessões/feriados. Esta revisão valida comportamento e qualidade da referência; não mede rentabilidade.
