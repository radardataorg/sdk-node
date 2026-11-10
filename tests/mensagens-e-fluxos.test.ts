import { describe, expect, it } from "vitest";
import { EntradaInvalida, RadarData } from "../src/index.js";

/**
 * Mensagens, fluxos do Motor e o resultado de consulta demorada (D-0130): o que a v2 tinha
 * e o SDK nao cobria. O SMS repete com a mesma chave, porque a api devolve a primeira
 * mensagem em vez de mandar de novo.
 */
function falso(respostas: Array<() => Response>) {
  const chamadas: { url: string; metodo: string; cabecalhos: Record<string, string>; corpo: unknown }[] = [];
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
