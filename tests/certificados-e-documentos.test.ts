import { describe, expect, it } from "vitest";
import { RadarData } from "../src/index.js";

/** D-0119: certificado digital por formulario e download de documento em bytes. */
function falso(respostas: Array<() => Response>) {
  const chamadas: { url: string; metodo: string; corpo: unknown }[] = [];
  let i = 0;
  const radar = new RadarData({
    token: "tok",
    base: "https://api.exemplo/api/v2",
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), metodo: init?.method ?? "GET", corpo: init?.body ?? null });
      return respostas[Math.min(i++, respostas.length - 1)]!();
    }) as typeof globalThis.fetch,
  });
  return { radar, chamadas };
}

const json = (corpo: unknown, status = 200) => () =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

describe("certificados", () => {
  it("cadastra por formulario, com o segundo fator achatado como a api le", async () => {
    const { radar, chamadas } = falso([json({ data: { id: "c".repeat(24), titular: "FULANA" } }, 201)]);

    const c = await radar.certificados.cadastrar(new Uint8Array([1, 2, 3]), "segredo", {
      nome: "Escritorio",
      autenticacoes: [{ tribunal: "TRF2", sistemas: ["EPROC-TRF2", "EPROC-SJRJ"], secret_2fa: "JBSWY3DP" }],
    });

    expect(c.titular).toBe("FULANA");
    expect(chamadas[0]).toMatchObject({ metodo: "POST", url: "https://api.exemplo/api/v2/certificados" });
    const f = chamadas[0]!.corpo as FormData;
    expect(f.get("senha")).toBe("segredo");
    expect(f.get("certificado")).toBeInstanceOf(Blob);
    expect(f.get("autenticacoes[0][sistemas][1]")).toBe("EPROC-SJRJ");
    expect(f.get("autenticacoes[0][secret_2fa]")).toBe("JBSWY3DP");
  });

  it("cadastrar nao repete em erro de servidor", async () => {
    const { radar, chamadas } = falso([json({ error: { code: "indisponivel", message: "x" } }, 503), json({ data: {} }, 201)]);

    await expect(radar.certificados.cadastrar(new Uint8Array([1]), "s")).rejects.toThrow();
    expect(chamadas).toHaveLength(1);
  });

  it("lista, obtem, remove e configura o 2FA pelo id", async () => {
    const { radar, chamadas } = falso([json({ data: [] }), json({ data: {} }), json({ data: {} }), json({ data: {} })]);
    const id = "c".repeat(24);

    await radar.certificados.listar();
    await radar.certificados.obter(id);
    await radar.certificados.remover(id);
    await radar.certificados.configurarAutenticacoes(id, [{ tribunal: "TJSP", sistemas: ["ESAJ"], secret_2fa: "AAAA" }]);

    expect(chamadas.map((c) => `${c.metodo} ${c.url.replace("https://api.exemplo/api/v2/", "")}`)).toEqual([
      "GET certificados",
      `GET certificados/${id}`,
      `DELETE certificados/${id}`,
      `POST certificados/${id}/autenticacoes`,
    ]);
  });
});

describe("download", () => {
  it("documento do processo vem em bytes, com tipo e nome", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4 x");
    const { radar, chamadas } = falso([
      () => new Response(pdf, { status: 200, headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="documento-abc.pdf"' } }),
    ]);

    const a = await radar.consultas.baixarDocumento("d".repeat(24));

    expect(chamadas[0]!.url).toBe(`https://api.exemplo/api/v2/processos/documentos/${"d".repeat(24)}`);
    expect(a.tipo).toBe("application/pdf");
    expect(a.nome).toBe("documento-abc.pdf");
    expect(new TextDecoder().decode(a.conteudo)).toBe("%PDF-1.4 x");
  });

  it("pagina do diario pelo id do aviso, e erro continua erro", async () => {
    const { radar, chamadas } = falso([json({ error: { code: "nao_encontrado", message: "Documento não encontrado." } }, 404)]);

    await expect(radar.monitoramentosJudiciais.paginaDoDiario("p".repeat(24))).rejects.toThrow("Documento não encontrado.");
    expect(chamadas[0]!.url).toBe(`https://api.exemplo/api/v2/diarios/paginas/${"p".repeat(24)}`);
  });
});
