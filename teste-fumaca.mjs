// Harness de fumaca: serve series sinteticas no formato OHLC da Kraken e
// confere que o relatorio sai inteiro, sem tocar na rede.
//
// Existe porque o monitor publica sozinho de hora em hora: sem isso, um
// refactor que quebre o parse ou o calculo so apareceria em producao,
// com o relatorio ja no ar.
import {
  build, relatorioParaJSON, toHTML, PARES_TESTE, TIMEFRAMES_TESTE, dmiSeries, rsiSeries, analisarVolume, situacaoNiveis, atualizarEstadoNivel, alertasTecnicos, sinteses, acharPivos, classificarEstrutura, mudancaEstrutura, alinhamentoNiveis, registrarHistorico, entradaHistorico, assinaturaHistorico, leituraLonga, forcaTendencia,
} from "./monitor.mjs";

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

function fakeFetch({ http = null, erroKraken = null, mexerNaViva = 0 } = {}) {
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
    let rows = serieDe(par, interval);
    if (mexerNaViva) {
      // Mexe SO na ultima vela, a que esta em formacao. Tudo que ja
      // fechou continua identico entre as duas execucoes.
      rows = rows.slice();
      const viva = rows[rows.length - 1].slice();
      for (const j of [1, 2, 3, 4]) viva[j] = viva[j] * (1 + mexerNaViva);
      rows[rows.length - 1] = viva;
    }
    return {
      ok: true,
      json: async () => ({ error: [], result: { [`X${par}`]: rows, last: 0 } }),
    };
  };
}

// Bloco de UM par dentro de UMA secao do relatorio textual.
function blocoTf(texto, secao, par) {
  const sec = (texto.split("========== " + secao + " ==========")[1] || "").split("\n==========")[0];
  const i = sec.indexOf("\n" + par + "\n");
  if (i === -1) return "";
  const resto = sec.slice(i + 1);
  const prox = resto.slice(1).search(/\n[A-Z0-9]+\/[A-Z]+\n/);
  return prox === -1 ? resto : resto.slice(0, prox + 1);
}

let falhas = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FALHA") + "  " + m); if (!c) falhas++; };

console.log("== relatorio completo ==");
const r1 = await build(fakeFetch(), {});
ok(!/FALHA:/.test(r1.texto), "nenhum bloco em FALHA");
ok(!/NaN|undefined/.test(r1.texto), "sem NaN/undefined no texto");
ok(/rsi_fechado: \d/.test(r1.texto), "RSI calculado");
ok(/adx_fechado: \d/.test(r1.texto), "ADX calculado");
ok(/ema89: \d/.test(r1.texto), "EMA89 calculada");
ok(/estrutura_preco: \w/.test(r1.texto), "estrutura de pivos");
ok(/atr14: \d/.test(r1.texto) && /atr14_pct: \d/.test(r1.texto), "ATR publicado em preco e em %");
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


console.log("\n== vigilancia dos niveis manuais ==");
{
  const niveis = { faixas: [[100, 110, "faixa_100_110"], [80, 90, "faixa_80_90"]] };
  const dentro = situacaoNiveis(niveis, 105, 2);
  ok(dentro.situacao === "atual" && dentro.distanciaAtr === 0,
    `preco dentro de uma faixa e' 'atual' a 0 ATR (deu ${dentro.situacao})`);
  ok(dentro.faixa === "faixa_100_110", "aponta a faixa que contem o preco");

  const perto = situacaoNiveis(niveis, 111.5, 2); // 1.5 acima de 110 = 0,75 ATR
  ok(perto.situacao === "atual", `menos de 1 ATR fora ainda e' 'atual' (deu ${perto.situacao})`);

  const medio = situacaoNiveis(niveis, 114, 2); // 4 acima = 2 ATR
  ok(medio.situacao === "monitorar", `entre 1 e 3 ATR e' 'monitorar' (deu ${medio.situacao})`);

  // O caso real do XMR: preco 29% acima da faixa mais alta.
  const longe = situacaoNiveis(niveis, 128, 2); // 18 acima = 9 ATR
  ok(longe.situacao === "obsoleto", `mais de 3 ATR e' 'obsoleto' (deu ${longe.situacao})`);
  ok(Math.abs(longe.distanciaAtr - 9) < 1e-9, `distancia em ATR calculada (deu ${longe.distanciaAtr})`);

  // A distancia e' medida em ATR de proposito: o mesmo afastamento
  // percentual da leituras diferentes conforme a volatilidade do par.
  const volatil = situacaoNiveis(niveis, 128, 20);
  ok(volatil.situacao === "atual",
    "o mesmo afastamento num par muito mais volatil continua 'atual'");

  ok(situacaoNiveis({ faixas: [] }, 100, 2).situacao === "indefinida", "sem faixas, indefinida");
  ok(situacaoNiveis(niveis, 100, 0).situacao === "indefinida", "sem ATR, indefinida");
}

console.log("\n== afastado mede distancia, nao etapa do ciclo ==");
{
  // Nivel rompido para cima e deixado muito para tras: o bug antigo
  // publicava afastado: nao porque o estado era "rompido".
  const nivel = 100;
  const base = { nivel, direcao: "alta", tolPct: 0.5, resetPct: 3, maxCandles: 30, segundos: 86400 };
  const t0 = 1756425600;
  let e = atualizarEstadoNivel(null, { ...base, vela: { open: 101, close: 105, high: 106, low: 100.5, time: t0 } });
  ok(e && e.estado === "rompido", `rompimento reconhecido (deu ${e && e.estado})`);
  e = atualizarEstadoNivel(e, { ...base, vela: { open: 128, close: 130, high: 131, low: 127, time: t0 + 86400 } });
  ok(e.afastado === true, "nivel 30% para tras e' marcado como afastado mesmo em 'rompido'");
  e = atualizarEstadoNivel(e, { ...base, vela: { open: 101, close: 101.5, high: 102, low: 100.8, time: t0 + 2 * 86400 } });
  ok(e.afastado === false, "preco de volta perto do nivel desmarca o afastamento");
}


