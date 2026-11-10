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
      chaveIdempotencia: chave || chaveIdempotencia(),
    });
  }

  async mostrar(id: string): Promise<Record<string, unknown>> {
    return this.t.pedir("GET", `analises/${encodeURIComponent(id)}`);
  }

  /**
   * Responde a analise que parou esperando voce (`pendencia.tipo` = `manual`).
   *
   * O corpo e `acao`, e nao os campos de `pendencia.campos`: aqueles
   * descrevem o formulario que voce mostra para uma pessoa. Ate a 0.2.0 este
   * metodo mandava `decisao`, e a api recusava toda chamada com 422.
   *
   * Ao aprovar, a resposta ja traz o proximo passo: quando e a prova de vida,
   * `pendencia.url` vem aqui, e nao num webhook separado.
   *
   * @param acao `aprovar` ou `recusar`
   * @param opcoes `motivo` (obrigatorio ao recusar) e `responsavel` (alguns produtos exigem)
   */
  async decidir(
    id: string,
    acao: "aprovar" | "recusar",
    opcoes: { motivo?: string; responsavel?: string } = {},
  ): Promise<Record<string, unknown>> {
    const corpo: Record<string, unknown> = { acao: acao.toLowerCase() };
    if (opcoes.motivo !== undefined) corpo.motivo = opcoes.motivo;
    if (opcoes.responsavel !== undefined) corpo.responsavel = opcoes.responsavel;
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
