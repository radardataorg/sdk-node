import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MuitasTentativas, RadarData } from "../src/index.js";
import { paraSessao } from "../src/dados.js";

/**
 * Documentos e decisao manual do Motor de Analises. A decisao vai em `acao`
 * (ate a 0.2.0 ia em `decisao` e a api recusava sempre), e o envio de
 * documento nunca se repete sozinho, porque a api nao tem idempotencia ali.
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
        corpo: init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : null,
      });
      return respostas[Math.min(i++, respostas.length - 1)]!();
    }) as typeof globalThis.fetch,
  });
  return { radar, chamadas };
}

const json = (corpo: unknown, status = 200) => () =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

describe("decidir", () => {
  it("manda acao, motivo e responsavel", async () => {
    const { radar, chamadas } = falso([json({ data: { id: "a1", pendencia: { tipo: "verify", url: "https://v/s/x" } } })]);

    const r = await radar.analises.decidir("a1", "aprovar", { motivo: "Conferido.", responsavel: "ana@loja.com.br" });

    expect(chamadas[0]).toMatchObject({ metodo: "POST", url: "https://api.exemplo/api/v2/analises/a1/decisao" });
    expect(chamadas[0]!.corpo).toEqual({ acao: "aprovar", motivo: "Conferido.", responsavel: "ana@loja.com.br" });
    expect((r.pendencia as { url: string }).url).toBe("https://v/s/x");
  });

  it("sem opcionais manda so a acao", async () => {
    const { radar, chamadas } = falso([json({ data: { id: "a1" } })]);

    await radar.analises.decidir("a1", "recusar");

    expect(chamadas[0]!.corpo).toEqual({ acao: "recusar" });
  });
});

describe("documentos", () => {
  it("envia multipart com arquivo e tipo, sem chave de idempotencia", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "doc-"));
    const caminho = join(pasta, "rg.pdf");
    await writeFile(caminho, "%PDF-1.4\nconteudo");
    const { radar, chamadas } = falso([json({ data: { id: "doc123", tipo: "identidade", tamanho: 17, expira_em: "x" } }, 201)]);

    const r = await radar.documentos.enviar(caminho, "identidade");

    expect(r.id).toBe("doc123");
    expect(chamadas[0]).toMatchObject({ metodo: "POST", url: "https://api.exemplo/api/v2/documentos" });
    expect(chamadas[0]!.cabecalhos["Idempotency-Key"]).toBeUndefined();
    expect(chamadas[0]!.cabecalhos["Content-Type"]).toBeUndefined();
    const form = chamadas[0]!.corpo as FormData;
    expect(form.get("tipo")).toBe("identidade");
    const arq = form.get("arquivo") as File;
    expect(arq.name).toBe("rg.pdf");
    expect(await arq.text()).toBe("%PDF-1.4\nconteudo");
  });

  it("aceita bytes com nome", async () => {
    const { radar, chamadas } = falso([json({ data: { id: "d" } }, 201)]);

    await radar.documentos.enviar(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "endereco", "comprovante.png");

    expect(((chamadas[0]!.corpo as FormData).get("arquivo") as File).name).toBe("comprovante.png");
  });

  it("nao repete em 429", async () => {
    const { radar, chamadas } = falso([
      json({ error: { code: "muitos_documentos_pendentes", message: "x" } }, 429),
      json({ data: { id: "nao-deveria" } }, 201),
    ]);

    await expect(radar.documentos.enviar(new Blob(["x"]), "identidade", "a.pdf")).rejects.toBeInstanceOf(MuitasTentativas);
    expect(chamadas).toHaveLength(1);
  });
});

describe("sessao do Verify", () => {
  it("le o valor pelo nome novo e pelo antigo", () => {
    expect(paraSessao({ session_id: "s", valor_total_centavos: 990, custo_total_centavos: 990 }).valorCentavos).toBe(990);
    expect(paraSessao({ session_id: "s", custo_total_centavos: 450 }).valorCentavos).toBe(450);
    expect(paraSessao({ session_id: "s" }).valorCentavos).toBe(0);
  });
});
