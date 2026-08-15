// ============================================================
// Monitor XMR — snapshot tecnico diario (Kraken)
// Roda no GitHub Actions, gera docs/index.html e docs/index.txt
// Sem dependencias: usa o fetch nativo do Node 20+.
//
// A linha "eventos:" mantem exatamente a logica e o texto originais,
// porque uma automacao externa depende dela. Alertas novos vao em
// "alertas_tecnicos:".
// ============================================================

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const PERIOD = 14;
const EMA_PERIOD = 89;

const PAIRS = [
  {
    key: "usd",
    label: "XMR/USD",
    url: "https://api.kraken.com/0/public/OHLC?pair=XMRUSD&interval=1440&assetVersion=1",
    dec: 2,
    niveis: {
      faixas: [
        [377, 385, "faixa_377_385"],
        [365, 375, "faixa_365_375"],
        [350, 355, "regiao_suporte_350_355"],
      ],
      resistencia: 410,
      resistenciaLabel: "409_410",
      suporte: 350,
      suporteLabel: "350_355",
    },
  },
  {
    key: "btc",
    label: "XMR/BTC",
    url: "https://api.kraken.com/0/public/OHLC?pair=XMRBTC&interval=1440&assetVersion=1",
    dec: 8,
    niveis: {
      faixas: [[0.00575, 0.00585, "zona_000575_000585"]],
      proximidade: [0.0061, "proximo_de_00060"],
      resistencia: 0.00644,
      resistenciaLabel: "000644",
      suporte: null,
      suporteLabel: null,
    },
  },
];

// ------------------------------------------------------------
// Indicadores (suavizacao de Wilder / RMA, igual TradingView)
// ------------------------------------------------------------

function rsiFrom(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function rsiSeries(closes, period = PERIOD) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gainSum += d;
    else lossSum -= d;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFrom(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

export function dmiSeries(highs, lows, closes, period = PERIOD) {
  const n = closes.length;
  const plusDI = new Array(n).fill(null);
  const minusDI = new Array(n).fill(null);
  const adx = new Array(n).fill(null);
  if (n < 2 * period) return { plusDI, minusDI, adx };

  const tr = new Array(n).fill(0);
  const pDM = new Array(n).fill(0);
  const mDM = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    pDM[i] = up > down && up > 0 ? up : 0;
    mDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }

  let trS = 0;
  let pS = 0;
  let mS = 0;
  for (let i = 1; i <= period; i++) {
    trS += tr[i];
    pS += pDM[i];
    mS += mDM[i];
  }

  const dx = new Array(n).fill(null);
  const writeDI = (i) => {
    const p = trS === 0 ? 0 : (100 * pS) / trS;
    const m = trS === 0 ? 0 : (100 * mS) / trS;
    plusDI[i] = p;
    minusDI[i] = m;
    dx[i] = p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m);
  };

  writeDI(period);
  for (let i = period + 1; i < n; i++) {
    trS = trS - trS / period + tr[i];
    pS = pS - pS / period + pDM[i];
    mS = mS - mS / period + mDM[i];
    writeDI(i);
  }

  const firstAdx = 2 * period - 1;
  if (n > firstAdx) {
    let sum = 0;
    for (let i = period; i <= firstAdx; i++) sum += dx[i];
    adx[firstAdx] = sum / period;
    for (let i = firstAdx + 1; i < n; i++) {
      adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }
  }

  return { plusDI, minusDI, adx };
}

// EMA exponencial padrao: semente SMA no primeiro ponto valido,
// depois close * k + ema_anterior * (1 - k), com k = 2/(n+1).
export function emaSeries(values, period = EMA_PERIOD) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let soma = 0;
  for (let i = 0; i < period; i++) soma += values[i];
  out[period - 1] = soma / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

// ------------------------------------------------------------
// Kraken
// ------------------------------------------------------------

function parseKraken(json) {
  if (json.error && json.error.length) {
    throw new Error("Kraken: " + json.error.join("; "));
  }
  const key = Object.keys(json.result).find((k) => k !== "last");
  const rows = json.result[key];
  if (!Array.isArray(rows) || rows.length < 2 * PERIOD + 2) {
    throw new Error("velas insuficientes para calcular os indicadores");
  }
  const liveRow = rows[rows.length - 1];
  const closed = rows.slice(0, -1);
  return {
    live: {
      time: Number(liveRow[0]),
      open: Number(liveRow[1]),
      high: Number(liveRow[2]),
      low: Number(liveRow[3]),
      close: Number(liveRow[4]),
    },
    times: closed.map((r) => Number(r[0])),
    opens: closed.map((r) => Number(r[1])),
    highs: closed.map((r) => Number(r[2])),
    lows: closed.map((r) => Number(r[3])),
    closes: closed.map((r) => Number(r[4])),
  };
}

