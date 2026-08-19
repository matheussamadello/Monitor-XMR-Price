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

const TIMEFRAMES = [
  {
    key: "diario",
    titulo: "GRAFICO DIARIO",
    interval: 1440,
    segundos: 86400,
    retestMaxCandles: 30,
    // A automacao externa le a linha "eventos:" do bloco diario.
    // Por isso o semanal usa um nome diferente, para nunca colidir.
    campoEventos: "eventos",
  },
  {
    key: "semanal",
    titulo: "GRAFICO SEMANAL",
    interval: 10080,
    segundos: 604800,
    retestMaxCandles: 8,
    campoEventos: "eventos_semanal",
  },
];

const PAIRS = [
  {
    key: "usd",
    label: "XMR/USD",
    par: "XMRUSD",
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
    par: "XMRBTC",
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

function urlKraken(cfg, tf) {
  return `https://api.kraken.com/0/public/OHLC?pair=${cfg.par}&interval=${tf.interval}&assetVersion=1`;
}

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
      // Kraken OHLC: [time, open, high, low, close, vwap, volume, count]
      volume: Number(liveRow[6]),
      trades: Number(liveRow[7]),
    },
    times: closed.map((r) => Number(r[0])),
    opens: closed.map((r) => Number(r[1])),
    highs: closed.map((r) => Number(r[2])),
    lows: closed.map((r) => Number(r[3])),
    closes: closed.map((r) => Number(r[4])),
    volumes: closed.map((r) => Number(r[6])),
    trades: closed.map((r) => Number(r[7])),
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
    v.volume = d.volumes ? d.volumes[i] : null;
    out.push(v);
  }
  return out; // out[0] = mais recente
}

// Mediana dos corpos das ultimas N velas fechadas. Serve de escala
// relativa: XMR/USD e XMR/BTC vivem em ordens de grandeza diferentes,
// entao qualquer limiar absoluto seria arbitrario num deles.
function medianaCorpos(opens, closes, n = 20) {
  const corpos = [];
  for (let i = Math.max(0, closes.length - n); i < closes.length; i++) {
    corpos.push(Math.abs(closes[i] - opens[i]));
  }
  if (!corpos.length) return null;
  corpos.sort((a, b) => a - b);
  const m = Math.floor(corpos.length / 2);
  return corpos.length % 2 ? corpos[m] : (corpos[m - 1] + corpos[m]) / 2;
}

// Criterios geometricos de "vela compradora forte".
// Nao e' Marubozu: sombras sao toleradas, so nao podem dominar.
const CORPO_RANGE_MIN = 0.55; // corpo / (high - low)
const FECHA_PERTO_MAX = 0.70; // (close - low) / (high - low)
const SOMBRA_SUP_MAX = 0.40; // sombra superior / corpo
const CORPO_VS_MEDIANA = 0.75; // corpo / mediana dos ultimos 20 corpos

function compradoraForte(v, mediana) {
  if (!v.alta) return false;
  if (!(v.amplitude > 0) || !(v.corpo > 0)) return false;
  if (v.corpo / v.amplitude < CORPO_RANGE_MIN) return false;
  if ((v.close - v.low) / v.amplitude < FECHA_PERTO_MAX) return false;
  if (v.sombraSup > SOMBRA_SUP_MAX * v.corpo) return false;
  if (mediana && mediana > 0 && v.corpo < CORPO_VS_MEDIANA * mediana) return false;
  return true;
}

function vendedoraForte(v, mediana) {
  if (!v.baixa) return false;
  if (!(v.amplitude > 0) || !(v.corpo > 0)) return false;
  if (v.corpo / v.amplitude < CORPO_RANGE_MIN) return false;
  if ((v.high - v.close) / v.amplitude < FECHA_PERTO_MAX) return false;
  if (v.sombraInf > SOMBRA_SUP_MAX * v.corpo) return false;
  if (mediana && mediana > 0 && v.corpo < CORPO_VS_MEDIANA * mediana) return false;
  return true;
}

// Abertura dentro (ou muito proxima) do corpo real da vela anterior.
function abreNoCorpoAnterior(atual, ant, alta) {
  const topoCorpo = Math.max(ant.open, ant.close);
  const baseCorpo = Math.min(ant.open, ant.close);
  const folga = 0.1 * ant.corpo;
  return alta
    ? atual.open >= baseCorpo && atual.open <= topoCorpo + folga
    : atual.open <= topoCorpo && atual.open >= baseCorpo - folga;
}

function tresSoldados(v, mediana) {
  if (v.length < 3) return false;
  const [c3, c2, c1] = [v[0], v[1], v[2]]; // c1 = mais antiga
  const seq = [c1, c2, c3];
  if (!seq.every((c) => compradoraForte(c, mediana))) return false;
  if (!(c2.close > c1.close && c3.close > c2.close)) return false;
  return abreNoCorpoAnterior(c2, c1, true) && abreNoCorpoAnterior(c3, c2, true);
}

function tresCorvos(v, mediana) {
  if (v.length < 3) return false;
  const [c3, c2, c1] = [v[0], v[1], v[2]];
  const seq = [c1, c2, c3];
  if (!seq.every((c) => vendedoraForte(c, mediana))) return false;
  if (!(c2.close < c1.close && c3.close < c2.close)) return false;
  return abreNoCorpoAnterior(c2, c1, false) && abreNoCorpoAnterior(c3, c2, false);
}