console.log("\n== a situacao dos niveis olha a vela FECHADA ==");
{
  // Duas execucoes identicas a nao ser pela vela EM FORMACAO. Se a
  // vigilancia usasse o preco vivo -- como usava na primeira versao --
  // a distancia mudaria. Usando o fechamento, nao pode mudar.
  const campo = (t, c) => {
    const m = t.match(new RegExp(`^${c}: (.+)$`, "m"));
    return m ? m[1] : null;
  };
  const normal = await build(fakeFetch(), {});
  const viva = await build(fakeFetch({ mexerNaViva: 0.25 }), {});

  ok(campo(viva.texto, "preco_atual") !== campo(normal.texto, "preco_atual"),
    "a vela em formacao de fato mudou de preco entre as duas execucoes");
  ok(campo(viva.texto, "ultimo_fechamento_close") === campo(normal.texto, "ultimo_fechamento_close"),
    "o ultimo fechamento continua o mesmo, como deve");
  ok(campo(viva.texto, "niveis_manuais_distancia_atr") === campo(normal.texto, "niveis_manuais_distancia_atr"),
    "a distancia ate a faixa manual NAO mudou: ela vem do fechamento");
  ok(campo(viva.texto, "niveis_manuais_situacao") === campo(normal.texto, "niveis_manuais_situacao"),
    "a situacao dos niveis tambem nao mudou");

  // A travessia da EMA89 e' o alerta mais caro do monitor: ela nao pode
  // depender da vela em formacao. A ultima assercao e' a contraprova --
  // o campo antigo em % E' do preco vivo, e por isso muda.
  ok(campo(viva.texto, "ema89_cruzamento_fechado") === campo(normal.texto, "ema89_cruzamento_fechado"),
    "o cruzamento da EMA89 NAO muda com a vela em formacao");
  ok(campo(viva.texto, "ema89_fechada_anterior") === campo(normal.texto, "ema89_fechada_anterior"),
    "a EMA89 do fechamento anterior tambem nao muda");
  ok(campo(viva.texto, "distancia_ema89_pct") !== campo(normal.texto, "distancia_ema89_pct"),
    "e o campo antigo em % continua sendo do preco vivo, como documentado");
}

console.log("\n== JSON ==");
const j = relatorioParaJSON(r1.texto, r1.zonas);
const pares = Object.keys(j.diario);
ok(pares.length > 0, `JSON tem bloco diario (${pares.join(", ")})`);
for (const p of pares) {
  ok(typeof j.diario[p].preco_atual === "number", `${p}: preco_atual numerico`);
  ok(typeof j.semanal[p].rsi_fechado === "number", `${p}: RSI semanal numerico`);
  ok(Array.isArray(j.diario[p].alertas_tecnicos), `${p}: alertas_tecnicos vira lista`);
  ok(Array.isArray(j.diario[p].niveis_manuais.faixas), `${p}: faixas manuais publicadas`);
}
ok(Array.isArray(j.gatilhos_ativos), "gatilhos_ativos vira lista");

console.log("\n== perda de suporte: corpo, nao so fechamento ==");
{
  // Caso real do XMR/USD em 2026-09-08: abriu 519,23 e fechou 499,77 com
  // suporte em 500. Fechou 0,05% abaixo, corpo inteiro em cima do nivel.
  // Saia como perda CONFIRMADA e alimentava deterioracao_tendencia; a
  // maquina de estados, que olha o corpo, dizia sem_registro. A
  // resistencia ja tinha a distincao forte/fraco; o suporte nao.
  const cfg = { niveis: { faixas: [], suporte: 500, suporteLabel: "500", resistencia: 550, resistenciaLabel: "550" } };
  const ind = {
    rsi: null, adx: null, adxAnt: null, diPlus: null, diMinus: null, crossUp: false, crossDown: false,
    divergencias: [], estruturaEventos: [], estruturaTendencia: null, volume: null,
    enfraquecimento: [], padroes: [], contextoTrio: null, mudancasNivel: [],
  };
  const vela = (open, close) => ({
    live: { close, high: Math.max(open, close), low: Math.min(open, close) },
    opens: [open], closes: [close],
  });
  const ctx = (alertas) => ({
    alertas, estrutura: { tendencia: null }, estruturaEventos: [], divergencias: [], vol: null,
    enfraquecimento: [], fraqueza: [], rsiFech: null, rsiAnt: null, diPlus: null, diMinus: null,
    estadosNivel: [],
  });

  const encostou = alertasTecnicos(cfg, vela(519.23, 499.77), ind);
  ok(encostou.includes("perda_suporte_confirmada_fraca_500"), "fechamento abaixo com corpo em cima e' perda FRACA");
  ok(!encostou.includes("perda_suporte_confirmada_500"), "e NAO e' perda confirmada");
  ok(sinteses(ctx(encostou)).deterioracao === "nenhuma", "perda fraca nao alimenta deterioracao_tendencia");
  ok(sinteses(ctx(encostou)).riscos.includes("suporte_sob_pressao"), "mas continua como risco: suporte sob pressao");

  const perdeu = alertasTecnicos(cfg, vela(498, 495), ind);
  ok(perdeu.includes("perda_suporte_confirmada_500"), "corpo inteiro abaixo e' perda confirmada");
  ok(sinteses(ctx(perdeu)).deterioracao.includes("perda_de_suporte_confirmada"), "e essa sim alimenta deterioracao");

  // A resistencia ja distinguia, mas a sintese por prefixo ignorava a
  // distincao: rompimento_confirmado_fraco_X comecava com
  // rompimento_confirmado e virava confluencia de entrada.
  const fraco = alertasTecnicos(cfg, vela(545, 552), ind);
  ok(fraco.includes("rompimento_confirmado_fraco_550"), "rompimento com corpo em baixo e' fraco");
  ok(!sinteses(ctx(fraco)).entrada.includes("rompimento_confirmado_por_fechamento"), "rompimento fraco NAO vira confluencia de entrada");
  const forte = alertasTecnicos(cfg, vela(551, 555), ind);
  ok(sinteses(ctx(forte)).entrada.includes("rompimento_confirmado_por_fechamento"), "rompimento forte continua virando");
}

