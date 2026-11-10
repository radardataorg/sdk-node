import type { Transporte } from "../transporte.js";

/** Os tipos que a api aceita. */
export const TIPOS_DE_DOCUMENTO = [
  "identidade",
  "endereco",
  "contrato_social",
  "procuracao",
  "cartao_cnpj",
  "outro",
] as const;

export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];

/**
 * Documentos enviados para o Motor de Analises. Escopo `analises`.
 *
 * O documento sobe ANTES da analise: o `id` devolvido aqui vai no campo de
 * documentos da entrada, como `{ id, tipo }`. Documento que nao entra em
 * analise nenhuma expira em 24 horas.
 *
 * Sem idempotencia na api, entao o SDK NAO repete o envio: repetir as cegas
 * deixaria um segundo documento ocupando a cota de pendentes da conta.
 */
export class Documentos {
  constructor(private readonly t: Transporte) {}

  /**
   * Envia um JPEG, PNG ou PDF de ate 10 MB.
   *
   * @param arquivo caminho do arquivo (so no Node), `Blob` ou bytes
   * @param nomeArquivo obrigatorio na pratica quando `arquivo` sao bytes, para o tipo ser reconhecido
   */
  async enviar(
    arquivo: string | Blob | Uint8Array | ArrayBuffer,
    tipo?: TipoDeDocumento,
    nomeArquivo?: string,
  ): Promise<{ id: string; tipo: string | null; tamanho: number; expira_em: string }> {
    let conteudo: Blob;
    let nome = nomeArquivo;

    if (typeof arquivo === "string") {
      const { readFile } = await import("node:fs/promises");
      const { basename } = await import("node:path");
      conteudo = new Blob([await readFile(arquivo)]);
      nome ??= basename(arquivo);
    } else if (arquivo instanceof Blob) {
      conteudo = arquivo;
    } else {
      conteudo = new Blob([arquivo]);
    }

    const formulario = new FormData();
    formulario.append("arquivo", conteudo, nome ?? "documento");
    if (tipo !== undefined) formulario.append("tipo", tipo);

    return this.t.pedir("POST", "documentos", { formulario });
  }
}
