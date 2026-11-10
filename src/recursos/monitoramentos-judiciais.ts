import type { Arquivo, Transporte } from "../transporte.js";

/** Uma pagina: os itens e a paginacao (`pagina`, `paginas`, `total`). */
export interface Pagina {
  readonly data: Record<string, unknown>[];
  readonly meta: { pagina?: number; paginas?: number; total?: number };
}

/**
 * Monitoramento judicial: processo, novos processos por CPF, CNPJ, nome ou termo, e
 * diarios oficiais. Escopo `consultas`. GASTA SALDO: cada ciclo de 30 dias e cobrado
 * adiantado, na criacao e a cada renovacao.
 *
 * O aviso de novidade chega por webhook (`monitoramento_judicial.evento`). Cancelar vale
 * ate o fim do periodo pago, sem devolucao.
 *
 * Criar nao repete sozinho em erro: a api ja devolve o mesmo monitoramento quando o
 * pedido e repetido, e uma criacao sem confirmacao e conferida pela RadarData.
 */
export class MonitoramentosJudiciais {
  constructor(private readonly t: Transporte) {}

  /**
   * `servico` e o slug (`monitoramento-documento`, `monitoramento-processo-diario`...), e
   * `entrada` o que ele pede: `documento`, `nome`, `termo` ou `ufs`. `nome` no servico por
   * documento e um nome seu, para achar o monitoramento na lista.
   */
  async criar(servico: string, entrada: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.t.pedir("POST", "monitoramentos-judiciais", { corpo: { ...entrada, servico } });
  }

  async listar(pagina = 1, porPagina = 25): Promise<Pagina> {
    return this.t.pedir<Pagina>("GET", "monitoramentos-judiciais", { query: { page: pagina, per_page: porPagina }, envelope: true });
  }

  async obter(id: string): Promise<Record<string, unknown>> {
    return this.t.pedir("GET", `monitoramentos-judiciais/${encodeURIComponent(id)}`);
  }

  /** Vale ate o fim do periodo pago, sem devolucao, e nao renova. */
  async cancelar(id: string): Promise<Record<string, unknown>> {
    return this.t.pedir("DELETE", `monitoramentos-judiciais/${encodeURIComponent(id)}`);
  }

  /** O que o monitoramento achou. O conteudo some da RadarData em 30 dias: guarde do seu lado. */
  async eventos(id: string, pagina = 1, porPagina = 25): Promise<Pagina> {
    return this.t.pedir<Pagina>("GET", `monitoramentos-judiciais/${encodeURIComponent(id)}/eventos`, {
      query: { page: pagina, per_page: porPagina },
      envelope: true,
    });
  }

  /**
   * PDF da pagina do diario em que saiu um aviso, pelo `conteudo.pagina_pdf` do evento.
   * Vem nulo quando o diario nao informa a pagina.
   */
  async paginaDoDiario(id: string): Promise<Arquivo> {
    return this.t.pedir<Arquivo>("GET", `diarios/paginas/${encodeURIComponent(id)}`, { binario: true });
  }
}