console.log("\n== pagina HTML: o bloco do bot continua intacto ==");
{
  // O prompt usa a pagina como FALLBACK quando o relatorio.json nao
  // responde, e quem le procura linhas "campo: valor" no fonte. Tema,
  // cartoes e grafico sao moldura: o <pre> tem que sair com o relatorio
  // VERBATIM e sem uma tag no meio, ou o fallback quebra em silencio --
  // e so quando a fonte principal ja estiver fora do ar.
  const html = toHTML(r1.texto, relatorioParaJSON(r1.texto, r1.zonas));
  const pre = html.split("<pre>")[1].split("</pre>")[0];
  const esperado = r1.texto.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  ok(pre === esperado, "o <pre> traz o relatorio inteiro, byte a byte");
  ok(!/<[a-zA-Z\/]/.test(pre), "nenhuma tag dentro do <pre>");
  ok((pre.match(/^[a-z_0-9]+: /gm) || []).length > 50, "as linhas campo:valor continuam legiveis no fonte");
  ok(!/NaN|undefined/.test(html), "sem NaN/undefined na pagina");
  ok(/<article class="par">/.test(html), "os cartoes de par foram gerados");
  ok(html.indexOf("<pre>") > html.indexOf('<section class="pares">'),
    "o resumo vem antes do relatorio, e o relatorio fecha a pagina");

  // TEMA. O claro so redefine tokens; se alguem acrescentar um token de
  // cor no escuro e esquecer do claro, o tema claro herda uma cor de
  // fundo escuro em silencio -- e ninguem percebe ate abrir a pagina.
  const tokens = (bloco) => new Set((bloco.match(/--[a-z-]+(?=\s*:)/g) || []));
  const escuro = tokens(html.split(":root{")[1].split("}")[0]);
  const claro = tokens(html.split('html[data-tema="claro"]{')[1].split("}")[0]);
  const faltando = [...escuro].filter((t) => !claro.has(t) && t !== "--mono" && t !== "--bg-x");
  ok(escuro.size > 15, `o tema escuro define os tokens (${escuro.size})`);
  ok(faltando.length === 0, `o tema claro cobre todos os tokens do escuro${faltando.length ? ": faltam " + faltando.join(", ") : ""}`);
  // O script do topo decide o tema antes de qualquer pintura. Em vez de
  // conferir o TEXTO dele, roda o script de verdade com localStorage e
  // matchMedia falsos, nas combinacoes que importam.
  const scriptTema = html.split('<script id="tema-inicial">')[1].split("</script>")[0];
  const decidir = (salvo, soEscuro, matchMediaQuebrado) => {
    let attr = null;
    new Function("localStorage", "matchMedia", "document", scriptTema)(
      { getItem: () => salvo },
      matchMediaQuebrado
        ? () => { throw new Error("sem suporte"); }
        : () => ({ matches: soEscuro }),
      { documentElement: { setAttribute: (k, v) => { if (k === "data-tema") attr = v; } } }
    );
    return attr === "claro" ? "claro" : "noite";
  };
  ok(decidir(null, true) === "noite", "sem escolha e SO escuro -> noite");
  ok(decidir(null, false) === "claro", "sem escolha e SO claro -> claro");
  ok(decidir("noite", false) === "noite", "escolha salva 'noite' vence o SO claro");
  ok(decidir("claro", true) === "claro", "escolha salva 'claro' vence o SO escuro");
  ok(decidir(null, false, true) === "noite", "sem matchMedia, cai em noite");
  ok(/prefers-color-scheme/.test(scriptTema), "o padrao consulta o prefers-color-scheme");
  ok(!/getHours|Date\(/.test(scriptTema), "e nao decide por horario");
  ok(/id="btn-tema"/.test(html), "o botao de alternar continua na pagina");

  // ATR e EMA89 no cartao mudaram de APRESENTACAO. O que a mudanca nao
  // pode ter feito e' sumir com os campos do relatorio: o prompt decide
  // por eles (0,25 ATR na travessia semanal, 1,0 ATR na corroboracao).
  ok(/^atr14: [\d.]+$/m.test(r1.texto) && /^atr14_pct: [\d.]+$/m.test(r1.texto),
    "relatorio segue publicando atr14 e atr14_pct");
  ok(/^distancia_ema89_fechada_atr: [\d.]+$/m.test(r1.texto),
    "relatorio segue publicando a distancia da EMA89 em ATR");
  ok(!/<dt>ATR\(14\)<\/dt>/.test(html), "o cartao nao tem mais linha de ATR");
  ok(/<dt>ADX \/ DI \(28\/42\)<\/dt>/.test(html) && /<dt>ADX \/ DI \(14\/21\)<\/dt>/.test(html),
    "o cartao rotula cada timeframe com os SEUS periodos de DMI");
  // So faz sentido onde ha widget (par com cartao e grafico).
  if (/s3\.tradingview\.com\/tv\.js/.test(html))
    ok(/MAExp@tv-basicstudies[^}]*length:89/.test(html), "o widget do TradingView pede a EMA de periodo 89");
  if (/s3\.tradingview\.com\/tv\.js/.test(html)) {
    ok(/\{id:"RSI@tv-basicstudies",inputs:\{[^}]*smoothingLine:"None"/.test(html),
      "pede o RSI como objeto, com a media do RSI desligada");
    // O grafico abre no diario e troca para o semanal pelos botoes. Em
    // cada intervalo o RSI tem de bater com o do cartao daquele
    // timeframe. Derivado, nunca cravado: a tabela sai da configuracao.
    const diarioTf = TIMEFRAMES_TESTE.find((t) => t.key === "diario");
    const semanalTf = TIMEFRAMES_TESTE.find((t) => t.key === "semanal");
    ok(html.includes(
      `window.rsiPorIntervalo={"D":${diarioTf.rsi.length},"W":${semanalTf.rsi.length}}`),
      `a tabela do grafico casa D com o RSI do diario (${diarioTf.rsi.length}) ` +
      `e W com o do semanal (${semanalTf.rsi.length})`);
    ok(html.includes('{id:"RSI@tv-basicstudies",inputs:{length:rsi,'),
      "e o widget le o RSI dessa tabela, em vez de um periodo cravado");
    ok(/interval:iv,/.test(html) && /var iv=window\.intervaloGrafico,rsi=window\.rsiPorIntervalo\[iv\]/.test(html),
      "intervalo e RSI saem da mesma variavel: nao tem como um andar sem o outro");
    ok(/data-tf="D"/.test(html) && /data-tf="W"/.test(html),
      "a barra do grafico oferece os dois timeframes");
    ok(/\{id:"MAExp@tv-basicstudies",inputs:\{length:89\}\}/.test(html),
      "e a EMA do grafico usa 89, como o relatorio");
    ok(!/"RSI@tv-basicstudies"\s*[\]}]/.test(html), "e nunca como string solta, que o widget descartava");
  }

  // O script do widget e' montado por concatenacao de strings: um erro
  // de digitacao so apareceria no navegador. Entao roda de verdade, com
  // TradingView e DOM falsos, e confere o que o widget recebeu.
  if (/s3\.tradingview\.com\/tv\.js/.test(html)) {
    const scriptTv = html.split("window.rsiPorIntervalo=")[1].split("</script>")[0];
    const pedidos = [];
    const botoes = ["D", "W"].map((tf) => ({
      tf,
      pressed: tf === "D" ? "true" : "false",
      classList: { contains: (c) => c === "tv-tf" },
      getAttribute: (k) => (k === "data-tf" ? tf : null),
      setAttribute: (k, v) => { if (k === "aria-pressed") botoes.find((b) => b.tf === tf).pressed = v; },
    }));
    const doc = {
      getElementById: (id) => ({ id, innerHTML: "" }),
      querySelectorAll: () => botoes,
    };
    const TradingViewFalso = { widget: function (o) { pedidos.push(o); } };
    const janela = { TradingView: TradingViewFalso };
    // O script usa "TradingView" solto, que no navegador resolve pelo
    // objeto global; aqui entra como parametro.
    new Function("window", "document", "TradingView", "window.rsiPorIntervalo=" + scriptTv)(
      janela, doc, TradingViewFalso);

    const diaTf = TIMEFRAMES_TESTE.find((t) => t.key === "diario");
    const semTf = TIMEFRAMES_TESTE.find((t) => t.key === "semanal");
    const rsiDe = (o) => o.studies.find((e) => e.id === "RSI@tv-basicstudies").inputs.length;

    janela.desenharGraficos("dark");
    ok(pedidos.length > 0 && pedidos.every((o) => o.interval === "D"),
      "ao abrir, o widget pede o diario");
    ok(pedidos.every((o) => rsiDe(o) === diaTf.rsi.length),
      `e o RSI dele e' o do cartao diario (${diaTf.rsi.length})`);

    pedidos.length = 0;
    janela.desenharGraficos("dark", "W");
    ok(pedidos.length > 0 && pedidos.every((o) => o.interval === "W"),
      "trocando para semanal, o widget pede o semanal");
    ok(pedidos.every((o) => rsiDe(o) === semTf.rsi.length),
      `e o RSI acompanha, virando o do cartao semanal (${semTf.rsi.length})`);
    ok(botoes.find((b) => b.tf === "W").pressed === "true" &&
      botoes.find((b) => b.tf === "D").pressed === "false",
      "e a barra marca qual timeframe esta valendo");

    pedidos.length = 0;
    janela.desenharGraficos("light");
    ok(pedidos.every((o) => o.interval === "W" && rsiDe(o) === semTf.rsi.length),
      "trocar o TEMA nao devolve o grafico para o diario");
    ok(pedidos.every((o) => o.studies.some(
      (e) => e.id === "MAExp@tv-basicstudies" && e.inputs.length === 89)),
      "e a EMA89 continua nos dois intervalos, por nao ser por timeframe");
  }
  ok(!/<dt>EMA89 \(fechado\)<\/dt><dd[^>]*>[^<]*<small>[^<]*ATR</.test(html),
    "cartao nao mostra mais a distancia da EMA89 em ATR");
  ok(/<dt>EMA89 \(fechado\)<\/dt><dd[^>]*>(acima|abaixo)<small>[\d.,]+%<\/small>/.test(html),
    "cartao mostra o lado da EMA89 e a distancia em %");
  ok(/<svg class="lua"/.test(html) && /<svg class="sol"/.test(html), "os dois icones do botao estao no HTML");
  ok(/aria-label="Alternar night mode"/.test(html), "o botao sem texto mantem nome acessivel");
  ok(html.indexOf('localStorage.getItem("tema")') < html.indexOf("<body"),
    "o tema salvo e' aplicado ANTES do <body>, sem flash escuro");

  // A ordem dos blocos no relatorio segue a ordem da configuracao, e o
  // painel mostra so os pares com cartao. Par secundario continua
  // inteiro no relatorio -- deixar de ter cartao nao e' deixar de sair.
  const secDia = r1.texto.split("========== GRAFICO DIARIO ==========")[1].split("==========")[0];
  const posicoes = PARES_TESTE.map((c) => secDia.indexOf(`\n${c.label}\n`));
  ok(posicoes.every((v, i) => v >= 0 && (i === 0 || v > posicoes[i - 1])),
    `os blocos saem na ordem da configuracao: ${PARES_TESTE.map((c) => c.label).join(" -> ")}`);

  for (const c of PARES_TESTE) {
    const temCartao = !c.semCartao;
    ok(html.includes(`<h2>${c.label}</h2>`) === temCartao,
      `${c.label}: ${temCartao ? "tem" : "NAO tem"} cartao no painel`);
    ok(pre.includes(`\n${c.label}\n`), `${c.label}: sai inteiro no relatorio completo`);
    if (c.grafico)
      ok(typeof c.graficoNota === "string" && c.graficoNota.length > 20,
        `${c.label}: grafico ${c.grafico} tem nota de fonte`);
    // O grafico mora DENTRO do cartao: sem cartao nao pode sobrar
    // container, nem widget apontando para um container que nao existe.
    ok(html.includes(`id="tv-${c.key}"`) === Boolean(c.grafico && temCartao),
      `${c.label}: container do grafico ${c.grafico && temCartao ? "presente" : "ausente"}, como deve`);
  }
}


