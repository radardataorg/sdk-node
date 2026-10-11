import { type Configuracao, resolver } from "./configuracao.js";
import { Analises } from "./recursos/analises.js";
import { Catalogo } from "./recursos/catalogo.js";
import { Consultas } from "./recursos/consultas.js";
import { Verify } from "./recursos/verify.js";
import { Webhooks } from "./recursos/webhooks.js";
import { Transporte } from "./transporte.js";

/**
 * Ponto de entrada do SDK.
 *
 * ```ts
 * import { RadarData } from "@radardata/sdk";
 *
 * const radar = new RadarData({ token: process.env.RADARDATA_TOKEN! });
 * const saldo = await radar.catalogo.saldo();
 * ```
 *
 * O token e o de API, criado no painel, e NAO o de sessao do painel. Ele
 * carrega escopos: uma chamada fora do escopo do token volta `SemEscopo`, e
 * isso e proposital, para um token de servidor nao poder redirecionar os seus
 * webhooks.
 */
export class RadarData {
  readonly catalogo: Catalogo;

  readonly consultas: Consultas;

  readonly verify: Verify;

  readonly analises: Analises;

  readonly webhooks: Webhooks;

  constructor(config: Configuracao) {
    const t = new Transporte(resolver(config));

    this.catalogo = new Catalogo(t);
    this.consultas = new Consultas(t);
    this.verify = new Verify(t);
    this.analises = new Analises(t);
    this.webhooks = new Webhooks(t);
  }
}

export { chaveIdempotencia } from "./transporte.js";
export { confereAssinatura, exigirAssinatura } from "./webhooks/assinatura.js";
export { emReais } from "./dados.js";
export type { Configuracao } from "./configuracao.js";
export type { Saldo, Servico, SessaoVerify } from "./dados.js";
export {
  EntradaInvalida,
  ErroDoServidor,
  ErroRadarData,
  FalhaDeRede,
  MuitasTentativas,
  NaoAutenticado,
  NaoEncontrado,
  SaldoInsuficiente,
  SemEscopo,
} from "./erros.js";
export { Analises } from "./recursos/analises.js";
export { Catalogo } from "./recursos/catalogo.js";
export { Consultas } from "./recursos/consultas.js";
export { Verify } from "./recursos/verify.js";
export { Webhooks } from "./recursos/webhooks.js";
