import { describe, expect, it } from "vitest";
import {
  EntradaInvalida,
  ErroDoServidor,
  FalhaDeRede,
  NaoAutenticado,
  RadarData,
  SaldoInsuficiente,
  SemEscopo,
  emReais,
} from "../src/index.js";

/**
 * O que este arquivo guarda nao e "o SDK chama a api", que e trivial, e sim as
 * decisoes que custam dinheiro do cliente se forem quebradas:
 *
 * - repetir SO onde ha `Idempotency-Key`, porque sem ela uma consulta volta a
 *   ser cobrada e criar sessao de Verify vira uma segunda sessao faturavel;
 * - a chave ser gerada sozinha, senao ninguem usa justamente no caso em que
 *   ela importa;
 * - cada status virar um erro proprio, para quem integra nao comparar string.
 */

interface Chamada {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  corpo: unknown;
}

/**
 * `respostas` sao FABRICAS, nao objetos.
 *
 * O corpo de um `Response` so pode ser lido UMA vez: reaproveitar a mesma
 * instancia entre chamadas faz o teste falhar com "Body is unusable", e o
 * sintoma aparece como se o SDK estivesse errado. Fabricar por chamada tira
 * essa pegadinha do caminho.
 */
function falso(respostas: Array<() => Response | Error>, tentativas = 3) {
  const chamadas: Chamada[] = [];
  let i = 0;

  const radar = new RadarData({
    token: "tok-de-teste",
    base: "https://api.exemplo/api/v2",
    tentativas,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const cabecalhos: Record<string, string> = {};
      for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
        cabecalhos[k] = v;
      }
      chamadas.push({
        url: String(url),
        metodo: init?.method ?? "GET",
        cabecalhos,
        corpo: init?.body ? JSON.parse(String(init.body)) : null,
      });

      const fabrica = respostas[Math.min(i++, respostas.length - 1)]!;
      const r = fabrica();
      if (r instanceof Error) throw r;
      return r;
    }) as typeof globalThis.fetch,
  });

  return { radar, chamadas };
}

const json = (corpo: unknown, status = 200) => () =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const explode = (e: Error) => () => e;

describe("transporte", () => {
  it("manda o token e se identifica", async () => {
    const { radar, chamadas } = falso([json({ data: { saldo: 1000, saldo_disponivel: 900, modo_cobranca: "PRE" } })]);

    await radar.catalogo.saldo();

    expect(chamadas[0]!.cabecalhos.Authorization).toBe("Bearer tok-de-teste");
    expect(chamadas[0]!.cabecalhos["User-Agent"]).toContain("radardata-sdk-node/");
  });

  it("saldo vem em centavos inteiros", async () => {
    const { radar } = falso([
      json({ data: { saldo: 123456, saldo_disponivel: 100000, modo_cobranca: "PRE" } }),
    ]);

    const saldo = await radar.catalogo.saldo();

    expect(saldo.centavos).toBe(123456);
    expect(saldo.disponivelCentavos).toBe(100000);
    expect(emReais(saldo.centavos)).toBe("1.234,56");
  });

  it("consulta manda chave de idempotencia sozinha", async () => {
    const { radar, chamadas } = falso([json({ data: { ok: true } })]);

    await radar.consultas.executar("cpf", "12345678909");

    // Sem a chave, repetir cobraria de novo. Exigir que o integrador a passe
    // significaria, na pratica, ninguem usar.
    expect(chamadas[0]!.cabecalhos["Idempotency-Key"]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("consulta repete em erro de servidor com a MESMA chave", async () => {
    const { radar, chamadas } = falso([
      json({ error: { code: "erro", message: "x" } }, 500),
      json({ data: { ok: true } }),
    ]);

    const r = await radar.consultas.executar("cpf", "12345678909");

    expect(r).toEqual({ ok: true });
    expect(chamadas).toHaveLength(2);
    // A MESMA chave nas duas: e isso que faz a api devolver a resposta de
    // antes em vez de cobrar outra vez.
    expect(chamadas[0]!.cabecalhos["Idempotency-Key"]).toBe(chamadas[1]!.cabecalhos["Idempotency-Key"]);
  });

  it("criar sessao de verify NAO repete", async () => {
    const { radar, chamadas } = falso([
      json({ error: { code: "erro", message: "x" } }, 500),
      json({ session_id: "nao-deveria-chegar" }, 201),
    ]);

    await expect(radar.verify.criarSessao("kyc", { cpf: "12345678909" })).rejects.toBeInstanceOf(ErroDoServidor);

    // UMA chamada so. Esta rota nao tem idempotencia na api, entao repetir
    // criaria uma SEGUNDA sessao faturavel.
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.cabecalhos["Idempotency-Key"]).toBeUndefined();
  });

  it("cada status vira um erro proprio, com o code da api", async () => {
    const casos: Array<[number, unknown]> = [
      [401, NaoAutenticado],
      [402, SaldoInsuficiente],
      [403, SemEscopo],
      [422, EntradaInvalida],
    ];

    for (const [status, classe] of casos) {
      const { radar } = falso([json({ error: { code: `codigo_${status}`, message: `mensagem ${status}` } }, status)], 1);

      // UMA chamada, e as duas afirmacoes sobre o mesmo erro: a classe, para
      // o `catch` especifico, e o `code`, que e o que vale para decidir no
      // codigo, porque a mensagem e escrita para pessoa e muda.
      const erro = await radar.catalogo.saldo().catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(classe as never);
      expect(erro).toMatchObject({ codigo: `codigo_${status}`, status });
    }
  });

  it("sem resposta e FalhaDeRede e nao erro de servidor", async () => {
    const { radar } = falso([explode(new TypeError("fetch failed"))], 1);

    // A diferenca importa: aqui NAO se sabe se a operacao aconteceu, e a acao
    // certa e consultar pela chave, nao repetir as cegas.
    await expect(radar.catalogo.saldo()).rejects.toBeInstanceOf(FalhaDeRede);
  });

  it("resposta sem envelope data tambem funciona", async () => {
    // A sessao de Verify responde no corpo raiz, o catalogo responde em
    // `data`. Quem chama nao deveria ter de saber disso.
    const { radar } = falso([
      json({ session_id: "abc", url: "https://verify.exemplo/s/t", status: "pending" }, 201),
    ]);

    const sessao = await radar.verify.criarSessao("kyc");

    expect(sessao.id).toBe("abc");
    expect(sessao.url).toBe("https://verify.exemplo/s/t");
    expect(sessao.resultado).toBeNull();
  });

  it("token vazio nao deixa o SDK ser construido", () => {
    expect(() => new RadarData({ token: "" })).toThrow(/token de API/i);
  });
});