console.log("\n== DMI/ADX: periodos por timeframe ==");
{
  // Ate 2026-09-11 havia UM periodo (14) servindo de DI Length e de ADX
  // Smoothing, nos dois timeframes. Agora sao dois parametros e uma
  // configuracao por timeframe: diario 28/42 (leitura operacional de
  // swing/position), semanal 14/21 (contexto de prazo maior).

  // 1. COMPATIBILIDADE. Chamar com (14, 14) tem de reproduzir exatamente
  //    o que a versao de um parametro so produzia: e' o que garante que
  //    o refactor nao mexeu no metodo de Wilder, so nos periodos.
  const h = [], l = [], c = [];
  let p = 100;
  for (let i = 0; i < 300; i++) {
    p = p * (1 + (rnd() - 0.48) * 0.03);
    h.push(p * 1.01); l.push(p * 0.99); c.push(p);
  }
  const u = c.length - 1;
  const padrao = dmiSeries(h, l, c);
  const explicito = dmiSeries(h, l, c, 14, 14);
  ok(padrao.adx[u] === explicito.adx[u] && padrao.plusDI[u] === explicito.plusDI[u],
    "dmiSeries(14,14) reproduz exatamente o comportamento de antes");

  // 2. OS DOIS PARAMETROS SAO INDEPENDENTES. Mudar so o alisamento do ADX
  //    muda o ADX e NAO pode mexer nos DIs, que dependem so do diLen.
  const so28 = dmiSeries(h, l, c, 28, 28);
  const d2842 = dmiSeries(h, l, c, 28, 42);
  ok(so28.plusDI[u] === d2842.plusDI[u] && so28.minusDI[u] === d2842.minusDI[u],
    "adxLen nao afeta os DIs: eles dependem so do diLen");
  ok(so28.adx[u] !== d2842.adx[u], "mas afeta o ADX, como deve");
  ok(d2842.plusDI[u] !== padrao.plusDI[u], "e diLen 28 da DIs diferentes do 14");

  // 3. ADX MAIS ALISADO OSCILA MENOS -- o objetivo da mudanca.
  const varia = (s) => {
    let soma = 0, n = 0;
    for (let i = 200; i < s.length; i++)
      if (s[i] !== null && s[i - 1] !== null) { soma += Math.abs(s[i] - s[i - 1]); n++; }
    return n ? soma / n : 0;
  };
  ok(varia(d2842.adx) < varia(padrao.adx),
    "ADX com alisamento 42 varia menos de vela para vela que o de 14");

  // 4. SERIE CURTA nao quebra: sai null, que o relatorio publica como
  //    "--", nunca NaN.
  const curto = dmiSeries(h.slice(0, 40), l.slice(0, 40), c.slice(0, 40), 28, 42);
  ok(curto.adx.every((v) => v === null), "serie curta demais devolve ADX null, nao NaN");
}

