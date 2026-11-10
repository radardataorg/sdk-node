import { describe, expect, it } from "vitest";
import { EntradaInvalida, NaoEncontrado, RadarData } from "../src/index.js";

/**
 * Contrato contra uma api de verdade (D-0130). Os outros testes usam um `fetch` falso, e foi
 * assim que `decidir()` mandou o campo errado por meses sem ninguem ver. Este roda o SDK
 * contra a api local, com um token de SANDBOX, e so quando as duas variaveis existem:
 *
 *   RADARDATA_CONTRATO_BASE=http://127.0.0.1:8765/api/v2 RADARDATA_CONTRATO_TOKEN=... npm run contrato
 *
 * O token precisa dos escopos leitura, mensagens, consultas e fluxos. Nada aqui gasta saldo
 * nem manda mensagem: em sandbox o envio e simulado.
 */
const base = process.env.RADARDATA_CONTRATO_BASE;
const token = process.env.RADARDATA_CONTRATO_TOKEN;

describe.skipIf(!base || !token)("contrato com a api", () => {
  const radar = new RadarData({ token: token ?? "", base, tentativas: 1 });

  it("saldo", async () => {
    const saldo = await radar.catalogo.saldo();
    expect(typeof saldo.centavos).toBe("number");
  });

  it("mensagens: envia em sandbox, repete pela chave, lista e mostra", async () => {
    const chave = `contrato-${Date.now()}`;
    const r = await radar.mensagens.enviar("+5519984250269", "Contrato do SDK: ação", { chave });
    expect(r.mensagem.status).toBe("aceita");
    expect(r.meta.sandbox).toBe(true);

    const repetida = await radar.mensagens.enviar("+5519984250269", "Contrato do SDK: ação", { chave });
    expect(repetida.mensagem.id).toBe(r.mensagem.id);

    const pagina = await radar.mensagens.listar(1, 5);
    expect(pagina.data.some((m) => m.id === r.mensagem.id)).toBe(true);
    expect(typeof pagina.meta.total).toBe("number");

    const uma = await radar.mensagens.obter(String(r.mensagem.id));
    expect(uma.texto).toBe("Contrato do SDK: acao");
  });

  it("mensagens: emoji volta EntradaInvalida com texto_invalido", async () => {
    await expect(radar.mensagens.enviar("+5519984250269", "oi \u{1F600}")).rejects.toMatchObject({
      constructor: EntradaInvalida,
      codigo: "texto_invalido",
    });
  });

  it("fluxos: lista e recusa definicao vazia", async () => {
    expect(Array.isArray(await radar.fluxos.listar())).toBe(true);
    await expect(radar.fluxos.validar({})).rejects.toBeInstanceOf(EntradaInvalida);
  });

  it("consultas: id que nao existe volta NaoEncontrado", async () => {
    await expect(radar.consultas.resultado("0000000000000000")).rejects.toBeInstanceOf(NaoEncontrado);
  });
});
