import { describe, expect, it } from "vitest";
import { Conflito, EntradaInvalida, ErroDoServidor, FalhaDeRede, RadarData } from "../src/index.js";
import { createHmac } from "node:crypto";

/**
 * Mensagens, fluxos do Motor e o resultado de consulta demorada (D-0130): o que a v2 tinha
 * e o SDK nao cobria. O SMS repete com a mesma chave, porque a api devolve a primeira
 * mensagem em vez de mandar de novo.
 */
function falso(respostas: Array<() => Response>) {
  const chamadas: { url: string; metodo: string; cabecalhos: Record<string, string>; corpo: unknown; cru: string | null }[] = [];
  let i = 0;
  const radar = new RadarData({
    token: "tok",
    base: "https://api.exemplo/api/v2",
    tentativas: 3,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({
        url: String(url),
        metodo: init?.method ?? "GET",
        cabecalhos: (init?.headers ?? {}) as Record<string, string>,
        corpo: init?.body ? JSON.parse(String(init.body)) : null,
        cru: init?.body ? String(init.body) : null,
      });
      return respostas[Math.min(i++, respostas.length - 1)]!();
    }) as typeof globalThis.fetch,
  });
  return { radar, chamadas };
}

const json = (corpo: unknown, status = 200) => () =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const ACEITA = { id: "k3x9q2m7v1w8z4t6r0p5n2bc", canal: "sms", para: "(11) *****-9999", status: "aceita", erro: null, preco: 40 };

describe("mensagens", () => {
  it("envia SMS com a chave dada e devolve a mensagem e o saldo", async () => {
    const { radar, chamadas } = falso([json({ data: ACEITA, meta: { saldo: 9960, preco: 40, sandbox: false } }, 201)]);

    const r = await radar.mensagens.enviar("+5511999999999", "Seu codigo e 482913.", { chave: "pedido-1-codigo" });

    expect(chamadas[0]).toMatchObject({ metodo: "POST", url: "https://api.exemplo/api/v2/mensagens" });
    expect(chamadas[0]!.corpo).toEqual({ canal: "sms", para: "+5511999999999", texto: "Seu codigo e 482913." });
    expect(chamadas[0]!.cabecalhos["Idempotency-Key"]).toBe("pedido-1-codigo");
    expect(r.mensagem.status).toBe("aceita");
    expect(r.meta.saldo).toBe(9960);
  });

  it("sem chave gera uma, e repete com a mesma depois de 503", async () => {
    const { radar, chamadas } = falso([
      json({ error: { code: "fornecedor_offline", message: "fora" } }, 503),
      json({ data: ACEITA, meta: {} }, 201),
    ]);

    await radar.mensagens.enviar("11999999999", "oi");

    expect(chamadas).toHaveLength(2);
    expect(chamadas[0]!.cabecalhos["Idempotency-Key"]).toMatch(/^[0-9a-f]{32}$/);
    expect(chamadas[1]!.cabecalhos["Idempotency-Key"]).toBe(chamadas[0]!.cabecalhos["Idempotency-Key"]);
  });

  it("texto com emoji vira EntradaInvalida com o codigo da api, sem repetir", async () => {
    const { radar, chamadas } = falso([json({ error: { code: "texto_invalido", message: "x" } }, 422)]);

    await expect(radar.mensagens.enviar("11999999999", "oi \u{1F600}")).rejects.toMatchObject({
      constructor: EntradaInvalida,
      codigo: "texto_invalido",
    });
    expect(chamadas).toHaveLength(1);
  });

  it("lista paginada e mostra uma pelo id", async () => {
    const { radar, chamadas } = falso([
      json({ data: [ACEITA], meta: { pagina: 2, paginas: 3, total: 51 } }),
      json({ data: { ...ACEITA, texto: "oi" } }),
    ]);

    const pagina = await radar.mensagens.listar(2, 25);
    const uma = await radar.mensagens.obter(ACEITA.id);

    expect(chamadas[0]!.url).toBe("https://api.exemplo/api/v2/mensagens?page=2&per_page=25");
    expect(pagina.meta.total).toBe(51);
    expect(chamadas[1]!.url).toBe(`https://api.exemplo/api/v2/mensagens/${ACEITA.id}`);
    expect(uma.texto).toBe("oi");
  });
});