console.log("\n== DMI/ADX: o relatorio declara a configuracao usada ==");
{
  const cfgDe = (t) => {
    const di = /dmi_di_length: (\d+)/.exec(t);
    const ad = /dmi_adx_smoothing: (\d+)/.exec(t);
    return di && ad ? di[1] + "/" + ad[1] : null;
  };
  const par = PARES_TESTE[0].label;
  const diaBloco = blocoTf(r1.texto, "GRAFICO DIARIO", par);
  const semBloco = blocoTf(r1.texto, "GRAFICO SEMANAL", par);
  ok(cfgDe(diaBloco) === "28/42", "bloco diario declara DMI 28/42");
  ok(cfgDe(semBloco) === "14/21", "bloco semanal declara DMI 14/21");
  ok(/indicadores:.*diario 28\/42, semanal 14\/21/.test(r1.texto),
    "o cabecalho lista os periodos de cada timeframe");
  ok(!/adx14_fechado|di_plus14_|di_minus14_/.test(r1.texto),
    "os campos perderam o '14' do nome, que virou mentira no diario");

  const adxDe = (t) => (/adx_fechado: ([\d.]+)/.exec(t) || [])[1];
  ok(adxDe(diaBloco) !== adxDe(semBloco),
    "diario e semanal publicam ADX distintos: as configuracoes nao se misturam");
}


console.log("\n== RSI: periodo por timeframe ==");
{
  // Ate 2026-09-11 o RSI usava 14 nos dois timeframes, por herdar o
  // default de PERIOD. Agora: diario 21, semanal 14. O metodo nao mudou
  // -- Wilder/RMA --, so o periodo, e rsiSeries ja aceitava o parametro:
  // eram os call sites que nao passavam.
  const c = [];
  let p = 100;
  for (let i = 0; i < 300; i++) { p = p * (1 + (rnd() - 0.48) * 0.03); c.push(p); }
  const u = c.length - 1;

  const r14 = rsiSeries(c);
  const r14x = rsiSeries(c, 14);
  ok(r14[u] === r14x[u], "rsiSeries(c, 14) reproduz exatamente o default de antes");

  const r21 = rsiSeries(c, 21);
  ok(r21[u] !== r14[u], "periodo 21 produz RSI diferente do 14");

  // O objetivo da troca: menos oscilacao vela a vela no diario.
  const varia = (s) => {
    let soma = 0, n = 0;
    for (let i = 100; i < s.length; i++)
      if (s[i] !== null && s[i - 1] !== null) { soma += Math.abs(s[i] - s[i - 1]); n++; }
    return n ? soma / n : 0;
  };
  ok(varia(r21) < varia(r14), "RSI(21) varia menos de vela para vela que o RSI(14)");

  // E a relacao que o usuario pediu para preservar: o RSI tem de
  // continuar MAIS responsivo que o DMI do mesmo timeframe.
  const dia = TIMEFRAMES_TESTE.find((t) => t.key === "diario");
  const sem = TIMEFRAMES_TESTE.find((t) => t.key === "semanal");
  ok(dia.rsi.length === 21 && dia.dmi.diLen === 28, "diario: RSI 21 contra DMI 28");
  ok(sem.rsi.length === 14 && sem.dmi.diLen === 14, "semanal: RSI 14 contra DMI 14");
  ok(dia.rsi.length < dia.dmi.adxLen && sem.rsi.length < sem.dmi.adxLen,
    "em cada timeframe o RSI e' mais curto que o alisamento do ADX");

  const curto = rsiSeries(c.slice(0, 10), 21);
  ok(curto.every((v) => v === null), "serie curta demais devolve RSI null, nao NaN");
}

console.log("\n== RSI: o relatorio declara o periodo usado ==");
{
  const par = PARES_TESTE[0].label;
  const lenDe = (t) => (/rsi_length: (\d+)/.exec(t) || [])[1];
  const diaBloco = blocoTf(r1.texto, "GRAFICO DIARIO", par);
  const semBloco = blocoTf(r1.texto, "GRAFICO SEMANAL", par);
  ok(lenDe(diaBloco) === "21", "bloco diario declara rsi_length 21");
  ok(lenDe(semBloco) === "14", "bloco semanal declara rsi_length 14");
  ok(/indicadores:.*RSI diario 21, semanal 14/.test(r1.texto),
    "o cabecalho lista o periodo de RSI de cada timeframe");
  ok(!/rsi14_fechado|rsi14_provisorio/.test(r1.texto),
    "os campos perderam o '14' do nome, que virou mentira no diario");

  const rsiDe = (t) => (/rsi_fechado: ([\d.]+)/.exec(t) || [])[1];
  ok(rsiDe(diaBloco) !== rsiDe(semBloco),
    "diario e semanal publicam RSI distintos: os periodos nao se misturam");
}

