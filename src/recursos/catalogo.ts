import { type Saldo, type Servico, paraSaldo, paraServico } from "../dados.js";
import type { Transporte } from "../transporte.js";

/** Catalogo e saldo. Escopo `leitura`, nao gasta nada. */
export class Catalogo {
  constructor(private readonly t: Transporte) {}

  /** O que ESTA conta pode consultar, com o preco dela. */
  async servicos(): Promise<Servico[]> {
    const dados = await this.t.pedir<Record<string, unknown>[]>("GET", "servicos");
    return dados.map(paraServico);
  }

  async saldo(): Promise<Saldo> {
    return paraSaldo(await this.t.pedir("GET", "saldo"));
  }
}
