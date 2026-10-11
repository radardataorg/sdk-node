import { type Transporte, chaveIdempotencia } from "../transporte.js";

/**
 * Motor de Analises. Escopo `analises`. GASTA SALDO.
 *
 * E ASSINCRONO: criar devolve o id e o resultado chega por webhook. Consultar
 * em laco funciona, mas o webhook e o caminho previsto; veja
 * `confereAssinatura` para conferir que o aviso e nosso.
 *
 * Um 404 aqui pode querer dizer "o Motor nao esta liberado para a sua conta",
 * e nao "caminho errado": enquanto ele nao esta liberado, nada dele aparece
 * para o cliente, de proposito.
 */
export class Analises {
  constructor(private readonly t: Transporte) {}

  /** Produtos liberados para esta conta. */
  async produtos(): Promise<Record<string, unknown>[]> {
    return this.t.pedir<Record<string, unknown>[]>("GET", "analises/produtos");
  }

  async criar(
    slug: string,
    campos: Record<string, unknown>,
    opcoes: Record<string, unknown> = {},
    chave?: string,
  ): Promise<Record<string, unknown>> {
    return this.t.pedir("POST", `analises/${encodeURIComponent(slug)}`, {
      corpo: { campos, ...opcoes },
      chaveIdempotencia: chave ?? chaveIdempotencia(),
    });
  }

  async mostrar(id: string): Promise<Record<string, unknown>> {
    return this.t.pedir("GET", `analises/${encodeURIComponent(id)}`);
  }

  async decidir(id: string, decisao: string, motivo?: string): Promise<Record<string, unknown>> {
    const corpo: Record<string, unknown> = { decisao };
    if (motivo !== undefined) corpo.motivo = motivo;
    return this.t.pedir("POST", `analises/${encodeURIComponent(id)}/decisao`, { corpo });
  }

  async monitorar(
    slug: string,
    campos: Record<string, unknown>,
    opcoes: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return this.t.pedir("POST", `analises/monitorar/${encodeURIComponent(slug)}`, {
      corpo: { campos, ...opcoes },
    });
  }

  async monitoramentos(): Promise<Record<string, unknown>[]> {
    return this.t.pedir<Record<string, unknown>[]>("GET", "analises/monitoramentos");
  }

  async cancelarMonitoramento(id: string): Promise<Record<string, unknown>> {
    return this.t.pedir("DELETE", `analises/monitoramentos/${encodeURIComponent(id)}`);
  }
}
