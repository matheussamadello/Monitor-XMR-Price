// Harness de fumaca: serve series sinteticas no formato OHLC da Kraken e
// confere que o relatorio sai inteiro, sem tocar na rede.
//
// Existe porque o monitor publica sozinho de hora em hora: sem isso, um
// refactor que quebre o parse ou o calculo so apareceria em producao,
// com o relatorio ja no ar.
import { build, relatorioParaJSON, analisarVolume } from "./monitor.mjs";

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// Ordem de grandeza plausivel por par, so para os numeros do relatorio
// nao sairem absurdos. O calculo nao depende disso.
const BASES = { XBTUSD: 70000, XMRUSD: 150, XMRBTC: 0.0021 };

function serie(par, passo, n) {
  const base = BASES[par] || 100;
  const out = [];
  let p = base;
  let t = Math.floor(Date.now() / 1000 / passo) * passo - n * passo;
  for (let i = 0; i < n; i++) {
    t += passo;
    const o = p;
    const c = Math.max(base / 100, o * (1 + (rnd() - 0.48) * 0.03));
    const h = Math.max(o, c) * (1 + rnd() * 0.01);
    const l = Math.min(o, c) * (1 - rnd() * 0.01);
    const vol = 500 + rnd() * 3000;
    // [time, open, high, low, close, vwap, volume, count]
    out.push([t, o, h, l, c, (h + l) / 2, vol, Math.floor(100 + rnd() * 900)]);
    p = c;
  }
  return out;
}

const cache = new Map();
function serieDe(par, interval) {
  const chave = `${par}|${interval}`;
  if (!cache.has(chave)) {
    const passo = Number(interval) * 60;
    cache.set(chave, serie(par, passo, interval === "1440" ? 900 : 400));
  }
  return cache.get(chave);
}

function fakeFetch({ http = null, erroKraken = null } = {}) {
  return async (url) => {
    if (http) return { ok: false, status: http, json: async () => ({}) };
    const par = url.match(/pair=([^&]+)/)[1];
    const interval = url.match(/interval=([^&]+)/)[1];
    if (erroKraken) {
      return { ok: true, json: async () => ({ error: [erroKraken], result: {} }) };
    }
    // A chave do result e' arbitraria: parseKraken pega a primeira que
    // nao seja "last", que e' exatamente o que a Kraken faz (XBTUSD vira
    // XXBTZUSD na resposta).
    return {
      ok: true,
      json: async () => ({ error: [], result: { [`X${par}`]: serieDe(par, interval), last: 0 } }),
    };
  };
}

let falhas = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FALHA") + "  " + m); if (!c) falhas++; };

console.log("== relatorio completo ==");
const r1 = await build(fakeFetch(), {});
ok(!/FALHA:/.test(r1.texto), "nenhum bloco em FALHA");
ok(!/NaN|undefined/.test(r1.texto), "sem NaN/undefined no texto");
ok(/rsi14_fechado: \d/.test(r1.texto), "RSI calculado");
ok(/adx14_fechado: \d/.test(r1.texto), "ADX calculado");
ok(/ema89: \d/.test(r1.texto), "EMA89 calculada");
ok(/estrutura_preco: \w/.test(r1.texto), "estrutura de pivos");
ok(/volume_referencia: ultima_vela_fechada/.test(r1.texto), "volume declara a base da comparacao");
ok(/zonas_automaticas_total: \d|zonas_automaticas: nenhuma/.test(r1.texto), "secao de zonas presente");
ok(/GATILHOS ATIVOS:/.test(r1.texto), "linha de gatilhos presente");
ok(/^eventos: /m.test(r1.texto), "linha 'eventos:' do bloco diario preservada");
ok(/^eventos_semanal: /m.test(r1.texto), "linha 'eventos_semanal:' do bloco semanal preservada");

console.log("\n== fonte fora do ar ==");
const r2 = await build(fakeFetch({ http: 503 }), {});
ok(/FALHA:/.test(r2.texto), "bloco marcado como FALHA");
ok(/HTTP 503/.test(r2.texto), "erro cita o status");
ok(/GATILHOS ATIVOS:/.test(r2.texto), "relatorio continua ate o fim");

console.log("\n== fonte devolve erro de aplicacao ==");
const r3 = await build(fakeFetch({ erroKraken: "EQuery:Unknown asset pair" }), {});
ok(/FALHA:/.test(r3.texto), "bloco marcado como FALHA");
ok(/Unknown asset pair/.test(r3.texto), "erro da fonte aparece no relatorio");

console.log("\n== volume: vela parcial nao classifica ==");
{
  // Volume e' acumulado: no inicio do periodo a vela viva tem giro
  // minusculo. Isso NAO pode virar "contracao_forte".
  const fechadas = new Array(20).fill(1000);
  const a = analisarVolume(fechadas, 30);
  ok(Math.abs(a.vsMediaPct) < 1e-9, `vela em formacao nao puxa a classificacao (${a.vsMediaPct.toFixed(2)}%)`);
  ok(a.classificacao === "normal", `20 dias iguais e' "normal" (deu ${a.classificacao})`);
  ok(a.atual === 30, "volume da vela viva continua publicado, cru");
  // E sinal real na ultima FECHADA continua sendo detectado.
  const seca = analisarVolume(fechadas.slice(0, 19).concat([100]), 999999);
  ok(seca.classificacao === "contracao_forte", `queda real vira contracao_forte (deu ${seca.classificacao})`);
  const pico = analisarVolume(fechadas.slice(0, 19).concat([3000]), 1);
  ok(pico.classificacao === "expansao_forte", `pico real vira expansao_forte (deu ${pico.classificacao})`);
}

console.log("\n== JSON ==");
const j = relatorioParaJSON(r1.texto, r1.zonas);
const pares = Object.keys(j.diario);
ok(pares.length > 0, `JSON tem bloco diario (${pares.join(", ")})`);
for (const p of pares) {
  ok(typeof j.diario[p].preco_atual === "number", `${p}: preco_atual numerico`);
  ok(typeof j.semanal[p].rsi14_fechado === "number", `${p}: RSI semanal numerico`);
  ok(Array.isArray(j.diario[p].alertas_tecnicos), `${p}: alertas_tecnicos vira lista`);
  ok(Array.isArray(j.diario[p].niveis_manuais.faixas), `${p}: faixas manuais publicadas`);
}
ok(Array.isArray(j.gatilhos_ativos), "gatilhos_ativos vira lista");

console.log("\n== estado entre execucoes ==");
const r4 = await build(fakeFetch(), {
  niveis: r1.estadoNiveis, zonas: r1.zonasEstado, contadoresZona: r1.contadoresZona,
});
ok(!/NaN|undefined/.test(r4.texto), "segunda execucao le o estado anterior sem quebrar");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntudo passou");
process.exit(falhas ? 1 : 0);
