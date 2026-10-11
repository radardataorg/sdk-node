import type { Transporte } from "../transporte.js";

/**
 * Para onde mandamos os eventos, e o segredo que os assina.
 *
 * Escopo `webhooks`, que e proposital e separado: de a um token de
 * PROVISIONAMENTO, nao ao token que o seu servidor usa todo dia. Quem tem
 * este escopo pode redirecionar os seus eventos. O token padrao NAO o tem, e
 * por isso estas chamadas devolvem `SemEscopo` com um token comum.
 */
export class Webhooks {
  constructor(private readonly t: Transporte) {}

  /** Destino atual e o PREFIXO do segredo, nunca o segredo. */
  async atual(): Promise<Record<string, unknown>> {
    return this.t.pedir("GET", "webhooks");
  }

  async definir(url: string, eventos: string[] = []): Promise<Record<string, unknown>> {
    const corpo: Record<string, unknown> = { url };
    if (eventos.length > 0) corpo.eventos = eventos;
    return this.t.pedir("PUT", "webhooks", { corpo });
  }

  async remover(): Promise<Record<string, unknown>> {
    return this.t.pedir("DELETE", "webhooks");
  }

  /**
   * Gira o segredo e devolve o novo, UMA unica vez.
   *
   * Guarde na hora: a consulta nunca mais mostra o valor inteiro. E lembre
   * que girar invalida a assinatura dos avisos em voo.
   */
  async girarSegredo(): Promise<Record<string, unknown>> {
    return this.t.pedir("POST", "webhooks/secret/rotate");
  }

  /** Dispara um evento de teste para o seu endpoint. */
  async testar(url?: string): Promise<Record<string, unknown>> {
    return this.t.pedir("POST", "webhooks/testar", { corpo: url ? { url } : null });
  }
}