function detectarPadroes(v, mediana) {
  const achados = [];
  if (v.length < 2) return achados;
  const a = v[0]; // mais recente fechada
  const b = v[1]; // anterior

  if (tresSoldados(v, mediana)) achados.push("tres_soldados_brancos");
  if (tresCorvos(v, mediana)) achados.push("tres_corvos_negros");

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

function padraoEmFormacao(v, live, mediana) {
  // Duas fechadas ja validas como soldados/corvos + a vela em formacao
  // atendendo AGORA aos mesmos criterios geometricos. Se ela perder
  // forca durante o dia, o padrao some sozinho na proxima execucao.
  if (v.length < 2) return [];
  const [c2, c1] = [v[0], v[1]]; // c1 = mais antiga das duas
  const viva = anatomia(live.open, live.high, live.low, live.close);
  const fora = [];

  const duasAltas =
    compradoraForte(c1, mediana) &&
    compradoraForte(c2, mediana) &&
    c2.close > c1.close &&
    abreNoCorpoAnterior(c2, c1, true);
  if (
    duasAltas &&
    compradoraForte(viva, mediana) &&
    viva.close > c2.close &&
    abreNoCorpoAnterior(viva, c2, true)
  ) {
    fora.push("possiveis_tres_soldados_brancos");
  }

  const duasBaixas =
    vendedoraForte(c1, mediana) &&
    vendedoraForte(c2, mediana) &&
    c2.close < c1.close &&
    abreNoCorpoAnterior(c2, c1, false);
  if (
    duasBaixas &&
    vendedoraForte(viva, mediana) &&
    viva.close < c2.close &&
    abreNoCorpoAnterior(viva, c2, false)
  ) {
    fora.push("possiveis_tres_corvos_negros");
  }

  return fora;
}


// ------------------------------------------------------------
// Contexto e degradacoes do padrao de tres velas
//
// Tres Soldados Brancos e' um padrao de REVERSAO na definicao de
// Nison: a forma so tem o significado original quando aparece depois
// de queda ou em regiao de preco deprimida. A mesma geometria no meio
// de uma alta madura e' continuacao — ou exaustao. Por isso a forma e
// o contexto sao reportados em campos separados.
// ------------------------------------------------------------

const CTX_LOOKBACK = 10;

function contextoAntesDoTrio(closes, idxReferencia, lookback = CTX_LOOKBACK) {
  const fim = idxReferencia;
  const ini = fim - lookback;
  if (ini < 0 || fim < 0 || fim >= closes.length) return "indefinido";
  const janela = closes.slice(ini, fim + 1);
  const min = Math.min(...janela);
  const max = Math.max(...janela);
  const amplitude = max - min;
  if (!(amplitude > 0)) return "lateral";

  // Inclinacao por media de metades: menos sensivel a ruido de uma
  // vela isolada do que comparar apenas os dois extremos da janela.
  const meio = Math.floor(janela.length / 2);
  const media = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const m1 = media(janela.slice(0, meio));
  const m2 = media(janela.slice(meio));
  let inclinacao = "lateral";
  if (m2 < m1 * 0.99) inclinacao = "queda";
  else if (m2 > m1 * 1.01) inclinacao = "alta";

  // Posicao usa a media das 3 ultimas, nao um fechamento solto.
  const ref = media(janela.slice(-3));
  const posicao = (ref - min) / amplitude;

  if (inclinacao === "queda" && posicao <= 0.4) return "queda_regiao_baixa";
  if (inclinacao === "queda") return "queda";
  if (posicao <= 0.35) return "regiao_baixa";
  if (inclinacao === "alta" && posicao >= 0.6) return "alta_regiao_alta";
  if (inclinacao === "alta") return "alta";
  if (posicao >= 0.65) return "regiao_alta";
  return "lateral";
}

// Evidencias de que a alta esta perdendo forca. Estar em regiao alta
// NAO e' uma delas: posicao no range diz onde o preco esta, nao que a
// pressao compradora acabou.
function evidenciasFraqueza(trio, enfraquecimento, divergencias, estruturaEventos) {
  const ev = [];
  for (const e of enfraquecimento || []) ev.push(e);

  for (const d of divergencias || []) {
    if (d.tipo.startsWith("bearish")) ev.push(`divergencia_${d.tipo}`);
  }

  if (trio && trio.length >= 3) {
    const [c3, c2, c1] = [trio[0], trio[1], trio[2]];
    if (c2.sombraSup > c1.sombraSup && c3.sombraSup > c2.sombraSup)
      ev.push("sombras_superiores_crescentes");
  }

  for (const e of estruturaEventos || []) {
    if (e === "perda_estrutura_alta_novo_LL" || e === "topo_mais_baixo_apos_HH")
      ev.push(`estrutura_${e}`);
  }

  return ev;
}

function classificarContextoSoldados(ctx, fraqueza = []) {
  if (ctx.includes("queda") || ctx.includes("regiao_baixa"))
    return "reversao_valida";
  if (ctx.includes("alta"))
    return fraqueza.length ? "exaustao_possivel" : "continuacao";
  if (ctx === "lateral") return "lateral_significado_fraco";
  return "indefinido";
}

function classificarContextoCorvosComFraqueza(ctx, forca = []) {
  if (ctx.includes("alta")) return "reversao_valida";
  if (ctx.includes("queda") || ctx.includes("regiao_baixa"))
    return forca.length ? "exaustao_possivel" : "continuacao";
  if (ctx === "lateral") return "lateral_significado_fraco";
  return "indefinido";
}

// A estrutura HH/HL/LH/LL CONFIRMA ou CONTRADIZ a leitura da janela de
// 10 velas. Nao substitui: os dois campos convivem no relatorio.
function confirmacaoEstrutural(ctx, tendencia) {
  if (!tendencia || tendencia === "lateral_indefinida") return "neutro";
  const ctxBaixa = ctx.includes("queda") || ctx.includes("regiao_baixa");
  const ctxAlta = ctx.includes("alta");
  if (ctxBaixa && tendencia === "baixa") return "confirma";
  if (ctxAlta && tendencia === "alta") return "confirma";
  if (ctxBaixa && tendencia === "alta") return "contradiz";
  if (ctxAlta && tendencia === "baixa") return "contradiz";
  return "neutro";
}



// Por que o trio NAO virou padrao. So faz sentido quando a sequencia
// basica (tres altas com fechamentos progressivos) ja existe.
function diagnosticoSoldados(v, mediana) {
  if (v.length < 3) return "velas_insuficientes";
  const [c3, c2, c1] = [v[0], v[1], v[2]];
  const seq = [c1, c2, c3];
  if (!seq.every((c) => c.alta)) return "nao_aplicavel";
  if (!(c2.close > c1.close && c3.close > c2.close))
    return "fechamentos_nao_progressivos";

  const falhas = [];
  seq.forEach((c, idx) => {
    const nome = `c${idx + 1}`;
    if (!(c.amplitude > 0) || !(c.corpo > 0)) falhas.push(`${nome}:sem_corpo`);
    else {
      if (c.corpo / c.amplitude < CORPO_RANGE_MIN)
        falhas.push(`${nome}:corpo_range_${(c.corpo / c.amplitude).toFixed(2)}`);
      if ((c.close - c.low) / c.amplitude < FECHA_PERTO_MAX)
        falhas.push(
          `${nome}:fecha_longe_da_maxima_${((c.close - c.low) / c.amplitude).toFixed(2)}`
        );
      if (c.sombraSup > SOMBRA_SUP_MAX * c.corpo)
        falhas.push(`${nome}:sombra_sup_${(c.sombraSup / c.corpo).toFixed(2)}x_corpo`);
      if (mediana && mediana > 0 && c.corpo < CORPO_VS_MEDIANA * mediana)
        falhas.push(`${nome}:corpo_pequeno_${(c.corpo / mediana).toFixed(2)}x_mediana`);
    }
  });
  if (!abreNoCorpoAnterior(c2, c1, true)) falhas.push("c2:abre_fora_do_corpo_anterior");
  if (!abreNoCorpoAnterior(c3, c2, true)) falhas.push("c3:abre_fora_do_corpo_anterior");

  return falhas.length ? falhas.join(" ") : "nenhuma";
}

// Advance block e stalled pattern: a forma aparece, mas degradando.
// Sao sinais de ENFRAQUECIMENTO da alta, nao de forca.
function detectarEnfraquecimento(v) {
  const out = [];
  if (v.length < 3) return out;
  const [c3, c2, c1] = [v[0], v[1], v[2]];
  const seq = [c1, c2, c3];
  if (!seq.every((c) => c.alta && c.corpo > 0)) return out;
  if (!(c2.close > c1.close && c3.close > c2.close)) return out;

  const corposCaindo = c2.corpo < c1.corpo && c3.corpo < c2.corpo;
  const sombrasCrescendo = c2.sombraSup > c1.sombraSup && c3.sombraSup > c2.sombraSup;
  if (corposCaindo && sombrasCrescendo) out.push("advance_block");

  if (c3.corpo < 0.5 * c2.corpo && c3.sombraSup > c3.corpo)
    out.push("stalled_pattern");

  return out;
}

// ------------------------------------------------------------
// Pivos, estrutura de mercado, divergencias de RSI e volume
//
// METODOLOGIA DE PIVOS (fractal com confirmacao a direita):
// um indice p e' pivo de topo se high[p] for estritamente maior que
// os PIVO_ESQ candles anteriores e MAIOR OU IGUAL aos PIVO_DIR
// posteriores. Pivo de fundo e' o espelho, com low.
// Como sao exigidos PIVO_DIR candles POSTERIORES, um pivo so existe
// depois que essas velas fecharam. Isso elimina look-ahead: os
// ultimos PIVO_DIR candles fechados nunca sao classificados como
// pivo, e a vela em formacao nunca entra nesse calculo.
// ------------------------------------------------------------

const PIVO_ESQ = 2;
const PIVO_DIR = 2;
const DIV_JANELA = 60; // pivos mais antigos que isso sao ignorados
const DIV_SEP_MIN = 5; // distancia minima, em velas, entre os dois pivos
const DIV_MIN_PRECO_PCT = 0.3; // variacao minima de preco entre pivos, em %
const DIV_MIN_RSI = 2; // variacao minima de RSI entre pivos, em pontos
const VOL_MEDIA = 20;

export function acharPivos(highs, lows, esq = PIVO_ESQ, dir = PIVO_DIR) {
  const altos = [];
  const baixos = [];
  const n = highs.length;
  for (let p = esq; p < n - dir; p++) {
    let topo = true;
    let fundo = true;
    for (let k = 1; k <= esq; k++) {
      if (!(highs[p] > highs[p - k])) topo = false;
      if (!(lows[p] < lows[p - k])) fundo = false;
    }
    for (let k = 1; k <= dir; k++) {
      if (!(highs[p] >= highs[p + k])) topo = false;
      if (!(lows[p] <= lows[p + k])) fundo = false;
    }
    if (topo) altos.push(p);
    if (fundo) baixos.push(p);
  }
  return { altos, baixos };
}

// HH/HL/LH/LL a partir dos dois ultimos pivos de cada tipo.
export function classificarEstrutura(highs, lows, pivos) {
  const { altos, baixos } = pivos;
  const topo =
    altos.length >= 2
      ? highs[altos[altos.length - 1]] > highs[altos[altos.length - 2]]
        ? "HH"
        : "LH"
      : null;
  const fundo =
    baixos.length >= 2
      ? lows[baixos[baixos.length - 1]] > lows[baixos[baixos.length - 2]]
        ? "HL"
        : "LL"
      : null;

  let tendencia = "lateral_indefinida";
  if (topo === "HH" && fundo === "HL") tendencia = "alta";
  else if (topo === "LH" && fundo === "LL") tendencia = "baixa";

  const rotulo = topo && fundo ? `${topo}_${fundo}` : "indefinida";
  return { topo, fundo, rotulo, tendencia };
}

// Quebra de estrutura: LL logo depois de uma sequencia de HL, ou
// HH logo depois de uma sequencia de LH.
export function mudancaEstrutura(highs, lows, pivos) {
  const { altos, baixos } = pivos;
  const eventos = [];
  if (baixos.length >= 3) {
    const [a, b, c] = baixos.slice(-3).map((p) => lows[p]);
    if (b > a && c < b) eventos.push("perda_estrutura_alta_novo_LL");
    if (b < a && c > b) eventos.push("novo_HL_apos_fundo_mais_baixo");
  }
  if (altos.length >= 3) {
    const [a, b, c] = altos.slice(-3).map((p) => highs[p]);
    if (b < a && c > b) eventos.push("novo_HH_apos_topo_mais_baixo");
    if (b > a && c < b) eventos.push("topo_mais_baixo_apos_HH");
  }
  return eventos;
}

// ------------------------------------------------------------
// Divergencias de RSI, comparando pivo com pivo
// ------------------------------------------------------------

function variacaoPct(a, b) {
  return b === 0 ? 0 : ((a - b) / Math.abs(b)) * 100;
}

export function detectarDivergencias(highs, lows, rsi, pivos) {
  const achadas = [];
  const n = lows.length;
  const ultimo = n - 1;

  const valido = (p) =>
    rsi[p] !== null && rsi[p] !== undefined && ultimo - p <= DIV_JANELA;

  // --- fundos: bullish regular e bearish oculta ---
  const fundos = pivos.baixos.filter(valido);
  if (fundos.length >= 2) {
    const p2 = fundos[fundos.length - 1];
    const p1 = fundos[fundos.length - 2];
    if (p2 - p1 >= DIV_SEP_MIN) {
      const dPreco = variacaoPct(lows[p2], lows[p1]);
      const dRsi = rsi[p2] - rsi[p1];
      if (Math.abs(dPreco) >= DIV_MIN_PRECO_PCT && Math.abs(dRsi) >= DIV_MIN_RSI) {
        if (dPreco < 0 && dRsi > 0)
          achadas.push(det("bullish_regular", p1, p2, lows, rsi, "fundo"));
        if (dPreco > 0 && dRsi < 0)
          achadas.push(det("bullish_oculta", p1, p2, lows, rsi, "fundo"));
      }
    }
  }

  // --- topos: bearish regular e bullish oculta ---
  const topos = pivos.altos.filter(valido);
  if (topos.length >= 2) {
    const p2 = topos[topos.length - 1];
    const p1 = topos[topos.length - 2];
    if (p2 - p1 >= DIV_SEP_MIN) {
      const dPreco = variacaoPct(highs[p2], highs[p1]);
      const dRsi = rsi[p2] - rsi[p1];
      if (Math.abs(dPreco) >= DIV_MIN_PRECO_PCT && Math.abs(dRsi) >= DIV_MIN_RSI) {
        if (dPreco > 0 && dRsi < 0)
          achadas.push(det("bearish_regular", p1, p2, highs, rsi, "topo"));
        if (dPreco < 0 && dRsi > 0)
          achadas.push(det("bearish_oculta", p1, p2, highs, rsi, "topo"));
      }
    }
  }

  return achadas;
}

function det(tipo, p1, p2, precos, rsi, lado) {
  return {
    tipo,
    lado,
    confirmada: true,
    idxAnterior: p1,
    idxAtual: p2,
    precoAnterior: precos[p1],
    precoAtual: precos[p2],
    rsiAnterior: rsi[p1],
    rsiAtual: rsi[p2],
  };
}

// Divergencia PROVISORIA: compara o ultimo pivo confirmado com a
// vela em formacao. Nunca confirmada — a vela ainda pode mudar.
export function divergenciaProvisoria(highs, lows, rsi, rsiProv, pivos, live) {
  const n = lows.length;
  const idxViva = n; // posicao da vela em formacao na serie estendida
  const out = [];

  const fundos = pivos.baixos.filter((p) => rsi[p] !== null && n - p <= DIV_JANELA);
  if (fundos.length) {
    const p1 = fundos[fundos.length - 1];
    if (idxViva - p1 >= DIV_SEP_MIN && rsiProv !== null) {
      const dPreco = variacaoPct(live.low, lows[p1]);
      const dRsi = rsiProv - rsi[p1];
      if (
        Math.abs(dPreco) >= DIV_MIN_PRECO_PCT &&
        Math.abs(dRsi) >= DIV_MIN_RSI &&
        dPreco < 0 &&
        dRsi > 0
      ) {
        out.push({
          tipo: "bullish_regular",
          lado: "fundo",
          confirmada: false,
          idxAnterior: p1,
          idxAtual: idxViva,
          precoAnterior: lows[p1],
          precoAtual: live.low,
          rsiAnterior: rsi[p1],
          rsiAtual: rsiProv,
        });
      }
    }
  }

  const topos = pivos.altos.filter((p) => rsi[p] !== null && n - p <= DIV_JANELA);
  if (topos.length) {
    const p1 = topos[topos.length - 1];
    if (idxViva - p1 >= DIV_SEP_MIN && rsiProv !== null) {
      const dPreco = variacaoPct(live.high, highs[p1]);
      const dRsi = rsiProv - rsi[p1];
      if (
        Math.abs(dPreco) >= DIV_MIN_PRECO_PCT &&
        Math.abs(dRsi) >= DIV_MIN_RSI &&
        dPreco > 0 &&
        dRsi < 0
      ) {
        out.push({
          tipo: "bearish_regular",
          lado: "topo",
          confirmada: false,
          idxAnterior: p1,
          idxAtual: idxViva,
          precoAnterior: highs[p1],
          precoAtual: live.high,
          rsiAnterior: rsi[p1],
          rsiAtual: rsiProv,
        });
      }
    }
  }

  return out;
}

// ------------------------------------------------------------
// Volume
// ------------------------------------------------------------

export function analisarVolume(volumes, volumeVivo, media = VOL_MEDIA) {
  const n = volumes.length;
  if (n < 2) {
    return {
      atual: volumeVivo,
      ultimaFechada: null,
      media: null,
      vsMediaPct: null,
      classificacao: "indefinido",
      tendencia: "indefinida",
    };
  }
  const usa = Math.min(media, n);
  const janela = volumes.slice(n - usa);
  const med = janela.reduce((a, b) => a + b, 0) / usa;
  const ultima = volumes[n - 1];
  const vsMedia = med === 0 ? null : ((volumeVivo - med) / med) * 100;

  let classificacao = "normal";
  if (vsMedia !== null) {
    if (vsMedia >= 50) classificacao = "expansao_forte";
    else if (vsMedia >= 20) classificacao = "acima_da_media";
    else if (vsMedia <= -50) classificacao = "contracao_forte";
    else if (vsMedia <= -20) classificacao = "abaixo_da_media";
  }

  // tendencia das ultimas 3 fechadas
  let tendencia = "indefinida";
  if (n >= 3) {
    const [a, b, c] = volumes.slice(-3);
    if (c < b && b < a) tendencia = "decrescente";
    else if (c > b && b > a) tendencia = "crescente";
    else tendencia = "irregular";
  }

  return {
    atual: volumeVivo,
    ultimaFechada: ultima,
    media: med,
    periodoMedia: usa,
    vsMediaPct: vsMedia,
    classificacao,
    tendencia,
  };
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

  // --- divergencias (so as confirmadas viram alerta) ---
  for (const dv of ind.divergencias || []) {
    a.push(`divergencia_${dv.tipo}_confirmada`);
  }

  // --- estrutura de mercado ---
  for (const ev of ind.estruturaEventos || []) a.push(ev);

  // --- mudancas de estado de nivel (so quando MUDA) ---
  for (const m of ind.mudancasNivel || []) a.push(m);

  // --- volume como CONFIRMACAO, nunca sozinho ---
  const vol = ind.volume;
  const houveRompimento = a.some((x) => x.startsWith("rompimento_"));
  const houvePerda = a.some((x) => x.startsWith("perda_suporte_") || x.startsWith("toque_suporte_"));
  // Vela muito no inicio do periodo: volume ainda nao e' comparavel
  // com a media de velas completas. Nada de forte/fraco aqui.
  if (vol && vol.vsMediaPct !== null && !ind.volumeInconclusivo) {
    if (houveRompimento && vol.vsMediaPct >= 20) a.push("rompimento_com_volume_acima_da_media");
    if (houveRompimento && vol.vsMediaPct <= -20) a.push("rompimento_com_volume_fraco");
    if (houvePerda && vol.vsMediaPct >= 50) a.push("queda_com_expansao_de_volume");
  }
  if (
    vol &&
    vol.tendencia === "decrescente" &&
    ind.estruturaTendencia === "alta" &&
    !houveRompimento
  ) {
    a.push("pullback_com_volume_decrescente");
  }

  // --- degradacoes do trio: enfraquecimento, nao forca ---
  for (const e of ind.enfraquecimento || []) a.push(e);
  if (ind.padroes && ind.padroes.includes("tres_soldados_brancos")) {
    if (ind.contextoTrio === "reversao_valida")
      a.push("tres_soldados_em_contexto_de_reversao");
    if (ind.contextoTrio === "continuacao")
      a.push("tres_soldados_em_contexto_de_continuacao");
    // Exaustao exige evidencia de enfraquecimento, nunca so a posicao
    // do preco no range.
    if (ind.contextoTrio === "exaustao_possivel")
      a.push("tres_soldados_com_sinais_de_exaustao");
  }

  // --- confluencia: so quando varios elementos apontam junto ---
  const temHL = (ind.estruturaEventos || []).some((e) => e.includes("HL"));
  const pullbackBullish =
    ind.estruturaTendencia === "alta" &&
    ind.diPlus > ind.diMinus &&
    vol &&
    vol.tendencia === "decrescente" &&
    (temHL || (ind.divergencias || []).some((d) => d.tipo.startsWith("bullish")));
  if (pullbackBullish) a.push("confluencia_pullback_bullish");

  return a;
}


// ------------------------------------------------------------
// Maquina de estados de rompimento / reteste (persistida)
//
// Um registro por par + timeframe + nivel. Avaliada sempre sobre a
// ULTIMA VELA FECHADA, nunca sobre a vela em formacao — o estado nao
// pode oscilar dentro do dia.
//
// Estados: rompimento_candidato -> rompido -> em_reteste
//          -> reteste_confirmado -> rompimento_falhou -> recuperado
//
// DUAS SEVERIDADES, DOIS NOMES. "rompimento_candidato" usa o criterio
// sensivel (ponto medio do corpo alem do nivel) e serve apenas para
// armar a maquina, de modo que um reteste no candle seguinte nao seja
// perdido. "rompido" so e' atribuido quando o criterio RIGOROSO —
// o mesmo de rompimento_confirmado em alertas_tecnicos, corpo inteiro
// alem do nivel — for satisfeito. Assim o relatorio nunca diz
// "sem rompimento confirmado" e "estado: rompido" ao mesmo tempo.
// ------------------------------------------------------------

const RETEST_TOLERANCE_PCT = 0.5; // largura da zona em torno do nivel
const RETEST_RESET_DISTANCE_PCT = 3; // afastamento que encerra o ciclo
const HISTORICO_MAX = 5;

export function chaveNivel(parKey, tfKey, nivel) {
  return `${parKey}|${tfKey}|${nivel}`;
}

// Devolve o novo registro (ou null para descartar).
export function atualizarEstadoNivel(anterior, ctx) {
  const { nivel, direcao, vela, tolPct, resetPct, maxCandles, segundos } = ctx;
  const tol = Math.abs(nivel) * (tolPct / 100);
  const alta = direcao === "alta";

  const acima = vela.close > nivel + tol;
  const abaixo = vela.close < nivel - tol;
  const naZona = !acima && !abaixo;
  const penetrou = alta ? vela.low < nivel : vela.high > nivel;

  // lado "valido" = lado para onde o rompimento apontou
  const ladoValido = alta ? acima : abaixo;
  const ladoContrario = alta ? abaixo : acima;

  const corpoBaixo = Math.min(vela.open, vela.close);
  const corpoAlto = Math.max(vela.open, vela.close);
  const meioCorpo = (vela.open + vela.close) / 2;

  // Criterio RIGOROSO: corpo inteiro alem do nivel. Identico ao usado
  // por rompimento_confirmado em alertas_tecnicos.
  const rompimentoRigoroso = alta
    ? vela.close > nivel && corpoBaixo > nivel
    : vela.close < nivel && corpoAlto < nivel;

  // Criterio SENSIVEL: ponto medio do corpo alem do nivel. So arma a
  // maquina — nunca produz o rotulo "rompido" sozinho.
  const rompimentoCandidato = alta
    ? vela.close > nivel && meioCorpo > nivel
    : vela.close < nivel && meioCorpo < nivel;

  if (!anterior) {
    if (!rompimentoCandidato) return null;
    return {
      estado: rompimentoRigoroso ? "rompido" : "rompimento_candidato",
      direcao,
      precoRompimento: vela.close,
      dataRompimento: vela.time,
      ultimoContato: vela.time,
      atualizado: vela.time,
      historico: [],
    };
  }

  const e = { ...anterior, historico: [...(anterior.historico || [])] };
  if (e.estado === "arquivado") return e;

  // descarte operacional por inatividade
  const velasSemContato = (vela.time - (e.ultimoContato || e.dataRompimento)) / segundos;
  if (velasSemContato > maxCandles) {
    if (!e.historico.length) return null;
    return { estado: "arquivado", historico: e.historico };
  }

  e.atualizado = vela.time;
  if (naZona || penetrou) e.ultimoContato = vela.time;

  const anota = (novo) => {
    if (e.estado !== novo) {
      e.historico.push(`${novo}@${fmtDia(vela.time)}`);
      if (e.historico.length > HISTORICO_MAX) e.historico.shift();
    }
    e.estado = novo;
  };

  switch (e.estado) {
    // Estagio preliminar: promove se o criterio rigoroso aparecer, mas
    // ja aceita evoluir para reteste — um reteste bem-sucedido e'
    // confirmacao estrutural por si mesmo.
    case "rompimento_candidato":
      // Os rotulos de reteste sao mais especificos que a promocao e
      // vem primeiro: uma vela que volta ao nivel conta como reteste,
      // nao como simples confirmacao do rompimento.
      if (ladoContrario) anota("rompimento_falhou");
      else if (naZona) anota("em_reteste");
      else if (ladoValido && penetrou) anota("reteste_confirmado");
      else if (rompimentoRigoroso) anota("rompido");
      break;
    case "rompido":
    case "reteste_confirmado":
    case "recuperado":
      if (ladoContrario) anota("rompimento_falhou");
      else if (naZona) anota("em_reteste");
      else if (ladoValido && penetrou) anota("reteste_confirmado");
      break;
    case "em_reteste":
      if (ladoContrario) anota("rompimento_falhou");
      else if (ladoValido) anota("reteste_confirmado");
      break;
    case "rompimento_falhou":
      if (ladoValido) anota("recuperado");
      break;
  }

  // ciclo encerrado por afastamento: volta ao estado operacional de
  // rompido, sem apagar o historico do que ja aconteceu.
  const distPct = (Math.abs(vela.close - nivel) / Math.abs(nivel)) * 100;
  if (
    distPct > resetPct &&
    (e.estado === "reteste_confirmado" || e.estado === "recuperado")
  ) {
    e.estado = "rompido";
    e.afastado = true;
  } else if (distPct <= resetPct) {
    e.afastado = false;
  }

  return e;
}

function niveisDoPar(cfg) {
  const out = [];
  const nv = cfg.niveis;
  if (nv.resistencia !== null && nv.resistencia !== undefined)
    out.push({ nivel: nv.resistencia, direcao: "alta", label: nv.resistenciaLabel });
  if (nv.suporte !== null && nv.suporte !== undefined)
    out.push({ nivel: nv.suporte, direcao: "baixa", label: nv.suporteLabel });
  return out;
}

// ------------------------------------------------------------
// Volume parcial: fracao do periodo ja decorrida
// ------------------------------------------------------------

const FRACAO_INCONCLUSIVA = 0.25;

function fracaoPeriodo(live, segundos, agora = Math.floor(Date.now() / 1000)) {
  const f = (agora - live.time) / segundos;
  if (!isFinite(f)) return null;
  return Math.max(0, Math.min(1, f));
}

// Comparacao semanal justa: soma os dias JA FECHADOS da semana atual e
// compara com a soma dos mesmos N primeiros dias das semanas anteriores.
// Nao e' projecao — sao dias completos contra dias completos.
function volumeSemanaEquivalente(dadosSemanal, dadosDiario, semanasAtras = 8) {
  if (!dadosDiario || !dadosDiario.times || !dadosDiario.volumes) return null;
  const inicioSemana = dadosSemanal.live.time;
  const SEMANA = 604800;

  const diasAtuais = [];
  for (let i = 0; i < dadosDiario.times.length; i++) {
    const t = dadosDiario.times[i];
    // limita a janela a UMA semana: protege contra desalinhamento entre
    // a grade diaria e a semanal devolvidas pela Kraken.
    if (t >= inicioSemana && t < inicioSemana + SEMANA)
      diasAtuais.push(dadosDiario.volumes[i]);
  }
  const k = diasAtuais.length;
  if (k < 1) return null;
  const somaAtual = diasAtuais.reduce((a, b) => a + b, 0);

  const inicios = dadosSemanal.times.slice(-semanasAtras);
  const somas = [];
  for (const ini of inicios) {
    const dias = [];
    for (let i = 0; i < dadosDiario.times.length; i++) {
      const t = dadosDiario.times[i];
      if (t >= ini && t < ini + SEMANA) dias.push(dadosDiario.volumes[i]);
    }
    if (dias.length >= k) somas.push(dias.slice(0, k).reduce((a, b) => a + b, 0));
  }
  if (!somas.length) return null;
  const media = somas.reduce((a, b) => a + b, 0) / somas.length;
  return {
    dias: k,
    somaAtual,
    mediaEquivalente: media,
    vsPct: media === 0 ? null : ((somaAtual - media) / media) * 100,
    semanasComparadas: somas.length,
  };
}

// ------------------------------------------------------------
// Metricas normalizadas de vela (reaproveitam anatomia)
// ------------------------------------------------------------

function metricasVela(v) {
  if (!v || !(v.amplitude > 0)) return null;
  return {
    corpoPctRange: (v.corpo / v.amplitude) * 100,
    sombraSupPctRange: (v.sombraSup / v.amplitude) * 100,
    sombraInfPctRange: (v.sombraInf / v.amplitude) * 100,
    sombraSupVsCorpo: v.corpo > 0 ? v.sombraSup / v.corpo : null,
    sombraInfVsCorpo: v.corpo > 0 ? v.sombraInf / v.corpo : null,
  };
}


// ------------------------------------------------------------
// Sinteses descritivas
//
// Estes quatro campos NAO produzem sinal novo: apenas reunem, num
// lugar so, itens que ja aparecem em outros campos do relatorio.
// Sao descritivos, nunca prescritivos — nao dizem comprar nem vender.
// ------------------------------------------------------------

function sinteses(ctx) {
  const {
    alertas,
    estrutura,
    estruturaEventos,
    divergencias,
    vol,
    enfraquecimento,
    fraqueza,
    rsiFech,
    rsiAnt,
    diPlus,
    diMinus,
    estadosNivel,
  } = ctx;

  const tem = (p) => alertas.some((x) => x.startsWith(p));
  const entrada = [];
  const pullback = [];
  const riscos = [];
  const deterioracao = [];

  // --- confluencia de entrada ---
  if (tem("rompimento_confirmado")) entrada.push("rompimento_confirmado_por_fechamento");
  if (estadosNivel.includes("reteste_confirmado")) entrada.push("reteste_confirmado");
  if (alertas.includes("rompimento_com_volume_acima_da_media"))
    entrada.push("volume_acima_da_media_no_rompimento");
  if (estrutura.tendencia === "alta") entrada.push("estrutura_de_alta_preservada");
  if (diPlus !== null && diMinus !== null && diPlus > diMinus)
    entrada.push("di_plus_dominante");

  // --- confluencia de pullback ---
  if (estrutura.tendencia === "alta") pullback.push("tendencia_hh_hl_preservada");
  if (estadosNivel.includes("em_reteste")) pullback.push("em_reteste_de_nivel");
  if (estruturaEventos.includes("novo_HL_apos_fundo_mais_baixo"))
    pullback.push("novo_HL_formado");
  if (rsiFech !== null && rsiAnt !== null && rsiFech < rsiAnt && rsiFech > 40)
    pullback.push("rsi_esfriando");
  if (diPlus !== null && diMinus !== null && diPlus > diMinus)
    pullback.push("di_plus_ainda_dominante");
  if (vol && vol.tendencia === "decrescente") pullback.push("volume_decrescente_na_correcao");
  if (divergencias.some((d) => d.tipo.startsWith("bullish")))
    pullback.push("divergencia_bullish_confirmada");

  // --- riscos tecnicos ---
  for (const e of enfraquecimento) riscos.push(e);
  if (fraqueza.includes("sombras_superiores_crescentes"))
    riscos.push("sombras_superiores_crescentes");
  if (divergencias.some((d) => d.tipo.startsWith("bearish")))
    riscos.push("divergencia_bearish_confirmada");
  if (tem("toque_suporte") || tem("perda_suporte")) riscos.push("suporte_sob_pressao");
  if (alertas.includes("queda_com_expansao_de_volume"))
    riscos.push("volume_expandindo_na_queda");
  if (estadosNivel.includes("em_reteste")) riscos.push("nivel_em_teste");

  // --- deterioracao de tendencia (so o estrutural) ---
  if (estruturaEventos.includes("perda_estrutura_alta_novo_LL"))
    deterioracao.push("perda_estrutura_alta_novo_LL");
  if (estrutura.tendencia === "baixa") deterioracao.push("estrutura_de_baixa");
  if (estadosNivel.includes("rompimento_falhou")) deterioracao.push("rompimento_falhou");
  if (tem("perda_suporte_confirmada")) deterioracao.push("perda_de_suporte_confirmada");
  if (
    diPlus !== null &&
    diMinus !== null &&
    diMinus > diPlus &&
    estrutura.tendencia !== "alta"
  )
    deterioracao.push("di_minus_dominante_com_estrutura_nao_altista");

  const j = (arr) => (arr.length ? arr.join(", ") : "nenhuma");
  return {
    entrada: j(entrada),
    pullback: j(pullback),
    riscos: riscos.length ? riscos.join(", ") : "nenhum",
    deterioracao: deterioracao.length ? deterioracao.join(", ") : "nenhuma",
  };
}


// ------------------------------------------------------------
// Endpoint estatico JSON
//
// Construido a partir do TEXTO ja gerado, e nao recalculando nada.
// Assim e' impossivel o JSON divergir da pagina: sao a mesma fonte.
// Nenhum indicador novo, nenhum campo renomeado.
// ------------------------------------------------------------

// Campos cujo valor e' uma lista separada por virgula.
const CAMPOS_LISTA = new Set([
  "alertas_tecnicos",
  "padrao_candles",
  "padrao_em_formacao",
  "padroes_enfraquecimento",
  "estrutura_eventos",
  "divergencia_rsi",
  "divergencia_rsi_provisoria",
  "niveis_mudancas_nesta_vela",
  "confluencia_entrada",
  "confluencia_pullback",
  "riscos_tecnicos",
  "deterioracao_tendencia",
  "padrao_trio_evidencias_fraqueza",
]);

const VAZIOS = new Set(["nenhum", "nenhuma", "nenhuma_mudanca", "--"]);

function valorJSON(campo, bruto) {
  const v = bruto.trim();
  if (v === "--") return null;
  if (CAMPOS_LISTA.has(campo)) {
    if (VAZIOS.has(v)) return [];
    return v.split(",").map((x) => x.trim()).filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export function relatorioParaJSON(texto) {
  const out = {
    cabecalho: {},
    diario: {},
    semanal: {},
    gatilhos_ativos: [],
  };
  let tfAtual = null;
  let parAtual = null;

  for (const linhaBruta of texto.split("\n")) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith("#")) continue;

    if (linha.startsWith("==========")) {
      tfAtual = /SEMANAL/.test(linha) ? "semanal" : "diario";
      parAtual = null;
      continue;
    }

    if (linha === "fim do relatorio") continue;

    if (linha.startsWith("GATILHOS ATIVOS:")) {
      const v = linha.slice("GATILHOS ATIVOS:".length).trim();
      out.gatilhos_ativos = VAZIOS.has(v)
        ? []
        : v.split(",").map((x) => x.trim()).filter(Boolean);
      continue;
    }

    if (linha === "XMR/USD" || linha === "XMR/BTC") {
      parAtual = linha;
      if (tfAtual) out[tfAtual][parAtual] = {};
      continue;
    }

    if (linha.startsWith("FALHA:")) {
      const msg = linha.slice("FALHA:".length).trim();
      if (tfAtual && parAtual) out[tfAtual][parAtual].falha = msg;
      continue;
    }

    const sep = linha.indexOf(": ");
    if (sep === -1) continue;
    const campo = linha.slice(0, sep).trim();
    const valor = valorJSON(campo, linha.slice(sep + 2));

    if (tfAtual && parAtual) out[tfAtual][parAtual][campo] = valor;
    else out.cabecalho[campo] = valor;
  }

  out.timestamp = out.cabecalho.timestamp || null;
  return out;
}

// ------------------------------------------------------------
// Bloco de texto por par
// ------------------------------------------------------------

function descrevePivos(idxs, precos, times, dec) {
  if (!idxs.length) return "nenhum";
  return idxs
    .slice(-3)
    .map((p) => `${fmtDia(times[p])}=${num(precos[p], dec)}`)
    .join(" ");
}

function detalheDiv(x, times, dec, timeViva) {
  const dataAnt = fmtDia(times[x.idxAnterior]);
  const dataAtual =
    x.idxAtual < times.length ? fmtDia(times[x.idxAtual]) : fmtDia(timeViva);
  return (
    `tipo=${x.tipo} lado=${x.lado} ` +
    `status=${x.confirmada ? "confirmada" : "PROVISORIA"} ` +
    `pivo_anterior=${dataAnt} preco_anterior=${num(x.precoAnterior, dec)} ` +
    `rsi_anterior=${num(x.rsiAnterior, 2)} ` +
    `pivo_atual=${dataAtual} preco_atual=${num(x.precoAtual, dec)} ` +
    `rsi_atual=${num(x.rsiAtual, 2)}`
  );
}

function readPair(cfg, d, tf, opts = {}) {
  const estadoAnt = opts.estadoNiveis || {};
  const estadoNovo = {};
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
  const medCorpo = medianaCorpos(opens, closes, 20);
  const padroes = detectarPadroes(ult, medCorpo);
  const formacao = padraoEmFormacao(ult, live, medCorpo);


  // --- pivos, estrutura, divergencias e volume (SO velas fechadas) ---
  const pivos = acharPivos(highs, lows);
  const estrutura = classificarEstrutura(highs, lows, pivos);
  const estruturaEventos = mudancaEstrutura(highs, lows, pivos);
  const divergencias = detectarDivergencias(highs, lows, rsi, pivos);
  const divProvisorias = divergenciaProvisoria(
    highs,
    lows,
    rsi,
    rsiP[k],
    pivos,
    live
  );
  const vol = analisarVolume(d.volumes || [], live.volume);

  // contexto do trio: o de velas fechadas comeca em closes.length-3,
  // entao a referencia e' a vela imediatamente anterior a ele.
  const ctxFechado = contextoAntesDoTrio(closes, closes.length - 4);
  const ctxFormacao = contextoAntesDoTrio(closes, closes.length - 3);
  const enfraquecimento = detectarEnfraquecimento(ult);
  const diagSoldados = diagnosticoSoldados(ult, medCorpo);

  const fraqueza = evidenciasFraqueza(
    ult,
    enfraquecimento,
    divergencias,
    estruturaEventos
  );

  let ctxSoldados = "nao_aplicavel";
  let ctxUsado = ctxFechado;
  if (padroes.includes("tres_soldados_brancos"))
    ctxSoldados = classificarContextoSoldados(ctxFechado, fraqueza);
  else if (padroes.includes("tres_corvos_negros"))
    ctxSoldados = classificarContextoCorvosComFraqueza(ctxFechado, fraqueza);
  else if (formacao.includes("possiveis_tres_soldados_brancos")) {
    ctxUsado = ctxFormacao;
    ctxSoldados = classificarContextoSoldados(ctxFormacao, fraqueza);
  } else if (formacao.includes("possiveis_tres_corvos_negros")) {
    ctxUsado = ctxFormacao;
    ctxSoldados = classificarContextoCorvosComFraqueza(ctxFormacao, fraqueza);
  }
  const confEstrutural = confirmacaoEstrutural(ctxUsado, estrutura.tendencia);

  // ---- maquina de estados dos niveis (sobre a ULTIMA VELA FECHADA) ----
  const velaFechada = {
    open: opens[i],
    high: highs[i],
    low: lows[i],
    close: closes[i],
    time: times[i],
  };
  const mudancasNivel = [];
  const linhasNivel = [];
  for (const nv of niveisDoPar(cfg)) {
    const chave = chaveNivel(cfg.key, tf.key, nv.nivel);
    const antes = estadoAnt[chave] || null;
    const depois = atualizarEstadoNivel(antes, {
      nivel: nv.nivel,
      direcao: nv.direcao,
      vela: velaFechada,
      tolPct: RETEST_TOLERANCE_PCT,
      resetPct: RETEST_RESET_DISTANCE_PCT,
      maxCandles: tf.retestMaxCandles,
      segundos: tf.segundos,
    });
    if (depois) estadoNovo[chave] = depois;
    if (depois && antes && depois.estado !== antes.estado)
      mudancasNivel.push(`${depois.estado}_${nv.label}`);
    if (depois && !antes && depois.estado === "rompido")
      mudancasNivel.push(`rompido_${nv.label}`);

    linhasNivel.push(
      `nivel_${nv.label}_estado: ${depois ? depois.estado : "sem_registro"}`
    );
    if (depois && depois.estado !== "arquivado") {
      linhasNivel.push(`nivel_${nv.label}_direcao: ${depois.direcao}`);
      linhasNivel.push(
        `nivel_${nv.label}_preco_rompimento: ${num(depois.precoRompimento, D)}`
      );
      linhasNivel.push(
        `nivel_${nv.label}_rompeu_em: ${fmtDia(depois.dataRompimento)}`
      );
      linhasNivel.push(
        `nivel_${nv.label}_ultimo_contato: ${fmtDia(depois.ultimoContato)}`
      );
      linhasNivel.push(`nivel_${nv.label}_afastado: ${depois.afastado ? "sim" : "nao"}`);
    }
    linhasNivel.push(
      `nivel_${nv.label}_historico: ${
        depois && depois.historico && depois.historico.length
          ? depois.historico.join(" ")
          : "nenhum"
      }`
    );
  }

  // ---- volume parcial ----
  const fracao = fracaoPeriodo(live, tf.segundos);
  const parcial = fracao !== null && fracao < 0.98;
  const inconclusivo = fracao !== null && fracao < FRACAO_INCONCLUSIVA;
  const volSemana =
    tf.key === "semanal" ? volumeSemanaEquivalente(d, opts.dadosDiario) : null;

  // ---- metricas normalizadas das velas ----
  const mFechada = metricasVela(ult[0]);
  const mViva = metricasVela(anatomia(live.open, live.high, live.low, live.close));

  // --- alertas tecnicos (linha nova) ---
  const alertas = alertasTecnicos(cfg, d, {
    rsi: rsi[i],
    adx: adx[i],
    adxAnt: adx[j],
    diPlus: plusDI[i],
    diMinus: minusDI[i],
    crossUp,
    crossDown,
    divergencias,
    estruturaEventos,
    estruturaTendencia: estrutura.tendencia,
    volume: vol,
    enfraquecimento,
    padroes,
    contextoTrio: ctxSoldados,
    mudancasNivel,
    volumeInconclusivo: inconclusivo,
  });

  const estadosNivel = Object.values(estadoNovo).map((x) => x.estado);
  const sint = sinteses({
    alertas,
    estrutura,
    estruturaEventos,
    divergencias,
    vol,
    enfraquecimento,
    fraqueza,
    rsiFech: rsi[i],
    rsiAnt: rsi[j],
    diPlus: plusDI[i],
    diMinus: minusDI[i],
    estadosNivel,
  });

  const emaAtual = ema[i];
  const varAbertura = ((live.close - live.open) / live.open) * 100;
  const distEma =
    emaAtual === null ? null : ((live.close - emaAtual) / emaAtual) * 100;

  const L = [];
  L.push(cfg.label);
  L.push(`timeframe: ${tf.key}`);
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
  L.push(`# principais: calculados SOMENTE com velas ${tf.key === "semanal" ? "semanais " : ""}fechadas`);
  L.push(`rsi14_fechado: ${num(rsi[i], 2)}`);
  L.push(`di_plus14_fechado: ${num(plusDI[i], 2)}`);
  L.push(`di_minus14_fechado: ${num(minusDI[i], 2)}`);
  L.push(`adx14_fechado: ${num(adx[i], 2)}`);
  L.push(`ultimo_fechamento_data: ${fmtDia(times[i])}`);
  L.push(`ultimo_fechamento_close: ${num(closes[i], D)}`);
  L.push("");
  L.push("# PROVISORIOS: incluem a vela em formacao e PODEM MUDAR ate o");
  L.push(`# fechamento ${tf.key}. NAO sao a referencia principal.`);
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
        `sombra_inf=${num(v.sombraInf, D)} volume=${num(v.volume, 4)}`
    );
  });
  L.push("");
  // ---- estado dos niveis (rompimento / reteste) ----
  L.push("");
  linhasNivel.forEach((x) => L.push(x));
  L.push(
    `niveis_mudancas_nesta_vela: ${mudancasNivel.length ? mudancasNivel.join(", ") : "nenhuma"}`
  );

  // ---- volume ----
  L.push("");
  L.push(`fracao_periodo_decorrida: ${fracao === null ? "--" : fracao.toFixed(3)}`);
  L.push(`volume_parcial: ${parcial ? "sim" : "nao"}`);
  L.push(`volume_atual: ${num(vol.atual, 4)}`);
  L.push(`volume_ultima_fechada: ${num(vol.ultimaFechada, 4)}`);
  L.push(`volume_media${vol.periodoMedia || VOL_MEDIA}: ${num(vol.media, 4)}`);
  L.push(`volume_vs_media_pct: ${num(vol.vsMediaPct, 2)}`);
  L.push(
    `volume_classificacao: ${
      inconclusivo ? "inconclusivo_periodo_inicial" : vol.classificacao
    }`
  );
  L.push(`volume_tendencia_3_fechadas: ${vol.tendencia}`);
  L.push(`trades_vela_atual: ${num(live.trades, 0)}`);
  if (volSemana) {
    L.push(`volume_semana_dias_fechados: ${volSemana.dias}`);
    L.push(`volume_semana_soma_dias_fechados: ${num(volSemana.somaAtual, 4)}`);
    L.push(
      `volume_semanas_anteriores_mesmos_dias_media: ${num(volSemana.mediaEquivalente, 4)}`
    );
    L.push(`volume_semana_vs_equivalente_pct: ${num(volSemana.vsPct, 2)}`);
    L.push(`volume_semana_semanas_comparadas: ${volSemana.semanasComparadas}`);
  }

  // ---- estrutura de mercado ----
  L.push("");
  L.push(`estrutura_preco: ${estrutura.rotulo}`);
  L.push(`estrutura_tendencia: ${estrutura.tendencia}`);
  L.push(`estrutura_ultimo_topo: ${estrutura.topo || "--"}`);
  L.push(`estrutura_ultimo_fundo: ${estrutura.fundo || "--"}`);
  L.push(
    `estrutura_eventos: ${estruturaEventos.length ? estruturaEventos.join(", ") : "nenhum"}`
  );
  L.push(`pivos_topos_recentes: ${descrevePivos(pivos.altos, highs, times, D)}`);
  L.push(`pivos_fundos_recentes: ${descrevePivos(pivos.baixos, lows, times, D)}`);

  // ---- divergencias de RSI ----
  L.push("");
  L.push(
    `divergencia_rsi: ${
      divergencias.length
        ? divergencias.map((x) => `${x.tipo}_confirmada`).join(", ")
        : "nenhuma"
    }`
  );
  divergencias.forEach((x, idx) => {
    L.push(`divergencia_rsi_detalhe_${idx + 1}: ${detalheDiv(x, times, D)}`);
  });
  L.push(
    `divergencia_rsi_provisoria: ${
      divProvisorias.length
        ? divProvisorias.map((x) => `${x.tipo}_PROVISORIA`).join(", ")
        : "nenhuma"
    }`
  );
  divProvisorias.forEach((x, idx) => {
    L.push(
      `divergencia_rsi_provisoria_detalhe_${idx + 1}: ${detalheDiv(x, times, D, live.time)}`
    );
  });

  L.push("");
  if (mFechada) {
    L.push(`corpo_pct_range: ${num(mFechada.corpoPctRange, 2)}`);
    L.push(`sombra_sup_pct_range: ${num(mFechada.sombraSupPctRange, 2)}`);
    L.push(`sombra_inf_pct_range: ${num(mFechada.sombraInfPctRange, 2)}`);
    L.push(`sombra_sup_vs_corpo: ${num(mFechada.sombraSupVsCorpo, 2)}`);
    L.push(`sombra_inf_vs_corpo: ${num(mFechada.sombraInfVsCorpo, 2)}`);
  }
  if (mViva) {
    L.push(`candle_atual_corpo_pct_range: ${num(mViva.corpoPctRange, 2)}`);
    L.push(`candle_atual_sombra_sup_pct_range: ${num(mViva.sombraSupPctRange, 2)}`);
    L.push(`candle_atual_sombra_inf_pct_range: ${num(mViva.sombraInfPctRange, 2)}`);
    L.push(`candle_atual_sombra_sup_vs_corpo: ${num(mViva.sombraSupVsCorpo, 2)}`);
    L.push(`candle_atual_sombra_inf_vs_corpo: ${num(mViva.sombraInfVsCorpo, 2)}`);
  }

  L.push("");
  L.push(`${tf.campoEventos}: ${linhaEventos}`);
  L.push(`mediana_corpo_20: ${num(medCorpo, Math.max(D, 6))}`);
  L.push(`contexto_antes_do_trio: ${ctxFechado}`);
  L.push(`padrao_trio_contexto: ${ctxSoldados}`);
  L.push(`padrao_trio_confirmacao_estrutural: ${confEstrutural}`);
  L.push(
    `padrao_trio_evidencias_fraqueza: ${fraqueza.length ? fraqueza.join(", ") : "nenhuma"}`
  );
  L.push(
    `padroes_enfraquecimento: ${
      enfraquecimento.length ? enfraquecimento.join(", ") : "nenhum"
    }`
  );
  L.push(`tres_soldados_diagnostico: ${diagSoldados}`);
  L.push(`padrao_candles: ${padroes.length ? padroes.join(", ") : "nenhum"}`);
  L.push(
    `padrao_em_formacao: ${formacao.length ? formacao.join(", ") : "nenhum"}`
  );
  L.push(`alertas_tecnicos: ${alertas.length ? alertas.join(", ") : "nenhum"}`);
  L.push("");
  L.push(`confluencia_entrada: ${sint.entrada}`);
  L.push(`confluencia_pullback: ${sint.pullback}`);
  L.push(`riscos_tecnicos: ${sint.riscos}`);
  L.push(`deterioracao_tendencia: ${sint.deterioracao}`);

  return { texto: L.join("\n"), estadoNiveis: estadoNovo };
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

