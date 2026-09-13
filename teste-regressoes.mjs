// Reproducoes dos defeitos da auditoria. Sem rede; executavel sozinho
// ou pelo teste-fumaca.mjs usado no workflow.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as m from "./monitor.mjs";

const DIA = 86400;
const epoch = (s) => Date.parse(s) / 1000;
const clone = (x) => JSON.parse(JSON.stringify(x));
let falhas = 0;
let grupos = 0;
async function teste(nome, fn) {
  grupos++;
  try { await fn(); console.log(`OK regressao: ${nome}`); }
  catch (e) { falhas++; console.error(`FALHA regressao: ${nome}\n${e.stack}`); }
}
async function noInstante(iso, fn) {
  const original = Date.now;
  Date.now = () => Date.parse(iso);
  try { return await fn(); } finally { Date.now = original; }
}

await teste("uma vela nao retesta o proprio rompimento", () => {
  for (const direcao of ["alta", "baixa"]) {
    const vela = direcao === "alta"
      ? { open: 101, high: 104, low: 99, close: 103 }
      : { open: 99, high: 101, low: 96, close: 97 };
    const ctx = { nivel: 100, direcao, vela: { ...vela, time: 1788825600 },
      atr: 4, tolAtr: 0.25, resetAtr: 1.5, maxCandles: 30, segundos: DIA };
    const primeiro = m.atualizarEstadoNivel(null, ctx);
    assert.equal(primeiro.estado, "rompido");
    const salvo = clone(primeiro);
    for (let i = 0; i < 5; i++) {
      const repetido = m.atualizarEstadoNivel(clone(primeiro), ctx);
      assert.equal(repetido.estado, "rompido");
      assert.deepEqual(repetido.historico, []);
      assert.equal(repetido.atualizado, ctx.vela.time);
    }
    const antigo = m.atualizarEstadoNivel(primeiro,
      { ...ctx, vela: { ...ctx.vela, time: ctx.vela.time - DIA, close: 100 } });
    assert.equal(antigo.estado, "rompido");
    assert.equal(antigo.atualizado, ctx.vela.time);
    assert.deepEqual(primeiro, salvo, "entrada persistida nao e' mutada");
    const reteste = m.atualizarEstadoNivel(primeiro,
      { ...ctx, vela: { ...ctx.vela, time: ctx.vela.time + DIA } });
    assert.equal(reteste.estado, "reteste_confirmado", "uma vela posterior pode retestar");
    assert.equal(reteste.historico.length, 1);
  }
});

await teste("sinteses preservam a direcao do nivel", () => {
  const ctx = { alertas: [], estrutura: { tendencia: "indefinida" },
    estruturaEventos: [], divergencias: [], vol: null, enfraquecimento: [],
    fraqueza: [], rsiFech: null, rsiAnt: null, diPlus: null, diMinus: null };
  const resumo = (estado, direcao) => m.sinteses({ ...ctx, estadosNivel: [{ estado, direcao }] });
  assert.equal(resumo("rompimento_falhou", "baixa").deterioracao, "nenhuma");
  assert.match(resumo("rompimento_falhou", "alta").deterioracao, /rompimento_falhou/);
  assert.equal(resumo("reteste_confirmado", "baixa").entrada, "nenhuma");
  assert.match(resumo("reteste_confirmado", "alta").entrada, /reteste_confirmado/);
  assert.equal(resumo("em_reteste", "baixa").pullback, "nenhuma");
  assert.match(resumo("em_reteste", "alta").pullback, /em_reteste_de_nivel/);
  assert.match(resumo("em_reteste", "baixa").riscos, /nivel_em_teste/);
  assert.equal(m.sinteses({ ...ctx, estadosNivel: ["reteste_confirmado"] }).entrada, "nenhuma");
});

