// Harness de fumaca: serve series sinteticas no formato OHLC da Kraken e
// confere que o relatorio sai inteiro, sem tocar na rede.
//
// Existe porque o monitor publica sozinho de hora em hora: sem isso, um
// refactor que quebre o parse ou o calculo so apareceria em producao,
// com o relatorio ja no ar.
import {
  build, relatorioParaJSON, toHTML, PARES_TESTE, analisarVolume, situacaoNiveis, atualizarEstadoNivel, alertasTecnicos, sinteses,
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
  ok(typeof j.semanal[p].rsi14_fechado === "number", `${p}: RSI semanal numerico`);
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
  const dds = html.match(/<dt>ATR\(14\)<\/dt><dd[^>]*>([^<]*)<\/dd>/);
  ok(dds && /^\d[\d.,]*%$/.test(dds[1]), `cartao mostra so a % no ATR (mostrou "${dds && dds[1]}")`);
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

console.log("\n== estado entre execucoes ==");
const r4 = await build(fakeFetch(), {
  niveis: r1.estadoNiveis, zonas: r1.zonasEstado, contadoresZona: r1.contadoresZona,
});
ok(!/NaN|undefined/.test(r4.texto), "segunda execucao le o estado anterior sem quebrar");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntudo passou");
process.exit(falhas ? 1 : 0);
