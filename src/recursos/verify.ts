import { type SessaoVerify, paraSessao } from "../dados.js";
import type { Transporte } from "../transporte.js";

/**
 * Verify: verificacao de identidade. Escopo `verify`. GASTA SALDO.
 *
 * ATENCAO ao criar: esta rota NAO tem idempotencia na api, entao o SDK nao
 * repete a chamada sozinho. Se der timeout, NAO chame de novo as cegas: mande
 * um `reference_id` seu na criacao e, na duvida, procure por ele antes de
 * criar outra, senao voce paga duas sessoes.
 */
export class Verify {
  constructor(private readonly t: Transporte) {}

  /**
   * Cria a sessao e devolve a URL para mandar a pessoa.
   *
   * @param fluxo uuid do fluxo ou o alias dele (ex.: "kyc-cnpj")
   * @param input o que o fluxo pede de entrada (ex.: cpf)
   * @param opcoes prefill, consent, redirect_url, webhook_url, reference_id
   */
  async criarSessao(
    fluxo: string,
    input: Record<string, unknown> = {},
    opcoes: Record<string, unknown> = {},
  ): Promise<SessaoVerify> {
    const corpo: Record<string, unknown> = { flow_id: fluxo, ...opcoes };
    if (Object.keys(input).length > 0) corpo.input = input;

    return paraSessao(await this.t.pedir("POST", "verify/sessions", { corpo }));
  }

  async sessao(id: string): Promise<SessaoVerify> {
    return paraSessao(await this.t.pedir("GET", `verify/sessions/${encodeURIComponent(id)}`));
  }

  async cancelar(id: string): Promise<SessaoVerify> {
    return paraSessao(await this.t.pedir("POST", `verify/sessions/${encodeURIComponent(id)}/cancel`));
  }
}