// ------------------------------------------------------------
// Estrutura de mercado: rotulos e eventos
// ------------------------------------------------------------
console.log("\n== estrutura: os quatro estados tem nomes distintos ==");
{
  // Zigue-zague com pernas longas o bastante para cada virada ser um
  // extremo local estrito, e pivos 2/2 para o teste nao depender do
  // fractal configurado por timeframe.
  const zig = (pontos, porPerna = 6) => {
    const v = [];
    for (let i = 0; i < pontos.length - 1; i++)
      for (let k = 0; k < porPerna; k++)
        v.push(pontos[i] + ((pontos[i + 1] - pontos[i]) * k) / porPerna);
    v.push(pontos[pontos.length - 1]);
    return { highs: v.map((x) => x + 0.5), lows: v.map((x) => x - 0.5) };
  };
  const rotulo = (pontos) => {
    const z = zig(pontos);
    return classificarEstrutura(z.highs, z.lows, acharPivos(z.highs, z.lows, 2, 2));
  };
  const alta = rotulo([90, 80, 100, 88, 130, 110]);
  const baixa = rotulo([140, 90, 130, 70, 100, 85]);
  const contr = rotulo([140, 60, 130, 70, 100, 85]);
  const expan = rotulo([105, 95, 110, 60, 130, 110]);
  ok(alta.tendencia === "alta" && alta.rotulo === "HH_HL", "HH + HL = alta");
  ok(baixa.tendencia === "baixa" && baixa.rotulo === "LH_LL", "LH + LL = baixa");
  // Antes os tres casos abaixo saiam todos como "lateral_indefinida".
  ok(contr.tendencia === "lateral_contracao" && contr.rotulo === "LH_HL",
    "LH + HL = contracao, nao 'lateral' generica: o fundo esta SUBINDO");
  ok(expan.tendencia === "lateral_expansao" && expan.rotulo === "HH_LL",
    "HH + LL = expansao: o range ABRE, que e' o oposto de lateral");
  const curta = { highs: [10, 11, 12, 11, 10], lows: [9, 10, 11, 10, 9] };
  const semDados = classificarEstrutura(curta.highs, curta.lows, acharPivos(curta.highs, curta.lows, 2, 2));
  ok(semDados.tendencia === "indefinida",
    "sem pivos suficientes o rotulo e' 'indefinida': ausencia de dado nao vira estado de mercado");
  ok(new Set([alta, baixa, contr, expan, semDados].map((x) => x.tendencia)).size === 5,
    "os cinco casos produzem cinco rotulos diferentes");
}

console.log("\n== estrutura: os eventos nao prometem o que nao aconteceu ==");
{
  const comFundos = (v) => {
    const highs = [], lows = [], teto = Math.max(...v) * 2;
    for (const x of v) for (const y of [teto, teto, x, teto, teto]) { highs.push(y + 1); lows.push(y); }
    return mudancaEstrutura(highs, lows, acharPivos(highs, lows, 2, 2));
  };
  const comTopos = (v) => {
    const highs = [], lows = [], chao = Math.min(...v) / 2;
    for (const x of v) for (const y of [chao, chao, x, chao, chao]) { highs.push(y); lows.push(y - 1); }
    return mudancaEstrutura(highs, lows, acharPivos(highs, lows, 2, 2));
  };
  ok(comFundos([100, 110, 95]).includes("perda_estrutura_alta_novo_LL"),
    "fundo 95 abaixo do 100 inicial: ha LL de verdade, o evento sai");
  ok(!comFundos([100, 110, 105]).includes("perda_estrutura_alta_novo_LL"),
    "fundo 105 acima do 100 inicial: NAO ha LL, e o evento nao sai");
  ok(comTopos([110, 100, 120]).includes("novo_HH_apos_topo_mais_baixo"),
    "topo 120 acima do 110 inicial: ha HH de verdade, o evento sai");
  ok(!comTopos([110, 100, 105]).includes("novo_HH_apos_topo_mais_baixo"),
    "topo 105 abaixo do 110 inicial: NAO ha HH, e o evento nao sai");
  ok(comFundos([110, 100, 105]).includes("novo_HL_apos_fundo_mais_baixo"),
    "o evento de fundo mais alto continua saindo");
  ok(comTopos([100, 130, 120]).includes("topo_mais_baixo_apos_HH"),
    "o evento de topo mais baixo continua saindo");
}

console.log("\n== pivos: o fractal e' por timeframe e o relatorio declara qual usou ==");
{
  const dia = TIMEFRAMES_TESTE.find((t) => t.key === "diario");
  const sem = TIMEFRAMES_TESTE.find((t) => t.key === "semanal");
  ok(dia.pivos.esq === dia.pivos.dir && sem.pivos.esq === sem.pivos.dir,
    "os dois lados do fractal sao iguais em cada timeframe");
  ok(dia.pivos.esq > sem.pivos.esq,
    `o diario usa fractal mais largo que o semanal (${dia.pivos.esq} contra ${sem.pivos.esq}): ` +
    "cada vela semanal ja cobre uma semana");
  // O 5/5 amplia a janela local e exige cinco velas fechadas a direita
// antes de confirmar um pivo candidato. Isso filtra ruido, mas NAO
// define uma distancia minima fixa entre pivos consecutivos.
ok(dia.pivos.esq === 5 && dia.pivos.dir === 5,
  "o fractal diario usa 5 velas de cada lado e confirma apos 5 velas a direita");
  // Serie com ruido de vela a vela por cima de uma onda maior: e'
  // exatamente o ruido que o fractal largo tem de descartar.
  let semente = 7;
  const ale = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
  const zig = [];
  for (let i = 0; i < 400; i++) zig.push(100 + Math.sin(i / 19) * 20 + (ale() - 0.5) * 6);
  const h = zig.map((x) => x + 0.5), l = zig.map((x) => x - 0.5);
  const largo = acharPivos(h, l, dia.pivos.esq, dia.pivos.dir);
  const estreito = acharPivos(h, l, 2, 2);
  const nLargo = largo.altos.length + largo.baixos.length;
  const nEstreito = estreito.altos.length + estreito.baixos.length;
  ok(nLargo < nEstreito,
    `o fractal mais largo marca menos pivos na mesma serie (${nLargo} contra ${nEstreito}): ` +
    "e' isso que corta o ruido");
}

console.log("\n== niveis manuais: o relatorio avisa quando a faixa sai de onde o mercado reage ==");
{
  const zonaEm = (lo, hi) => ({ limites_operacionais: { inferior: lo, superior: hi } });
  const niveis = { faixas: [[100, 110, "a"], [200, 210, "b"]] };
  const casado = alinhamentoNiveis(niveis, [zonaEm(101, 109), zonaEm(201, 209)]);
  ok(casado.situacao === "alinhado" && casado.corroboradas === 2,
    "as duas faixas caem sobre zonas observadas: alinhado");
  const meio = alinhamentoNiveis(niveis, [zonaEm(101, 109), zonaEm(400, 410)]);
  ok(meio.situacao === "parcial" && meio.corroboradas === 1,
    "so uma faixa corroborada: parcial");
  // O caso que nada apontava antes: a faixa pode estar perto do preco e
  // mesmo assim deslocada da regiao em que o mercado de fato reage.
  const fora = alinhamentoNiveis(niveis, [zonaEm(300, 310), zonaEm(400, 410)]);
  ok(fora.situacao === "desalinhado" && fora.corroboradas === 0,
    "nenhuma faixa corroborada: desalinhado, mesmo com os numeros ainda na configuracao");
  ok(alinhamentoNiveis(niveis, []).situacao === "indefinido",
    "sem zonas para comparar, o campo diz indefinido em vez de inventar veredito");
}