await teste("zonas nao derivam quando a vela fechada e' a mesma", () => {
  const tf = m.TIMEFRAMES_TESTE.find((t) => t.key === "diario");
  const cfg = { key: "audit", dec: 2, niveis: { faixas: [] } };
  const dados = (n) => {
    const closes = Array.from({ length: n }, (_, i) => 100 + i * .014 + 9 * Math.sin(i * .29) + 3 * Math.sin(i * .077));
    return { closes, opens: closes.map((c, i) => closes[i - 1] ?? c),
      highs: closes.map((c, i) => Math.max(c, closes[i - 1] ?? c) + .7),
      lows: closes.map((c, i) => Math.min(c, closes[i - 1] ?? c) - .7),
      times: closes.map((_, i) => 1704067200 + i * DIA),
      volumes: closes.map(() => 1000), temVolume: true,
      live: { close: closes.at(-1), volume: 500, time: 1704067200 + n * DIA } };
  };
  let anterior = [], proximoId = 1, comparadas = 0;
  for (let n = 150; n <= 165; n++) {
    const d = dados(n);
    const calcular = (zonasAnteriores) => m.calcularZonas(cfg, tf, d, {
      pivos: m.acharPivos(d.highs, d.lows, tf.pivos.esq, tf.pivos.dir),
      zonasAnteriores, zonasSemanais: [], proximoId });
    const novo = calcular(anterior);
    proximoId = novo.proximoId;
    let repetido = novo;
    for (let i = 0; i < 4; i++) {
      d.live.close = d.closes.at(-1) + i - 2;
      repetido = calcular(clone(repetido.zonasEstado.map(m.zonaParaEstado)));
      assert.equal(repetido.proximoId, proximoId, "retry nao cria identidade");
      for (const z of repetido.zonasEstado) {
        const antes = novo.zonasEstado.find((a) => a.id === z.id);
        assert.ok(antes, `zona ${z.id} preservada`);
        assert.equal(z.centro, antes.centro);
        assert.equal(z.score, antes.score);
        comparadas++;
      }
    }
    anterior = novo.zonasEstado;
  }
  assert.ok(comparadas > 0, "fixture precisa produzir zonas");
});

await teste("volume confirma apenas o rompimento/perda da mesma vela fechada", () => {
  const alertas = (d, vsMediaPct, suporte = false) => m.alertasTecnicos({ niveis: {
    resistencia: suporte ? null : 100, resistenciaLabel: "100",
    suporte: suporte ? 100 : null, suporteLabel: "100", faixas: [] } }, d,
    { rsi: null, adx: null, adxAnt: null, volume: { vsMediaPct, tendencia: "irregular" } });
  const viva = { opens: [98], closes: [99], live: { open: 99, high: 102, low: 98, close: 101 } };
  for (const vol of [60, -60]) {
    const a = alertas(viva, vol);
    assert.ok(a.includes("rompimento_intradiario_100"));
    assert.ok(!a.some((x) => /volume/.test(x)), a.join(","));
    const b = alertas({ opens: [102], closes: [101],
      live: { open: 101, high: 102, low: 98, close: 99 } }, vol, true);
    assert.ok(!b.some((x) => /volume/.test(x)), b.join(","));
  }
  assert.ok(alertas({ ...viva, opens: [101], closes: [103] }, 60).includes("rompimento_com_volume_acima_da_media"));
  assert.ok(alertas({ ...viva, opens: [99], closes: [103] }, 60).includes("rompimento_com_volume_acima_da_media"));
  assert.ok(alertas({ ...viva, opens: [99], closes: [97] }, 60, true).includes("queda_com_expansao_de_volume"));
});

function respostaYahoo(rows, meta = {}) {
  return JSON.stringify({ chart: { error: null, result: [{ meta: { gmtoffset: 0, ...meta },
    timestamp: rows.map((r) => r.time), indicators: { quote: [{
      open: rows.map((r) => r.open), high: rows.map((r) => r.high),
      low: rows.map((r) => r.low), close: rows.map((r) => r.close) }] } }] } });
}
function respostaBinance(rows, passo) {
  return JSON.stringify(rows.map((r) => [r.time * 1000, r.open, r.high, r.low, r.close,
    r.volume, (r.time + passo) * 1000 - 1, 0, 100]));
}
function mockFetch() {
  return async (raw) => {
    const url = new URL(raw);
    const yahoo = url.hostname.includes("yahoo");
    const binance = url.hostname.includes("binance");
    const intervalo = url.searchParams.get("interval");
    const passo = ["10080", "1w", "1wk"].includes(intervalo) ? DIA * 7 : DIA;
    const cfg = yahoo ? m.PARES_TESTE.find((p) => p.key === "usd")
      : binance ? m.PARES_TESTE.find((p) => p.key === "usdt")
      : m.PARES_TESTE.find((p) => p.par === url.searchParams.get("pair"));
    assert.ok(cfg, `fonte inesperada no mock: ${url.hostname}`);
    const agora = Math.floor(Date.now() / 1000);
    const fim = passo === DIA ? Math.floor(agora / DIA) * DIA
      : Math.floor((agora + 3 * DIA) / passo) * passo - 3 * DIA;
    const rows = [];
    for (let i = 0; i < 170; i++) {
      const time = fim - (169 - i) * passo;
      if (yahoo && passo === DIA && [0, 6].includes(new Date(time * 1000).getUTCDay())) continue;
      const R = cfg.niveis.resistencia;
      const close = R * (1.05 + .002 * Math.sin(i * .3));
      rows.push({ time, open: R * 1.045, high: close + .02 * R,
        low: R * 1.035, close, volume: 1000 + i });
    }
    const text = yahoo ? respostaYahoo(rows) : binance ? respostaBinance(rows, passo)
      : JSON.stringify({ error: [], result: { candles: rows.map((r) =>
        [r.time, r.open, r.high, r.low, r.close, r.close, r.volume, 100]), last: fim } });
    return { ok: true, text: async () => text, json: async () => JSON.parse(text) };
  };
}
const estadoDe = (r) => clone({ niveis: r.estadoNiveis, zonas: r.zonasEstado, contadoresZona: r.contadoresZona });
const jsonDe = (r) => m.relatorioParaJSON(r.texto, r.zonas);

