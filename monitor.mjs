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
    // A automacao externa le a linha "eventos:" do bloco diario.
    // Por isso o semanal usa um nome diferente, para nunca colidir.
    campoEventos: "eventos",
  },
  {
    key: "semanal",
    titulo: "GRAFICO SEMANAL",
    interval: 10080,
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

  // --- volume como CONFIRMACAO, nunca sozinho ---
  const vol = ind.volume;
  const houveRompimento = a.some((x) => x.startsWith("rompimento_"));
  const houvePerda = a.some((x) => x.startsWith("perda_suporte_") || x.startsWith("toque_suporte_"));
  if (vol && vol.vsMediaPct !== null) {
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

function readPair(cfg, d, tf) {
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
  // ---- volume ----
  L.push("");
  L.push(`volume_atual: ${num(vol.atual, 4)}`);
  L.push(`volume_ultima_fechada: ${num(vol.ultimaFechada, 4)}`);
  L.push(`volume_media${vol.periodoMedia || VOL_MEDIA}: ${num(vol.media, 4)}`);
  L.push(`volume_vs_media_pct: ${num(vol.vsMediaPct, 2)}`);
  L.push(`volume_classificacao: ${vol.classificacao}`);
  L.push(`volume_tendencia_3_fechadas: ${vol.tendencia}`);
  L.push(`trades_vela_atual: ${num(live.trades, 0)}`);

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
  L.push(`${tf.campoEventos}: ${linhaEventos}`);
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
        blocks.push(readPair(cfg, parsed, tf).texto);
      } catch (err) {
        blocks.push(`${cfg.label}\ntimeframe: ${tf.key}\nFALHA: ${err.message}`);
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
