import { type Transporte, chaveIdempotencia } from "../transporte.js";

/**
 * Consultas. Escopo `consultas`. GASTA SALDO.
 *
 * O retorno vem como objeto solto e nao tipado de proposito: cada servico
 * devolve um corpo diferente, a lista cresce, e tipar tudo aqui faria o SDK
 * desatualizar a cada servico novo sem ninguem perceber.
 */
export class Consultas {
  constructor(private readonly t: Transporte) {}

  /**
   * Executa uma consulta pelo slug do servico.
   *
   * A chave de idempotencia e GERADA quando voce nao passa uma, e e ela que
   * torna seguro repetir: a mesma chave devolve a mesma resposta em vez de
   * cobrar de novo. Guarde a sua se quiser poder reconsultar o resultado
   * depois de um timeout.
   */
  async executar(
    slug: string,
    documento: string,
    extras: Record<string, unknown> = {},
    chave?: string,
  ): Promise<Record<string, unknown>> {
    return this.t.pedir("POST", slug, {
      corpo: { documento, ...extras },
      chaveIdempotencia: chave ?? chaveIdempotencia(),
    });
  }
}