await teste("eventos persistem entre execucoes e expiram na vela seguinte", async () => {
  let salvo;
  await noInstante("2026-09-10T12:00:00Z", async () => {
    const primeiro = await m.build(mockFetch(), {});
    assert.doesNotMatch(primeiro.texto, /FALHA:/);
    const j1 = jsonDe(primeiro);
    salvo = estadoDe(primeiro);
    const reinicio = await m.build(mockFetch(), clone(salvo));
    const j2 = jsonDe(reinicio);
    for (const tf of ["diario", "semanal"]) for (const p of m.PARES_TESTE) {
      assert.ok(j1[tf][p.label].niveis_mudancas_nesta_vela.length > 0);
      assert.deepEqual(j2[tf][p.label].niveis_mudancas_nesta_vela, j1[tf][p.label].niveis_mudancas_nesta_vela);
      assert.deepEqual(j2[tf][p.label].alertas_tecnicos, j1[tf][p.label].alertas_tecnicos);
    }
    assert.deepEqual(estadoDe(reinicio), salvo);
    const falha = await m.build(async () => ({ ok: false, status: 503 }), clone(salvo));
    assert.deepEqual(falha.estadoNiveis, salvo.niveis, "falha de fonte nao apaga eventos persistidos");
    const legado = clone(salvo);
    for (const n of Object.values(legado.niveis)) delete n.mudancasNaVela;
    const migrado = jsonDe(await m.build(mockFetch(), legado));
    for (const p of m.PARES_TESTE)
      assert.deepEqual(migrado.diario[p.label].niveis_mudancas_nesta_vela, [], "sem anuncio retroativo no estado legado");
  });
  await noInstante("2026-09-11T12:00:00Z", async () => {
    const proximo = jsonDe(await m.build(mockFetch(), salvo));
    for (const p of m.PARES_TESTE) {
      assert.deepEqual(proximo.diario[p.label].niveis_mudancas_nesta_vela, []);
      assert.ok(proximo.semanal[p.label].niveis_mudancas_nesta_vela.length > 0, "semana ainda e' a mesma");
    }
  });
});

await teste("historico conta condicao e referencia uma vez por vela", () => {
  const dir = mkdtempSync(join(tmpdir(), "monitor-regressao-"));
  try {
    mkdirSync(join(dir, "docs"));
    const medir = (rows) => {
      writeFileSync(join(dir, "docs/historico.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
      const r = spawnSync(process.execPath, [fileURLToPath(new URL("./analisar-historico.mjs", import.meta.url)), "1"],
        { cwd: dir, encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    };
    const precos = [100, 110, 109, 107, 108, 106, 111];
    const serie = (par, tf) => precos.map((fech, i) => ({ par, tf, vela: `2026-01-0${i + 1}`,
      fech, atr: 1, alertas: ["constante"], deterioracao: [], conf_entrada: [],
      conf_pullback: [], niveis_mud: [], estrutura: "alta", ema89_cruz: "nenhum" }));
    const rows = [];
    for (const [par, tf] of [["P/Q", "diario"], ["R/Q", "diario"], ["P/Q", "semanal"]]) {
      for (const e of serie(par, tf)) {
        rows.push(e, { ...e, alertas: ["constante", "posterior"] });
        if (e.vela === "2026-01-01") for (let i = 0; i < 10; i++) rows.push(e);
      }
    }
    const texto = medir(rows);
    for (const [par, tf] of [["P/Q", "diario"], ["R/Q", "diario"], ["P/Q", "semanal"]])
      for (const condicao of ["alerta:constante", "alerta:posterior", "TODAS AS VELAS (referencia)"]) {
        const linha = texto.split("\n").find((l) => l.startsWith(`${par} | ${tf} | ${condicao}`));
        assert.ok(linha, `${par}/${tf}/${condicao} presente`);
        assert.match(linha, /\s6\s+0\.00\s+50%$/, linha);
      }
    const curta = serie("P/Q", "diario").slice(0, 2);
    assert.match(medir([...Array(20).fill(curta[0]), curta[1]]), /Ainda nao ha amostras suficientes/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// O monitor USD acrescenta abaixo os cenarios de fechamento das fontes.

assert.equal(falhas, 0, `${falhas} de ${grupos} grupos de regressao falharam`);
console.log(`${grupos} grupos de regressao passaram.`);
