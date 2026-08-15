// ============================================================
// Monitor XMR — roda no GitHub Actions, gera docs/index.html
// Sem dependencias: usa o fetch nativo do Node 20+.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";

const PERIOD = 14;

const PAIRS = [
  {
    label: "XMR/USD",
    url: "https://api.kraken.com/0/public/OHLC?pair=XMRUSD&interval=1440&assetVersion=1",
    dec: 2,
  },
  {
    label: "XMR/BTC",
    url: "https://api.kraken.com/0/public/OHLC?pair=XMRBTC&interval=1440&assetVersion=1",
    dec: 8,
  },
];

// ------------------------------------------------------------
// Indicadores (suavizacao de Wilder, igual TradingView)
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
  const live = rows[rows.length - 1];
  const closed = rows.slice(0, -1);
  return {
    live: { time: Number(live[0]), close: Number(live[4]) },
    times: closed.map((r) => Number(r[0])),
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

function num(v, dec) {
  return v === null || v === undefined || Number.isNaN(v) ? "--" : v.toFixed(dec);
}

function readPair(cfg, data) {
  const { highs, lows, closes, times, live } = data;
  const rsi = rsiSeries(closes);
  const { plusDI, minusDI, adx } = dmiSeries(highs, lows, closes);

  const i = closes.length - 1;
  const j = i - 1;

  const crossUp = plusDI[j] <= minusDI[j] && plusDI[i] > minusDI[i];
  const crossDown = plusDI[j] >= minusDI[j] && plusDI[i] < minusDI[i];
  const changePct = ((live.close - closes[i]) / closes[i]) * 100;

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

  const L = [];
  L.push(`### ${cfg.label}`);
  L.push(`preco atual (vela em formacao): ${num(live.close, cfg.dec)}`);
  L.push(
    `ultimo fechamento diario (${fmtUTC(times[i])}): ${num(closes[i], cfg.dec)}`
  );
  L.push(
    `variacao desde esse fechamento: ${changePct >= 0 ? "+" : ""}${num(changePct, 2)}%`
  );
  L.push("");
  L.push(`                 ult.fechada  anterior`);
  L.push(`RSI(14)          ${num(rsi[i], 2).padEnd(13)}${num(rsi[j], 2)}`);
  L.push(`DI+(14)          ${num(plusDI[i], 2).padEnd(13)}${num(plusDI[j], 2)}`);
  L.push(`DI-(14)          ${num(minusDI[i], 2).padEnd(13)}${num(minusDI[j], 2)}`);
  L.push(`ADX(14)          ${num(adx[i], 2).padEnd(13)}${num(adx[j], 2)}`);
  L.push("");
  L.push(
    `eventos: ${notes.length ? notes.join(" | ") : "nenhum cruzamento nesta vela"}`
  );
  return L.join("\n");
}

// ------------------------------------------------------------
// Geracao da pagina
// ------------------------------------------------------------

export async function build(fetchImpl = fetch) {
  const blocks = [];
  blocks.push(`MONITOR XMR — gerado em ${fmtUTC(Math.floor(Date.now() / 1000))}`);
  blocks.push(
    `velas diarias (1440 min) da Kraken, indicadores com periodo 14 (Wilder)`
  );
  blocks.push(`a vela em formacao NAO entra no calculo dos indicadores`);
  blocks.push("");

  for (const cfg of PAIRS) {
    try {
      const res = await fetchImpl(cfg.url, {
        headers: { "User-Agent": "xmr-monitor/1.0" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      blocks.push(readPair(cfg, parseKraken(await res.json())));
    } catch (err) {
      blocks.push(`### ${cfg.label}\nFALHA: ${err.message}`);
    }
    blocks.push("");
  }

  blocks.push("fim do relatorio");
  return blocks.join("\n");
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
  const text = await build();
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/index.html", toHTML(text));
  writeFileSync("docs/index.txt", text + "\n");
  writeFileSync("docs/.nojekyll", "");
  console.log(text);
}
