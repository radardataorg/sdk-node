import { describe, expect, it } from "vitest";
import { RadarData } from "../src/index.js";

/** Monitoramento judicial (D-0118): cobra por ciclo, entao criar nao pode repetir sozinho. */
function falso(respostas: Array<() => Response>) {
  const chamadas: { url: string; metodo: string; corpo: unknown }[] = [];
  let i = 0;
  const radar = new RadarData({
    token: "tok",
    base: "https://api.exemplo/api/v2",
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(String(init.body)) : null });
      return respostas[Math.min(i++, respostas.length - 1)]!();
    }) as typeof globalThis.fetch,
  });
  return { radar, chamadas };
}

const json = (corpo: unknown, status = 200) => () =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

describe("monitoramentos judiciais", () => {
  it("cria com o servico no corpo", async () => {
    const { radar, chamadas } = falso([json({ data: { id: "abc" } }, 201)]);

    const m = await radar.monitoramentosJudiciais.criar("monitoramento-documento", { documento: "12345678909", nome: "x" });

    expect(m.id).toBe("abc");
    expect(chamadas[0]).toMatchObject({ metodo: "POST", url: "https://api.exemplo/api/v2/monitoramentos-judiciais" });
    expect(chamadas[0]!.corpo).toEqual({ servico: "monitoramento-documento", documento: "12345678909", nome: "x" });
  });

  it("criar nao repete em erro de servidor", async () => {
    const { radar, chamadas } = falso([json({ error: { code: "erro", message: "x" } }, 502), json({ data: { id: "abc" } }, 201)]);

    await expect(radar.monitoramentosJudiciais.criar("monitoramento-documento", { documento: "1" })).rejects.toThrow();
    expect(chamadas).toHaveLength(1);
  });

  it("lista, obtem, le eventos e cancela pelo id", async () => {
    const { radar, chamadas } = falso([json({ data: [] }), json({ data: { id: "a/b" } }), json({ data: [] }), json({ data: { cancelado: true } })]);

    await radar.monitoramentosJudiciais.listar(2, 10);
    await radar.monitoramentosJudiciais.obter("a/b");
    await radar.monitoramentosJudiciais.eventos("a/b");
    await radar.monitoramentosJudiciais.cancelar("a/b");

    expect(chamadas.map((c) => `${c.metodo} ${c.url}`)).toEqual([
      "GET https://api.exemplo/api/v2/monitoramentos-judiciais?page=2&per_page=10",
      "GET https://api.exemplo/api/v2/monitoramentos-judiciais/a%2Fb",
      "GET https://api.exemplo/api/v2/monitoramentos-judiciais/a%2Fb/eventos?page=1&per_page=25",
      "DELETE https://api.exemplo/api/v2/monitoramentos-judiciais/a%2Fb",
    ]);
  });

  it("catalogo diz onde se usa e marca o monitoramento", async () => {
    const { radar } = falso([
      json({ data: [
        { slug: "cpf", preco: 10, rota: "/api/v2/cpf" },
        { slug: "monitoramento-documento", preco: 660, rota: "/api/v2/monitoramentos-judiciais" },
      ] }),
    ]);

    const [cpf, mon] = await radar.catalogo.servicos();

    expect(cpf).toMatchObject({ rota: "/api/v2/cpf", monitoramento: false });
    expect(mon).toMatchObject({ rota: "/api/v2/monitoramentos-judiciais", monitoramento: true });
  });
});
