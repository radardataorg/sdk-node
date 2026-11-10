import { type Transporte, chaveIdempotencia } from "../transporte.js";

/** O que a api pede para registrar uma operacao. Valores em centavos, datas `AAAA-MM-DD`. */
export interface NovaOperacao {
  cliente_documento: string;
  sacado_documento: string;
  valor: number;
  cliente_nome?: string;
  sacado_nome?: string;
  titulo?: string;
  tipo?: "DUPLICATA" | "CHEQUE" | "CONTRATO" | "OUTRO";
  valor_liquido?: number;
  vencimento?: string;
  data_operacao?: string;
  meio_pagamento?: "TED" | "PIX" | "ESPECIE" | "CHEQUE" | "OUTRO";
  referencia?: string;
}

/**
 * Registro de operacao para o COAF (factoring). Escopo `analises`. Cada operacao registrada
 * e conferida, e a que precisa de olhar humano volta com `revisar`; a decisao de comunicar
 * ou arquivar e sua, com motivo.
 */
export class Operacoes {
  constructor(private readonly t: Transporte) {}

  /** Registra. Repetir com a mesma chave devolve a mesma operacao, sem cobrar de novo. */
  async registrar(operacao: NovaOperacao, chave?: string): Promise<Record<string, unknown>> {
    return this.t.pedir("POST", "operacoes", {
      corpo: { ...operacao },
      chaveIdempotencia: chave || chaveIdempotencia(),
    });
  }

  /**
   * As operacoes da conta, da mais nova para a mais antiga. Vem o corpo paginado inteiro
   * (`data`, `current_page`, `last_page`, `total`). `revisar` traz so as que esperam decisao.
   */
  async listar(
    filtros: { pagina?: number; porPagina?: number; revisar?: boolean; de?: string; ate?: string } = {},
  ): Promise<Record<string, unknown>> {
    return this.t.pedir("GET", "operacoes", {
      query: {
        page: filtros.pagina,
        per_page: filtros.porPagina,
        revisar: filtros.revisar === undefined ? undefined : filtros.revisar ? 1 : 0,
        de: filtros.de,
        ate: filtros.ate,
      },
      envelope: true,
    });
  }

  async mostrar(id: string): Promise<Record<string, unknown>> {
    return this.t.pedir("GET", `operacoes/${encodeURIComponent(id)}`);
  }

  /** `COMUNICAR` ao COAF ou `ARQUIVAR`, com motivo de 10 a 300 caracteres. */
  async decidir(
    id: string,
    decisao: "COMUNICAR" | "ARQUIVAR",
    motivo: string,
    protocoloCoaf?: string,
  ): Promise<Record<string, unknown>> {
    const corpo: Record<string, unknown> = { decisao, motivo };
    if (protocoloCoaf !== undefined) corpo.protocolo_coaf = protocoloCoaf;
    return this.t.pedir("POST", `operacoes/${encodeURIComponent(id)}/decidir`, { corpo });
  }
}
