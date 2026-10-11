/**
 * Erros do SDK, um por situacao.
 *
 * A api devolve sempre `{"error": {"code": "...", "message": "..."}}`, e o
 * `code` e o que vale para decidir no codigo: a `message` e escrita para
 * pessoa e muda. Por isso ele fica acessivel aqui, e cada classe existe para
 * um `catch` especifico, em vez de obrigar quem integra a comparar strings.
 */
export class ErroRadarData extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string | null = null,
    readonly status: number | null = null,
    /** O corpo cru, para quando o SDK nao previu algo. */
    readonly corpo: Record<string, unknown> = {},
    opcoes?: { cause?: unknown },
  ) {
    super(mensagem, opcoes);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401, token ausente, invalido ou revogado. */
export class NaoAutenticado extends ErroRadarData {}

/** 402, a conta nao tem saldo para esta operacao. */
export class SaldoInsuficiente extends ErroRadarData {}

/** 403, o token existe mas nao tem o escopo daquela rota. */
export class SemEscopo extends ErroRadarData {}

/** 404, recurso inexistente ou de outra empresa. */
export class NaoEncontrado extends ErroRadarData {}

/** 422, o que foi enviado nao passou na validacao. Veja `corpo`. */
export class EntradaInvalida extends ErroRadarData {}

/** 429, teto de chamadas atingido. */
export class MuitasTentativas extends ErroRadarData {}

/** 5xx, falha nossa. */
export class ErroDoServidor extends ErroRadarData {}

/**
 * Nao houve resposta: timeout, DNS, conexao recusada.
 *
 * Separado dos erros com status de proposito: aqui o SDK NAO SABE se a
 * operacao aconteceu. Numa chamada que gasta saldo isso importa, e o jeito de
 * descobrir e consultar pela mesma chave de idempotencia, nao repetir as
 * cegas.
 */
export class FalhaDeRede extends ErroRadarData {}

/** @internal */
export function erroDoStatus(
  status: number,
  mensagem: string,
  codigo: string | null,
  corpo: Record<string, unknown>,
): ErroRadarData {
  if (status === 401) return new NaoAutenticado(mensagem, codigo, status, corpo);
  if (status === 402) return new SaldoInsuficiente(mensagem, codigo, status, corpo);
  if (status === 403) return new SemEscopo(mensagem, codigo, status, corpo);
  if (status === 404) return new NaoEncontrado(mensagem, codigo, status, corpo);
  if (status === 422) return new EntradaInvalida(mensagem, codigo, status, corpo);
  if (status === 429) return new MuitasTentativas(mensagem, codigo, status, corpo);
  if (status >= 500) return new ErroDoServidor(mensagem, codigo, status, corpo);
  return new ErroRadarData(mensagem, codigo, status, corpo);
}