export async function build(fetchImpl = fetch, estadoAnterior = {}) {
  const blocks = [];
  const dados = {};
  const estadoNiveis = {};
  const estadoAnt = (estadoAnterior && estadoAnterior.niveis) || {};

  blocks.push(`timestamp: ${fmtUTC(Math.floor(Date.now() / 1000))}`);
  blocks.push(`fonte: Kraken OHLC — interval=1440 (diario) e interval=10080 (semanal)`);
  blocks.push(`indicadores: RSI(14) e DMI/ADX(14) por Wilder/RMA, EMA(89) exponencial`);
  blocks.push(`nota: campos *_fechado usam apenas velas fechadas; *_provisorio inclui a vela em formacao`);
  blocks.push(`nota: a linha "eventos:" existe so no bloco diario; no semanal ela se chama "eventos_semanal:"`);
  blocks.push("");

  for (const tf of TIMEFRAMES) {
    dados[tf.key] = {};
    blocks.push(`========== ${tf.titulo} ==========`);
    blocks.push("");
    for (const cfg of PAIRS) {
      try {
        const res = await fetchImpl(urlKraken(cfg, tf), {
          headers: { "User-Agent": "xmr-monitor/1.0" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseKraken(await res.json());
        dados[tf.key][cfg.key] = parsed;
        const r = readPair(cfg, parsed, tf, {
          estadoNiveis: estadoAnt,
          dadosDiario: (dados.diario || {})[cfg.key],
        });
        blocks.push(r.texto);
        Object.assign(estadoNiveis, r.estadoNiveis || {});
      } catch (err) {
        blocks.push(`${cfg.label}\ntimeframe: ${tf.key}\nFALHA: ${err.message}`);
        // A consulta falhou: sem vela nova, nao ha o que avaliar. Copia
        // os estados anteriores DESTE par/timeframe para o novo estado,
        // senao uma indisponibilidade momentanea da Kraken apagaria a
        // memoria de rompimento/reteste. O prefixo garante que so estes
        // sao restaurados — estados descartados numa execucao bem
        // sucedida continuam podendo sumir normalmente.
        const prefixo = `${cfg.key}|${tf.key}|`;
        for (const [chave, valor] of Object.entries(estadoAnt)) {
          if (chave.startsWith(prefixo)) estadoNiveis[chave] = valor;
        }
      }
      blocks.push("");
    }
  }

  // Gatilhos do alerta continuam olhando SOMENTE o diario.
  const gatilhos = avaliarGatilhos(dados.diario || {});
  blocks.push(
    gatilhos.length
      ? "GATILHOS ATIVOS: " + gatilhos.map((g) => g.id).join(", ")
      : "GATILHOS ATIVOS: nenhum"
  );
  blocks.push("");
  blocks.push("fim do relatorio");
  return { texto: blocks.join("\n"), gatilhos, estadoNiveis };
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
  let estadoPrev = {};
  try {
    estadoPrev = JSON.parse(readFileSync("docs/estado.json", "utf8"));
  } catch {
    estadoPrev = {};
  }
  const anteriores = estadoPrev.ativos || [];

  const { texto, gatilhos, estadoNiveis } = await build(fetch, estadoPrev);
  mkdirSync("docs", { recursive: true });
  const ativos = gatilhos.map((g) => g.id);
  const novos = gatilhos.filter((g) => !anteriores.includes(g.id));

  writeFileSync("docs/index.html", toHTML(texto));
  writeFileSync("docs/index.txt", texto + "\n");
  writeFileSync(
    "docs/relatorio.json",
    JSON.stringify(relatorioParaJSON(texto), null, 2) + "\n"
  );
  writeFileSync("docs/.nojekyll", "");
  writeFileSync(
    "docs/estado.json",
    JSON.stringify(
      { ativos, em: new Date().toISOString(), niveis: estadoNiveis },
      null,
      2
    ) + "\n"
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