console.log("\n== maquina de estados: um rompimento vira noticia UMA vez ==");
{
  const DIA = 86400;
  const base = { nivel: 80000, direcao: "alta", tolAtr: 0.25, resetAtr: 1.5, atr: 2200, maxCandles: 30, segundos: DIA };
  const roda = (precoDe, n) => {
    let estado = null; const novos = []; const estados = [];
    for (let i = 0; i < n; i++) {
      const preco = precoDe(i);
      const vela = { open: preco - 50, high: preco + 80, low: preco - 120, close: preco, time: 1700000000 + i * DIA };
      const antes = estado;
      const depois = atualizarEstadoNivel(antes, { ...base, vela });
      if (depois && !antes && depois.estado === "rompido") novos.push(i);
      if (depois && antes && depois.estado !== antes.estado) estados.push(`${i}:${depois.estado}`);
      estado = depois;
    }
    return { novos, estados, estado };
  };
  // Rompeu e o preco foi embora, sem nunca voltar. Antes o registro era
  // APAGADO por inatividade e renascia em "rompido" na vela seguinte, o
  // que o relatorio anuncia como rompimento novo: 7 anuncios em 200 dias.
  const embora = roda((i) => (i === 0 ? 80600 : 95000), 200);
  ok(embora.novos.length === 1,
    `rompimento anunciado uma unica vez em 200 velas (foram ${embora.novos.length})`);
  ok(embora.estado && embora.estado.estado === "arquivado",
    "o nivel abandonado termina arquivado, nao apagado");
  // Arquivado nao e' o fim: se o preco VOLTA a encostar, o ciclo recomeca.
  const volta = roda((i) => (i === 0 ? 80600 : i < 120 ? 95000 : 80100), 200);
  ok(volta.novos.length === 1, "voltar ao nivel nao conta como rompimento novo");
  ok(volta.estados.some((x) => x.endsWith(":em_reteste")),
    "o nivel dormente acorda em reteste quando o preco volta a encostar");
}

console.log("\n== maquina de estados: a tolerancia acompanha a volatilidade do par ==");
{
  const DIA = 86400;
  const vela = (c) => ({ open: c, high: c + 1, low: c - 1, close: c, time: 1700000000 });
  const ctx = (atr) => ({
    nivel: 100, direcao: "alta", tolAtr: 0.25, resetAtr: 1.5, atr,
    maxCandles: 30, segundos: DIA,
  });
  // Mesmo desvio do nivel (0,4), dois regimes de volatilidade: com ATR
  // grande o preco ainda esta "na zona"; com ATR pequeno, ja rompeu.
  const anterior = { estado: "rompido", direcao: "alta", historico: [], ultimoContato: 1700000000 - DIA, dataRompimento: 1700000000 - DIA };
  const volatil = atualizarEstadoNivel(anterior, { ...ctx(4), vela: vela(100.4) });
  const calmo = atualizarEstadoNivel(anterior, { ...ctx(0.4), vela: vela(100.4) });
  ok(volatil.estado === "em_reteste",
    "num par volatil, 0,4 acima do nivel ainda e' toque: 0,4 < 0,25 x 4");
  ok(calmo.estado !== "em_reteste",
    "num par calmo, o mesmo 0,4 ja esta fora da zona: 0,4 > 0,25 x 0,4");
  // O afastamento segue a mesma regra: 1,0 de desvio nao e' nada num par
  // que anda 4 por vela, e ja e' 2,5 ATR num que anda 0,4.
  const volatilLonge = atualizarEstadoNivel(anterior, { ...ctx(4), vela: vela(101) });
  const calmoLonge = atualizarEstadoNivel(anterior, { ...ctx(0.4), vela: vela(101) });
  ok(!volatilLonge.afastado && calmoLonge.afastado,
    "e o mesmo desvio de 1,0 so conta como afastamento no par calmo");
}