function fmtUTC(epochSeconds) {
  return (
    new Date(epochSeconds * 1000).toISOString().slice(0, 16).replace("T", " ") +
    " UTC"
  );
}

function fmtDia(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

function num(v, dec) {
  return v === null || v === undefined || Number.isNaN(v) ? "--" : v.toFixed(dec);
}

// ------------------------------------------------------------
// Anatomia de vela e padroes
// ------------------------------------------------------------

function anatomia(o, h, l, c) {
  const corpo = Math.abs(c - o);
  const amplitude = h - l;
  return {
    open: o,
    high: h,
    low: l,
    close: c,
    corpo,
    amplitude,
    sombraSup: h - Math.max(o, c),
    sombraInf: Math.min(o, c) - l,
    alta: c > o,
    baixa: c < o,
    corpoRelevante: amplitude > 0 && corpo / amplitude >= 0.5,
  };
}

function velasFechadas(d, quantas) {
  const out = [];
  const n = d.closes.length;
  for (let k = 0; k < quantas; k++) {
    const i = n - 1 - k;
    if (i < 0) break;
    const v = anatomia(d.opens[i], d.highs[i], d.lows[i], d.closes[i]);
    v.time = d.times[i];
    out.push(v);
  }
  return out; // out[0] = mais recente
}

function tresSoldados(v) {
  // v[0] mais recente. Exige 3 de alta, fechamentos progressivos,
  // corpos relevantes, abertura dentro/proxima do corpo anterior,
  // sombras superiores pequenas.
  if (v.length < 3) return false;
  const [c3, c2, c1] = [v[0], v[1], v[2]]; // c1 mais antiga
  const seq = [c1, c2, c3];
  if (!seq.every((c) => c.alta && c.corpoRelevante)) return false;
  if (!(c2.close > c1.close && c3.close > c2.close)) return false;
  if (!seq.every((c) => c.corpo > 0 && c.sombraSup <= c.corpo * 0.5)) return false;
  const abreDentro = (atual, ant) =>
    atual.open >= Math.min(ant.open, ant.close) &&
    atual.open <= ant.close * 1.01;
  return abreDentro(c2, c1) && abreDentro(c3, c2);
}

function tresCorvos(v) {
  if (v.length < 3) return false;
  const [c3, c2, c1] = [v[0], v[1], v[2]];
  const seq = [c1, c2, c3];
  if (!seq.every((c) => c.baixa && c.corpoRelevante)) return false;
  if (!(c2.close < c1.close && c3.close < c2.close)) return false;
  if (!seq.every((c) => c.corpo > 0 && c.sombraInf <= c.corpo * 0.5)) return false;
  const abreDentro = (atual, ant) =>
    atual.open <= Math.max(ant.open, ant.close) &&
    atual.open >= ant.close * 0.99;
  return abreDentro(c2, c1) && abreDentro(c3, c2);
}

function detectarPadroes(v) {
  const achados = [];
  if (v.length < 2) return achados;
  const a = v[0]; // mais recente fechada
  const b = v[1]; // anterior

  if (tresSoldados(v)) achados.push("tres_soldados_brancos");
  if (tresCorvos(v)) achados.push("tres_corvos_negros");

  if (b.baixa && a.alta && a.close > b.open && a.open < b.close)
    achados.push("bullish_engulfing");
  if (b.alta && a.baixa && a.close < b.open && a.open > b.close)
    achados.push("bearish_engulfing");

  if (a.corpo > 0 && a.sombraInf >= 2 * a.corpo && a.sombraSup <= a.corpo)
    achados.push("hammer");
  if (a.corpo > 0 && a.sombraSup >= 2 * a.corpo && a.sombraInf <= a.corpo)
    achados.push("shooting_star");

  return achados;
}

function padraoEmFormacao(v, live) {
  // Duas fechadas compatíveis com soldados + terceira (viva) na mesma direcao.
  if (v.length < 2) return [];
  const [c2, c1] = [v[0], v[1]];
  const viva = anatomia(live.open, live.high, live.low, live.close);
  const fora = [];

  const duasAltas =
    c1.alta && c2.alta && c1.corpoRelevante && c2.corpoRelevante && c2.close > c1.close;
  if (duasAltas && viva.alta && viva.close > c2.close)
    fora.push("possiveis_tres_soldados_brancos");

  const duasBaixas =
    c1.baixa && c2.baixa && c1.corpoRelevante && c2.corpoRelevante && c2.close < c1.close;
  if (duasBaixas && viva.baixa && viva.close < c2.close)
    fora.push("possiveis_tres_corvos_negros");

  return fora;
}

// ------------------------------------------------------------
// Alertas tecnicos (linha NOVA, separada de "eventos")
// ------------------------------------------------------------

function alertasTecnicos(cfg, d, ind) {
  const a = [];
  const nv = cfg.niveis;
  const p = d.live.close;
  const i = d.closes.length - 1;
  const fechAtual = d.closes[i];
  const abertFech = d.opens[i];

  for (const [lo, hi, nome] of nv.faixas || []) {
    if (p >= lo && p <= hi) a.push(nome);
  }
  if (nv.proximidade && p <= nv.proximidade[0]) a.push(nv.proximidade[1]);

  // Rompimento: intradiario vs confirmado
  if (nv.resistencia !== null && nv.resistencia !== undefined) {
    const R = nv.resistencia;
    if (fechAtual > R) {
      const corpoAcima = Math.min(abertFech, fechAtual) > R;
      a.push(
        corpoAcima
          ? `rompimento_confirmado_${nv.resistenciaLabel}`
          : `rompimento_confirmado_fraco_${nv.resistenciaLabel}`
      );
    } else if (d.live.high > R || p > R) {
      a.push(`rompimento_intradiario_${nv.resistenciaLabel}`);
    }
  }

  // Perda de suporte: intradiaria vs confirmada
  if (nv.suporte !== null && nv.suporte !== undefined) {
    const S = nv.suporte;
    if (fechAtual < S) a.push(`perda_suporte_confirmada_${nv.suporteLabel}`);
    else if (d.live.low < S || p < S)
      a.push(`toque_suporte_intradiario_${nv.suporteLabel}`);
  }

  if (ind.rsi !== null && ind.rsi > 70) a.push("rsi_acima_70");
  if (ind.rsi !== null && ind.rsi < 30) a.push("rsi_abaixo_30");

  if (ind.crossUp) a.push("di_plus_cruzando_acima_di_minus");
  if (ind.crossDown) a.push("di_minus_cruzando_acima_di_plus");

  if (ind.adx !== null && ind.adxAnt !== null) {
    const subindo = ind.adx > ind.adxAnt;
    if (subindo && ind.diPlus > ind.diMinus) a.push("adx_subindo_com_di_plus_dominante");
    if (subindo && ind.diMinus > ind.diPlus) a.push("adx_subindo_com_di_minus_dominante");
  }

  return a;
}

// ------------------------------------------------------------
// Bloco de texto por par
// ------------------------------------------------------------

function readPair(cfg, d) {
  const { highs, lows, closes, opens, times, live } = d;
  const D = cfg.dec;

  // --- indicadores com velas FECHADAS (referencia principal) ---
  const rsi = rsiSeries(closes);
  const { plusDI, minusDI, adx } = dmiSeries(highs, lows, closes);
  const ema = emaSeries(closes);

  const i = closes.length - 1;
  const j = i - 1;

  // --- indicadores PROVISORIOS (incluindo a vela em formacao) ---
  const closesP = closes.concat([live.close]);
  const highsP = highs.concat([live.high]);
  const lowsP = lows.concat([live.low]);
  const rsiP = rsiSeries(closesP);
  const dmiP = dmiSeries(highsP, lowsP, closesP);
  const k = closesP.length - 1;

  // --- linha "eventos": logica e texto ORIGINAIS, nao mexer ---
  const crossUp = plusDI[j] <= minusDI[j] && plusDI[i] > minusDI[i];
  const crossDown = plusDI[j] >= minusDI[j] && plusDI[i] < minusDI[i];
  const notes = [];
  if (crossUp) notes.push("DI+ cruzou ACIMA de DI- nesta vela");
  if (crossDown) notes.push("DI+ cruzou ABAIXO de DI- nesta vela");
  if (rsi[i] >= 70 && rsi[j] < 70) notes.push("RSI entrou em sobrecompra (>=70)");
  if (rsi[i] <= 30 && rsi[j] > 30) notes.push("RSI entrou em sobrevenda (<=30)");
  if (adx[i] !== null && adx[j] !== null) {
    if (adx[i] >= 25 && adx[j] < 25)
      notes.push("ADX cruzou 25 (tendencia ganhando forca)");
    if (adx[i] < 25 && adx[j] >= 25)
      notes.push("ADX caiu abaixo de 25 (tendencia perdendo forca)");
  }
  const linhaEventos = notes.length
    ? notes.join(" | ")
    : "nenhum cruzamento nesta vela";

  // --- velas fechadas recentes e padroes ---
  const ult = velasFechadas(d, 3);
  const padroes = detectarPadroes(ult);
  const formacao = padraoEmFormacao(ult, live);

  // --- alertas tecnicos (linha nova) ---
  const alertas = alertasTecnicos(cfg, d, {
    rsi: rsi[i],
    adx: adx[i],
    adxAnt: adx[j],
    diPlus: plusDI[i],
    diMinus: minusDI[i],
    crossUp,
    crossDown,
  });

  const emaAtual = ema[i];
  const varAbertura = ((live.close - live.open) / live.open) * 100;
  const distEma =
    emaAtual === null ? null : ((live.close - emaAtual) / emaAtual) * 100;

  const L = [];
  L.push(cfg.label);
  L.push(`preco_atual: ${num(live.close, D)}`);
  L.push(`candle_atual_data: ${fmtDia(live.time)}`);
  L.push(`candle_atual_open: ${num(live.open, D)}`);
  L.push(`candle_atual_high: ${num(live.high, D)}`);
  L.push(`candle_atual_low: ${num(live.low, D)}`);
  L.push(`candle_atual_close_provisorio: ${num(live.close, D)}`);
  L.push(`candle_atual_var_pct_desde_abertura: ${num(varAbertura, 2)}`);
  L.push(`ema89: ${num(emaAtual, D)}`);
  L.push(
    `posicao_vs_ema89: ${
      emaAtual === null ? "--" : live.close >= emaAtual ? "acima" : "abaixo"
    }`
  );
  L.push(`distancia_ema89_pct: ${num(distEma, 2)}`);
  L.push("");
  L.push("# principais: calculados SOMENTE com velas fechadas");
  L.push(`rsi14_fechado: ${num(rsi[i], 2)}`);
  L.push(`di_plus14_fechado: ${num(plusDI[i], 2)}`);
  L.push(`di_minus14_fechado: ${num(minusDI[i], 2)}`);
  L.push(`adx14_fechado: ${num(adx[i], 2)}`);
  L.push(`ultimo_fechamento_data: ${fmtDia(times[i])}`);
  L.push(`ultimo_fechamento_close: ${num(closes[i], D)}`);
  L.push("");
  L.push("# PROVISORIOS: incluem a vela em formacao e PODEM MUDAR ate o");
  L.push("# fechamento diario. NAO sao a referencia principal.");
  L.push(`rsi14_provisorio: ${num(rsiP[k], 2)}`);
  L.push(`di_plus14_provisorio: ${num(dmiP.plusDI[k], 2)}`);
  L.push(`di_minus14_provisorio: ${num(dmiP.minusDI[k], 2)}`);
  L.push(`adx14_provisorio: ${num(dmiP.adx[k], 2)}`);
  L.push("");
  ult.forEach((v, idx) => {
    L.push(
      `candle_fechado_${idx + 1}: data=${fmtDia(v.time)} open=${num(v.open, D)} ` +
        `high=${num(v.high, D)} low=${num(v.low, D)} close=${num(v.close, D)} ` +
        `direcao=${v.alta ? "alta" : v.baixa ? "baixa" : "neutra"} ` +
        `corpo=${num(v.corpo, D)} sombra_sup=${num(v.sombraSup, D)} ` +
        `sombra_inf=${num(v.sombraInf, D)}`
    );
  });
  L.push("");
  L.push(`eventos: ${linhaEventos}`);
  L.push(`padrao_candles: ${padroes.length ? padroes.join(", ") : "nenhum"}`);
  L.push(
    `padrao_em_formacao: ${formacao.length ? formacao.join(", ") : "nenhum"}`
  );
  L.push(`alertas_tecnicos: ${alertas.length ? alertas.join(", ") : "nenhum"}`);

  return { texto: L.join("\n") };
}

// ------------------------------------------------------------
// Gatilhos do Telegram (inalterados)
// ------------------------------------------------------------

function avaliarGatilhos(d) {
  const out = [];
  const add = (id, msg) => out.push({ id, msg });
  const usd = d.usd;
  const btc = d.btc;

  if (usd) {
    const p = usd.live.close;
    const i = usd.closes.length - 1;
    const fech = usd.closes[i];
    const abert = usd.opens[i];
    const corpoBaixo = Math.min(abert, fech);

    if (p >= 377 && p <= 385)
      add("usd_377_385", `XMR/USD entrou na faixa 377-385 (agora ${p.toFixed(2)})`);
    if (p >= 365 && p <= 375)
      add("usd_365_375", `XMR/USD entrou na faixa 365-375 (agora ${p.toFixed(2)})`);
    if (p >= 350 && p <= 355)
      add("usd_350_355", `XMR/USD chegou na regiao de suporte 350-355 (agora ${p.toFixed(2)})`);
    if (fech > 410 && corpoBaixo > 410)
      add("usd_rompe_410", `XMR/USD fechou o diario acima de 410 com corpo confirmando (fech ${fech.toFixed(2)}, abert ${abert.toFixed(2)})`);
    if (usd.closes[i] < 350 && usd.closes[i - 1] < 350)
      add("usd_perde_350", `XMR/USD perdeu 350 com dois fechamentos diarios seguidos (${usd.closes[i - 1].toFixed(2)} e ${fech.toFixed(2)})`);
  }

  if (btc) {
    const p = btc.live.close;
    const i = btc.closes.length - 1;
    const fech = btc.closes[i];
    if (p <= 0.0061)
      add("btc_aprox_0060", `XMR/BTC se aproximou de 0,0060 (agora ${p.toFixed(8)})`);
    if (p >= 0.00575 && p <= 0.00585)
      add("btc_zona_00580", `XMR/BTC entrou na zona 0,00575-0,00585 (agora ${p.toFixed(8)})`);
    if (fech > 0.00644)
      add("btc_rompe_00644", `XMR/BTC fechou o diario acima de 0,00644 (fech ${fech.toFixed(8)})`);
  }

  return out;
}

// ------------------------------------------------------------
// Montagem da pagina
// ------------------------------------------------------------

export async function build(fetchImpl = fetch) {
  const blocks = [];
  const dados = {};

  blocks.push(`timestamp: ${fmtUTC(Math.floor(Date.now() / 1000))}`);
  blocks.push(`fonte: Kraken OHLC interval=1440 (velas diarias)`);
  blocks.push(`indicadores: RSI(14) e DMI/ADX(14) por Wilder/RMA, EMA(89) exponencial`);
  blocks.push(`nota: campos *_fechado usam apenas velas fechadas; *_provisorio inclui a vela em formacao`);
  blocks.push("");

  for (const cfg of PAIRS) {
    try {
      const res = await fetchImpl(cfg.url, {
        headers: { "User-Agent": "xmr-monitor/1.0" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseKraken(await res.json());
      dados[cfg.key] = parsed;
      blocks.push(readPair(cfg, parsed).texto);
    } catch (err) {
      blocks.push(`${cfg.label}\nFALHA: ${err.message}`);
    }
    blocks.push("");
  }

  const gatilhos = avaliarGatilhos(dados);
  blocks.push(
    gatilhos.length
      ? "GATILHOS ATIVOS: " + gatilhos.map((g) => g.id).join(", ")
      : "GATILHOS ATIVOS: nenhum"
  );
  blocks.push("");
  blocks.push("fim do relatorio");
  return { texto: blocks.join("\n"), gatilhos };
}

function toHTML(text) {
  return (
    "<!doctype html>\n<meta charset=utf-8>\n<title>Monitor XMR</title>\n" +
    '<pre style="font:14px/1.5 ui-monospace,monospace;padding:1rem;white-space:pre-wrap">' +
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;") +
    "</pre>\n"
  );
}

// So executa quando chamado direto (nao durante os testes)
if (process.argv[1] && process.argv[1].endsWith("monitor.mjs")) {
  const { texto, gatilhos } = await build();
  mkdirSync("docs", { recursive: true });

  let anteriores = [];
  try {
    anteriores = JSON.parse(readFileSync("docs/estado.json", "utf8")).ativos || [];
  } catch {
    anteriores = [];
  }
  const ativos = gatilhos.map((g) => g.id);
  const novos = gatilhos.filter((g) => !anteriores.includes(g.id));

  writeFileSync("docs/index.html", toHTML(texto));
  writeFileSync("docs/index.txt", texto + "\n");
  writeFileSync("docs/.nojekyll", "");
  writeFileSync(
    "docs/estado.json",
    JSON.stringify({ ativos, em: new Date().toISOString() }, null, 2) + "\n"
  );

  if (novos.length) {
    writeFileSync(
      "alerta.txt",
      "ALERTA XMR\n\n" + novos.map((g) => "- " + g.msg).join("\n") + "\n"
    );
    console.log("NOVOS GATILHOS:", novos.map((g) => g.id).join(", "));
  } else {
    console.log("nenhum gatilho novo");
  }

  console.log(texto);
}