describe("mensagens: repetir com seguranca", () => {
  it("resposta perdida e depois 409: Conflito, com a chave no erro", async () => {
    const { radar, chamadas } = falso([
      () => {
        throw new TypeError("fetch failed");
      },
      json({ error: { code: "idempotency_em_processamento", message: "x" } }, 409),
    ]);

    const erro = await radar.mensagens.enviar("11999999999", "oi").catch((e) => e);

    expect(erro).toBeInstanceOf(Conflito);
    expect(erro.codigo).toBe("idempotency_em_processamento");
    expect(erro.chaveIdempotencia).toBe(chamadas[0]!.cabecalhos["Idempotency-Key"]);
    expect(chamadas[1]!.cabecalhos["Idempotency-Key"]).toBe(chamadas[0]!.cabecalhos["Idempotency-Key"]);
  });

  it("falha de rede em todas as tentativas tambem leva a chave", async () => {
    const { radar } = falso([
      () => {
        throw new TypeError("fetch failed");
      },
    ]);

    const erro = await radar.mensagens.enviar("11999999999", "oi", { chave: "minha" }).catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaDeRede);
    expect(erro.chaveIdempotencia).toBe("minha");
  });

  it("chave vazia gera uma, em vez de mandar sem idempotencia", async () => {
    const { radar, chamadas } = falso([json({ data: ACEITA, meta: {} }, 201)]);

    await radar.mensagens.enviar("11999999999", "oi", { chave: "" });

    expect(chamadas[0]!.cabecalhos["Idempotency-Key"]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("envio_incerto e limite_destino nao sao repetidos, porque voltam iguais", async () => {
    for (const [status, codigo] of [[504, "envio_incerto"], [429, "limite_destino"]] as const) {
      const { radar, chamadas } = falso([json({ error: { code: codigo, message: "x" } }, status)]);
      const erro = await radar.mensagens.enviar("11999999999", "oi").catch((e) => e);
      expect(erro.codigo).toBe(codigo);
      expect(chamadas).toHaveLength(1);
    }
    const { radar } = falso([json({ error: { code: "envio_incerto", message: "x" } }, 504)]);
    await expect(radar.mensagens.enviar("11999999999", "oi")).rejects.toBeInstanceOf(ErroDoServidor);
  });
});

describe("eventos e operacoes", () => {
  it("evento assinado com o segredo, sobre o corpo exato que sai", async () => {
    const { radar, chamadas } = falso([json({ data: { repetido: false, analises: [] }, avisos: [] }, 202)]);

    await radar.eventos.enviar("pedido.criado", "pedido-9", { valor: 100 }, { segredo: "s3gr3do" });

    const c = chamadas[0]!;
    expect(c.url).toBe("https://api.exemplo/api/v2/eventos");
    expect(c.corpo).toEqual({ evento: "pedido.criado", chave: "pedido-9", dados: { valor: 100 } });
    expect(c.cabecalhos["X-RadarData-Signature"]).toBe(`sha256=${createHmac("sha256", "s3gr3do").update(c.cru!).digest("hex")}`);
    expect(c.cabecalhos.Authorization).toBe("Bearer tok");
  });

  it("evento sem segredo vai sem assinatura", async () => {
    const { radar, chamadas } = falso([json({ data: {} }, 202)]);
    await radar.eventos.enviar("pedido.criado", "pedido-9");
    expect(chamadas[0]!.cabecalhos["X-RadarData-Signature"]).toBeUndefined();
  });

  it("operacoes: registra com chave, lista com filtros, mostra e decide", async () => {
    const { radar, chamadas } = falso([json({ data: { id: "o1" } }, 201)]);

    await radar.operacoes.registrar({ cliente_documento: "11222333000181", sacado_documento: "52998224725", valor: 150000 }, "op-1");
    await radar.operacoes.listar({ pagina: 2, revisar: true, de: "2026-11-01" });
    await radar.operacoes.mostrar("o1");
    await radar.operacoes.decidir("o1", "ARQUIVAR", "Operacao conferida com o cliente.");

    expect(chamadas[0]!.cabecalhos["Idempotency-Key"]).toBe("op-1");
    expect(chamadas[1]!.url).toBe("https://api.exemplo/api/v2/operacoes?page=2&revisar=1&de=2026-11-01");
    expect(chamadas[2]!.url).toBe("https://api.exemplo/api/v2/operacoes/o1");
    expect(chamadas[3]!.corpo).toEqual({ decisao: "ARQUIVAR", motivo: "Operacao conferida com o cliente." });
  });
});

describe("fluxos", () => {
  it("valida, publica, mostra, lista e remove pelas rotas da v2", async () => {
    const { radar, chamadas } = falso([json({ data: { valida: true, preco: 300 } })]);
    const definicao = { entrada: { cpf: { tipo: "cpf", obrigatorio: true } }, etapas: [] };

    await radar.fluxos.validar(definicao, "PF");
    await radar.fluxos.publicar("meu-kyc", "Meu KYC", "PF", definicao, { motivo: "primeira versao" });
    await radar.fluxos.mostrar("meu-kyc");
    await radar.fluxos.listar();
    await radar.fluxos.remover("meu-kyc");

    expect(chamadas.map((c) => `${c.metodo} ${c.url.replace("https://api.exemplo/api/v2/", "")}`)).toEqual([
      "POST analises/fluxos/validar",
      "PUT analises/fluxos/meu-kyc",
      "GET analises/fluxos/meu-kyc",
      "GET analises/fluxos",
      "DELETE analises/fluxos/meu-kyc",
    ]);
    expect(chamadas[0]!.corpo).toEqual({ definicao, alvo: "PF" });
    expect(chamadas[1]!.corpo).toEqual({ motivo: "primeira versao", nome: "Meu KYC", alvo: "PF", definicao });
  });
});

describe("resultado de consulta", () => {
  it("devolve o corpo inteiro, com o estado em meta.status", async () => {
    const { radar, chamadas } = falso([json({ data: null, meta: { consulta_id: "abc", status: "em_andamento" } })]);

    const r = await radar.consultas.resultado("abc");

    expect(chamadas[0]!.url).toBe("https://api.exemplo/api/v2/consultas/abc");
    expect((r.meta as { status: string }).status).toBe("em_andamento");
  });
});
