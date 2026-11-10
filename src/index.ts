import { type Configuracao, resolver } from "./configuracao.js";
import { Analises } from "./recursos/analises.js";
import { Catalogo } from "./recursos/catalogo.js";
import { Certificados } from "./recursos/certificados.js";
import { Consultas } from "./recursos/consultas.js";
import { Fluxos } from "./recursos/fluxos.js";
import { Mensagens } from "./recursos/mensagens.js";
import { Documentos } from "./recursos/documentos.js";
import { Eventos } from "./recursos/eventos.js";
import { MonitoramentosJudiciais } from "./recursos/monitoramentos-judiciais.js";
import { Operacoes } from "./recursos/operacoes.js";
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

  /** Documentos que entram numa analise, enviados antes dela. Escopo `analises`. */
  readonly documentos: Documentos;

  /** Gatilho por evento: seu sistema conta o que aconteceu e as analises acordam. Escopo `analises`. */
  readonly eventos: Eventos;

  /** Registro de operacao para o COAF (factoring). Escopo `analises`. */
  readonly operacoes: Operacoes;

  /** Seus proprios fluxos de analise, provisionados por codigo. Escopo `fluxos`. */
  readonly fluxos: Fluxos;

  /** SMS, e depois os outros canais no mesmo metodo. Escopo `mensagens`. */
  readonly mensagens: Mensagens;

  readonly monitoramentosJudiciais: MonitoramentosJudiciais;

  /** Certificado digital da empresa, para os autos do processo. Escopo `certificados`, so do ADMIN. */
  readonly certificados: Certificados;

  readonly webhooks: Webhooks;

  constructor(config: Configuracao) {
    const t = new Transporte(resolver(config));

    this.catalogo = new Catalogo(t);
    this.consultas = new Consultas(t);
    this.verify = new Verify(t);
    this.analises = new Analises(t);
    this.documentos = new Documentos(t);
    this.eventos = new Eventos(t);
    this.operacoes = new Operacoes(t);
    this.fluxos = new Fluxos(t);
    this.mensagens = new Mensagens(t);
    this.monitoramentosJudiciais = new MonitoramentosJudiciais(t);
    this.certificados = new Certificados(t);
    this.webhooks = new Webhooks(t);
  }
}

export { type Arquivo, chaveIdempotencia } from "./transporte.js";
export { confereAssinatura, exigirAssinatura } from "./webhooks/assinatura.js";
export { emReais } from "./dados.js";
export type { Configuracao } from "./configuracao.js";
export type { Saldo, Servico, SessaoVerify } from "./dados.js";
export {
  Conflito,
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
export { type Autenticacao, Certificados } from "./recursos/certificados.js";
export { Catalogo } from "./recursos/catalogo.js";
export { Consultas } from "./recursos/consultas.js";
export { Documentos, TIPOS_DE_DOCUMENTO, type TipoDeDocumento } from "./recursos/documentos.js";
export { Eventos } from "./recursos/eventos.js";
export { Fluxos } from "./recursos/fluxos.js";
export { type NovaOperacao, Operacoes } from "./recursos/operacoes.js";
export { type EnvioDeMensagem, Mensagens, type ModeloDeMensagem } from "./recursos/mensagens.js";
export { MonitoramentosJudiciais, type Pagina } from "./recursos/monitoramentos-judiciais.js";
export { Verify } from "./recursos/verify.js";
export { Webhooks } from "./recursos/webhooks.js";
