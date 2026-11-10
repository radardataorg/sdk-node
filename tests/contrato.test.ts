import { beforeAll, describe, expect, it } from "vitest";
import { EntradaInvalida, NaoEncontrado, RadarData } from "../src/index.js";

/**
 * Contrato contra uma api de verdade (D-0130). Os outros testes usam um `fetch` falso, e foi
 * assim que `decidir()` mandou o campo errado por meses sem ninguem ver. Este roda o SDK
 * contra a api local, com um token de SANDBOX, e so quando as duas variaveis existem:
 *
 *   RADARDATA_CONTRATO_BASE=http://127.0.0.1:8765/api/v2 RADARDATA_CONTRATO_TOKEN=... npm run contrato
 *
 * O token precisa dos escopos leitura, mensagens, consultas, analises e fluxos. A base tem de ser local. Nada aqui gasta saldo
 * nem manda mensagem: em sandbox o envio e simulado.
 */
const base = process.env.RADARDATA_CONTRATO_BASE;
const token = process.env.RADARDATA_CONTRATO_TOKEN;

// So contra api local: com token de producao, o envio de SMS sairia de verdade e seria cobrado.
const local = !!base && /^https?:\/\/(127\.0\.0\.1|localhost|[a-z0-9.-]+\.local)(:\d+)?\//.test(base);

describe.skipIf(!base || !token)("contrato com a api", () => {
  let radar: RadarData;

  beforeAll(() => {
    if (!local) throw new Error(`RADARDATA_CONTRATO_BASE precisa ser local, e veio ${base}.`);
    radar = new RadarData({ token: token ?? "", base, tentativas: 1 });
  });

  it("saldo", async () => {
    const saldo = await radar.catalogo.saldo();
    expect(typeof saldo.centavos).toBe("number");
  });

  it("mensagens: envia em sandbox, repete pela chave, lista e mostra", async () => {
    const chave = `contrato-${Date.now()}`;
    const r = await radar.mensagens.enviar("+5511900000000", "Contrato do SDK: ação", { chave });
    expect(r.meta.sandbox).toBe(true);
    expect(r.mensagem.status).toBe("aceita");

    const repetida = await radar.mensagens.enviar("+5511900000000", "Contrato do SDK: ação", { chave });
    expect(repetida.mensagem.id).toBe(r.mensagem.id);

    const pagina = await radar.mensagens.listar(1, 5);
    expect(pagina.data.some((m) => m.id === r.mensagem.id)).toBe(true);
    expect(typeof pagina.meta.total).toBe("number");

    const uma = await radar.mensagens.obter(String(r.mensagem.id));
    expect(uma.texto).toBe("Contrato do SDK: acao");
  });

  it("mensagens: emoji volta EntradaInvalida com texto_invalido", async () => {
    await expect(radar.mensagens.enviar("+5511900000000", "oi \u{1F600}")).rejects.toMatchObject({
      constructor: EntradaInvalida,
      codigo: "texto_invalido",
    });
  });

  it("fluxos: lista e recusa definicao vazia", async () => {
    expect(Array.isArray(await radar.fluxos.listar())).toBe(true);
    await expect(radar.fluxos.validar({})).rejects.toBeInstanceOf(EntradaInvalida);
  });

  it("operacoes: lista paginada", async () => {
    const r = await radar.operacoes.listar({ pagina: 1, porPagina: 5 });
    expect(Array.isArray(r.data)).toBe(true);
  });

  it("eventos: evento sem gatilho e aceito e nao acorda analise", async () => {
    const r = await radar.eventos.enviar("contrato.teste", `contrato-evt-${Date.now()}`, { x: 1 });
    expect((r.data as { analises: unknown[] }).analises).toEqual([]);
  });

  it("consultas: id que nao existe volta NaoEncontrado", async () => {
    await expect(radar.consultas.resultado("0000000000000000")).rejects.toBeInstanceOf(NaoEncontrado);
  });
});