console.log("\n== leitura de contexto longo: a linha para quem nao e' trader ==");
{
  // Cinco campos do bloco SEMANAL, e nada mais. Existe para responder
  // "e dai?" sem obrigar a ler os 100 e poucos campos do relatorio.
  // dp/dm/adx sao opcionais: sem eles a leitura tem de continuar saindo.
  const bloco = (fech, ema, dist, rsi, estrutura, dp, dm, adx) => ({
    ultimo_fechamento_close: fech, ema89_fechada_atual: ema,
    distancia_ema89_fechada_atr: dist, rsi_fechado: rsi,
    estrutura_tendencia: estrutura,
    di_plus_fechado: dp, di_minus_fechado: dm, adx_fechado: adx,
  });
  const barato = leituraLonga(bloco(80, 100, 2.0, 45, "lateral_contracao"));
  ok(barato.classe === "acumular", "abaixo da media longa e sem baixa instalada: acumular");
  const caindo = leituraLonga(bloco(80, 100, 2.0, 45, "baixa"));
  ok(caindo.classe === "atencao",
    "barato E caindo sao coisas diferentes: a tendencia de baixa muda o rotulo");
  const esticado = leituraLonga(bloco(130, 100, 2.5, 74, "alta"));
  ok(esticado.classe === "esticado", "longe acima com RSI esticado: esticado");
  const subindoSaudavel = leituraLonga(bloco(130, 100, 2.5, 58, "alta"));
  ok(subindoSaudavel.classe === "neutro",
    "longe acima mas SEM esticamento nao vira alarme: alta saudavel e' normal");
  // O exagero que esta regra existe para evitar.
  const emCima = leituraLonga(bloco(99, 100, 0.15, 50, "lateral_contracao"));
  ok(emCima.classe === "neutro" && emCima.rotulo === "na média longa",
    "0,15 ATR da media e' ESTAR na media, e nao vira 'barato'");
  // ---- o que o DMI acrescenta, e o RSI nao tinha como dizer ----
  // Duas situacoes com o MESMO preco e o MESMO RSI, separadas so pelo
  // DMI: subiu muito com a compra mandando e' diferente de subiu muito
  // com o movimento morrendo, e a acao que cada uma sugere e' oposta.
  const esticadoVivo = leituraLonga(bloco(130, 100, 2.5, 74, "alta", 35, 10, 30));
  const esticadoMorrendo = leituraLonga(bloco(130, 100, 2.5, 74, "alta", 35, 10, 15));
  ok(esticadoVivo.rotulo !== esticadoMorrendo.rotulo,
    "mesmo preco e mesmo RSI, rotulos diferentes: quem separa e' o DMI");
  ok(/ainda tem força/.test(esticadoVivo.rotulo) && esticadoVivo.classe === "atencao",
    "esticado com ADX forte e compra mandando: a alta ainda tem forca, nao e' hora");
  ok(/perdendo força/.test(esticadoMorrendo.rotulo) && esticadoMorrendo.classe === "esticado",
    "esticado com ADX fraco: a alta esta morrendo, e e' aqui que a janela costuma estar");

  // Do lado barato, o DMI denuncia a queda viva antes da estrutura, que
  // depende de pivos e e' lenta. Qualquer um dos dois basta.
  const baratoCaindoDmi = leituraLonga(bloco(80, 100, 2.0, 45, "lateral_contracao", 10, 35, 30));
  ok(baratoCaindoDmi.rotulo === "barato, mas ainda caindo",
    "venda mandando com ADX forte marca queda viva mesmo sem a estrutura confirmar");
  const baratoParado = leituraLonga(bloco(80, 100, 2.0, 45, "lateral_contracao", 18, 17, 14));
  ok(baratoParado.classe === "acumular",
    "sem forca nenhuma, barato continua sendo barato");

  // ADX abaixo do corte significa que NAO ha tendencia. Nomear uma
  // direcao ali seria inventar uma alta que nao existe.
  ok(/sem tendência firme/.test(baratoParado.razao) && !/alta|queda/.test(
      baratoParado.razao.split(",").pop()),
    "com ADX fraco a razao diz 'sem tendencia firme', e nao nomeia direcao");

  ok(forcaTendencia(30, 10, 30).forte === true && forcaTendencia(30, 10, 20).forte === false,
    "o corte de forca e' 25, o mesmo que a linha de eventos ja usava");
  ok(forcaTendencia(undefined, undefined, 30) === null,
    "sem DI a forca e' nula, e a leitura segue sem ela");
  const semDmi = leituraLonga(bloco(130, 100, 2.5, 74, "alta"));
  ok(semDmi.rotulo.length > 0 && !/undefined/.test(semDmi.razao),
    "bloco sem DMI nao quebra a leitura");

  ok(leituraLonga({ falha: "fonte fora do ar" }).classe === "neutro",
    "bloco em falha nao inventa leitura");
  ok(leituraLonga(null).classe === "neutro", "bloco ausente nao quebra");
  // A razao tem de mostrar os numeros que produziram o rotulo: e' o que
  // torna a linha conferivel por quem nao le o resto da pagina.
  // A razao existe para a leitura ser conferivel por quem NAO sabe
  // analise tecnica. Numero em unidade que a pessoa nao entende nao
  // confere nada, entao nenhum jargao pode vazar para esta linha.
  const todas = [barato, caindo, esticado, subindoSaudavel, emCima];
  ok(todas.every((x) => !/ATR|RSI|EMA|lateral_|_HL|_LL|HH_|LH_/.test(x.razao)),
    "nenhum jargao tecnico aparece na razao: nem ATR, nem RSI, nem EMA");
  ok(todas.every((x) => /%/.test(x.razao)),
    "a distancia sai em porcentagem, que dispensa explicacao");
  ok(/bem abaixo/.test(barato.razao) && /perto/.test(emCima.razao),
    "o criterio de 1 ATR vira palavra: 'bem abaixo' contra 'perto'");
  ok(/esticado/.test(esticado.razao) && /normal/.test(subindoSaudavel.razao),
    "o RSI vira momentum em palavras, com o numero fora da linha");
  const pag = toHTML(r1.texto, relatorioParaJSON(r1.texto, r1.zonas));
  ok(pag.includes('class="leituras"') && /class="leitura /.test(pag),
    "a faixa de contexto longo aparece na pagina");
  ok(pag.indexOf('class="leituras"') < pag.indexOf('class="pares"'),
    "e vem ANTES dos cartoes, que e' o lugar de quem so quer a resposta");
}

console.log("\n== historico: o substrato para medir o que o monitor acerta ==");
{
  // O historico nao decide nada e nao altera o relatorio. Ele grava o
  // que foi PUBLICADO, para um dia dar para responder se cada condicao
  // foi seguida de algum movimento.
  const jsonHist = relatorioParaJSON(r1.texto, r1.zonas);
  const primeira = registrarHistorico(jsonHist, {}, "2026-01-01T00:00:00Z");
  ok(primeira.entradas.length > 0, "a primeira execucao grava uma entrada por par e timeframe");
  ok(primeira.entradas.every((e) => e.par && e.tf && e.vela),
    "toda entrada sabe de que par, timeframe e vela fechada ela fala");
  ok(primeira.entradas.every((e) => typeof e.fech === "number" && e.fech > 0),
    "toda entrada carrega o preco do fechamento: e' dele que sai o retorno futuro");

  // Rodando de hora em hora sobre a MESMA vela fechada, nada muda: sem
  // isso o arquivo cresceria 24 linhas por dia dizendo a mesma coisa.
  const repetida = registrarHistorico(jsonHist, primeira.assinaturas, "2026-01-01T01:00:00Z");
  ok(repetida.entradas.length === 0,
    "reexecucao sobre a mesma vela fechada nao grava linha nova");

  // Mas qualquer condicao nova volta a gravar, na mesma vela.
  const mexido = JSON.parse(JSON.stringify(jsonHist));
  const parAlvo = Object.keys(mexido.diario)[0];
  mexido.diario[parAlvo].alertas_tecnicos = ["condicao_inventada_para_o_teste"];
  const terceira = registrarHistorico(mexido, primeira.assinaturas, "2026-01-01T02:00:00Z");
  ok(terceira.entradas.length === 1 && terceira.entradas[0].par === parAlvo,
    "uma condicao nova na mesma vela grava linha, e so do par que mudou");

  // A assinatura ignora o horario, senao toda execucao pareceria nova.
  const bloco = jsonHist.diario[parAlvo];
  const a1 = assinaturaHistorico(entradaHistorico(parAlvo, "diario", bloco, "2026-01-01T00:00:00Z"));
  const a2 = assinaturaHistorico(entradaHistorico(parAlvo, "diario", bloco, "2026-06-30T23:00:00Z"));
  ok(a1 === a2, "a assinatura nao depende do horario da execucao");

  // Bloco em falha nao entra: registrar uma falha de fonte como se fosse
  // leitura de mercado contaminaria a medicao depois.
  ok(entradaHistorico("X/Y", "diario", { falha: "fonte fora do ar" }, "2026-01-01T00:00:00Z") === null,
    "bloco em FALHA nao vira entrada de historico");
}

console.log("\n== estado entre execucoes ==");
const r4 = await build(fakeFetch(), {
  niveis: r1.estadoNiveis, zonas: r1.zonasEstado, contadoresZona: r1.contadoresZona,
});
ok(!/NaN|undefined/.test(r4.texto), "segunda execucao le o estado anterior sem quebrar");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntudo passou");
process.exit(falhas ? 1 : 0);
