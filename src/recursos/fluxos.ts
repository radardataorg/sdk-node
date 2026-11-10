import type { Transporte } from "../transporte.js";

/**
 * Seus proprios fluxos de analise. Escopo `fluxos`.
 *
 * E o jeito de montar o pipeline por codigo, em vez de desenha-lo no painel: voce manda a
 * definicao inteira (entrada, etapas, regras, saidas) e recebe de volta um fluxo publicado,
 * que ja roda com `analises.criar("<slug>", ...)`.
 *
 * O PRECO nao vai no pedido. Ele e calculado a partir das bases que o fluxo consulta, com a
 * tabela de preco da sua conta, e devolvido tanto em `validar()` quanto em `publicar()`.
 *
 * O escopo e separado de `analises` de proposito: um token que so roda analise no dia a dia
 * nao consegue reescrever o pipeline que decide sobre as pessoas da sua base. Use um token
 * de provisionamento aqui.
 */
export class Fluxos {
  constructor(private readonly t: Transporte) {}

  /** Os fluxos desta conta. */
  async listar(): Promise<Record<string, unknown>[]> {
    return this.t.pedir<Record<string, unknown>[]>("GET", "analises/fluxos");
  }

  /** O fluxo, com a definicao publicada e o historico de versoes. */
  async mostrar(slug: string): Promise<Record<string, unknown>> {
    return this.t.pedir("GET", `analises/fluxos/${encodeURIComponent(slug)}`);
  }

  /** Confere a definicao e devolve o preco, sem gravar nada. */
  async validar(definicao: Record<string, unknown>, alvo?: "PF" | "PJ" | "VEICULO"): Promise<Record<string, unknown>> {
    return this.t.pedir("POST", "analises/fluxos/validar", { corpo: alvo ? { definicao, alvo } : { definicao } });
  }

  /**
   * Cria ou republica o fluxo. Idempotente pelo conteudo: a mesma definicao de novo nao
   * cria versao nova, o que deixa chamar isto a cada deploy sem encher o historico.
   */
  async publicar(
    slug: string,
    nome: string,
    alvo: "PF" | "PJ" | "VEICULO",
    definicao: Record<string, unknown>,
    opcoes: { descricao?: string; motivo?: string; exige_finalidade?: boolean; finalidade_padrao?: string } = {},
  ): Promise<Record<string, unknown>> {
    return this.t.pedir("PUT", `analises/fluxos/${encodeURIComponent(slug)}`, {
      corpo: { ...opcoes, nome, alvo, definicao },
    });
  }

  /** Desliga o fluxo. As analises ja feitas continuam com a versao que rodou nelas. */
  async remover(slug: string): Promise<Record<string, unknown>> {
    return this.t.pedir("DELETE", `analises/fluxos/${encodeURIComponent(slug)}`);
  }
}
