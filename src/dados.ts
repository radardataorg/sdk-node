/** Tipos do que a api devolve, onde tipar compensa. */

/**
 * Saldo da conta, em CENTAVOS.
 *
 * Centavo inteiro, nunca float: o sistema inteiro guarda dinheiro assim, e
 * converter para ponto flutuante aqui reintroduziria o erro de
 * arredondamento que o inteiro existe para evitar.
 */
export interface Saldo {
  readonly centavos: number;
  /** O que da para gastar agora: desconta o que ja esta reservado. */
  readonly disponivelCentavos: number;
  /** PRE (saldo) ou POS (fatura). */
  readonly modoCobranca: string;
}

/**
 * Um servico do catalogo, com o preco DAQUELA conta.
 *
 * O preco vem resolvido por empresa: duas contas podem ver precos diferentes
 * para o mesmo slug, e por isso ele nao e constante no SDK.
 */
export interface Servico {
  readonly slug: string;
  readonly nome: string;
  readonly categoria: string | null;
  readonly descricao: string | null;
  /** CPF, CNPJ, PLACA... o que a consulta espera receber. */
  readonly tipoDocumento: string | null;
  readonly precoCentavos: number;
}

/**
 * Uma sessao de Verify.
 *
 * `url` so vem na CRIACAO: e o link que voce manda para a pessoa. Depois
 * disso a consulta devolve estado e resultado, e nao o link de novo.
 */
export interface SessaoVerify {
  readonly id: string;
  /** pending, in_progress, completed, expired, canceled. */
  readonly status: string;
  readonly url: string | null;
  /** APROVADO, REPROVADO, REVISAO_MANUAL; null enquanto nao concluiu. */
  readonly resultado: string | null;
  readonly expiraEm: string | null;
  readonly referenceId: string | null;
  /** Quanto este run custou para voce, em centavos. */
  readonly custoCentavos: number;
  /** O corpo cru, para o que o SDK nao tipou. */
  readonly cru: Record<string, unknown>;
}

/** @internal */
export function paraSaldo(d: Record<string, unknown>): Saldo {
  return {
    centavos: Number(d.saldo ?? 0),
    disponivelCentavos: Number(d.saldo_disponivel ?? 0),
    modoCobranca: String(d.modo_cobranca ?? ""),
  };
}

/** @internal */
export function paraServico(d: Record<string, unknown>): Servico {
  return {
    slug: String(d.slug ?? ""),
    nome: String(d.nome ?? ""),
    categoria: (d.categoria as string | null) ?? null,
    descricao: (d.descricao as string | null) ?? null,
    tipoDocumento: (d.tipo_documento as string | null) ?? null,
    precoCentavos: Number(d.preco ?? 0),
  };
}

/** @internal */
export function paraSessao(d: Record<string, unknown>): SessaoVerify {
  return {
    id: String(d.session_id ?? ""),
    status: String(d.status ?? ""),
    url: (d.url as string | null) ?? null,
    resultado: (d.outcome as string | null) ?? null,
    expiraEm: (d.expires_at as string | null) ?? null,
    referenceId: (d.reference_id as string | null) ?? null,
    custoCentavos: Number(d.custo_total_centavos ?? 0),
    cru: d,
  };
}

/** Em reais, para exibir. O calculo continua em centavos. */
export function emReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
