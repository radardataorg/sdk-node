import { type Transporte, chaveIdempotencia } from "../transporte.js";
import type { Pagina } from "./monitoramentos-judiciais.js";

/** O resultado do envio: a mensagem e o saldo depois dela. */
export interface EnvioDeMensagem {
  /**
   * `id`, `canal`, `para` (mascarado), `status` (`aceita` | `falhou` | `processando`), `erro`, `preco`...
   * No WhatsApp, Messenger e Instagram tambem `direcao`, `conexao` (o `id` do numero, da pagina
   * ou do perfil por onde saiu ou chegou, que e o `de` da resposta), `entregue_em` e `lida_em`.
   */
  readonly mensagem: Record<string, unknown>;
  /** `saldo` e `preco` em centavos, e `sandbox`. */
  readonly meta: { saldo?: number; preco?: number; sandbox?: boolean };
}

/** Um modelo de WhatsApp aprovado na Meta: obrigatorio fora da janela de 24 horas. */
export interface ModeloDeMensagem {
  nome: string;
  /** `pt_BR` quando nao vem. */
  idioma?: string;
  /** Os `{{1}}`, `{{2}}`... do corpo, em ordem. */
  parametros?: string[];
}

/** Os canais de mensagem. */
export type CanalDeMensagem = "sms" | "whatsapp" | "messenger" | "instagram";

/**
 * Messenger e Instagram: `atendimento_humano` deixa responder ate 7 dias depois da ultima
 * mensagem da pessoa, em vez de 24 horas. So para resposta de uma pessoa da sua equipe.
 */
export type EtiquetaDeMensagem = "atendimento_humano";

/**
 * Mensagens: SMS, WhatsApp, Messenger e Instagram no mesmo metodo, mudando so o `canal`.
 * Escopo `mensagens`, que NAO vem ligado por padrao no token. O SMS GASTA SALDO por
 * mensagem aceita; o que falha volta para o saldo. Messenger e Instagram nao cobram por
 * mensagem: cada pagina ou perfil conectado paga uma mensalidade.
 *
 * No SMS o texto sai no alfabeto padrao das operadoras: acento sai antes do envio, e
 * emoji recusa a mensagem (`EntradaInvalida`, codigo `texto_invalido`), sem cobrar.
 *
 * `aceita` quer dizer que saiu para a operadora, nao que chegou no aparelho. O aviso
 * chega pelos webhooks `mensagem.aceita` e `mensagem.falhou`.
 */
export class Mensagens {
  constructor(private readonly t: Transporte) {}

  /**
   * Manda uma mensagem. No SMS e no WhatsApp, `para` e um celular brasileiro
   * (`+5511999999999`, `11999999999` ou `(11) 99999-9999`); no SMS `texto` tem ate 160
   * caracteres. No Messenger e no Instagram, `para` e o id da pessoa, o `de` da mensagem
   * recebida, e `texto` tem ate 2000 (Messenger) ou 1000 (Instagram) caracteres. So da para
   * responder ate 24 horas depois da ultima mensagem da pessoa (`fora_da_janela`), ou ate 7
   * dias com `etiqueta: "atendimento_humano"`.
   *
   * A chave de idempotencia e GERADA quando voce nao passa uma, e e ela que torna seguro
   * repetir: a mesma chave devolve a primeira mensagem, sem mandar nem cobrar de novo, e
   * a de um envio que falhou devolve o mesmo erro. Para codigo de acesso, passe uma chave
   * sua ligada ao pedido (`pedido-48213-codigo`), de 1 a 80 caracteres.
   *
   * Erro `envio_incerto` (`ErroDoServidor`, 504): nao confirmamos se saiu, e nao foi
   * cobrado. Reenviar com chave nova pode fazer a pessoa receber duas.
   */
  async enviar(
    para: string,
    texto: string | null,
    opcoes: {
      canal?: CanalDeMensagem;
      chave?: string;
      /**
       * WhatsApp, Messenger e Instagram: o `id` do numero, da pagina ou do perfil conectado por
       * onde sai (o `conexao` da mensagem recebida). Sem ele, sai pelo principal do canal.
       */
      de?: string;
      /** WhatsApp: modelo aprovado, no lugar do texto. E o que e cobrado. */
      modelo?: ModeloDeMensagem;
      /** Messenger e Instagram: `atendimento_humano` estende a janela de 24 horas para 7 dias. */
      etiqueta?: EtiquetaDeMensagem;
    } = {},
  ): Promise<EnvioDeMensagem> {
    const corpo: Record<string, unknown> = { canal: opcoes.canal ?? "sms", para };
    if (opcoes.modelo) corpo.modelo = { idioma: "pt_BR", parametros: [], ...opcoes.modelo };
    else corpo.texto = texto ?? "";
    if (opcoes.de) corpo.de = opcoes.de;
    if (opcoes.etiqueta) corpo.etiqueta = opcoes.etiqueta;

    const r = await this.t.pedir<{ data: Record<string, unknown>; meta: EnvioDeMensagem["meta"] }>("POST", "mensagens", {
      corpo,
      chaveIdempotencia: opcoes.chave || chaveIdempotencia(),
      envelope: true,
    });
    return { mensagem: r.data, meta: r.meta ?? {} };
  }

  /**
   * Os modelos de WhatsApp de um numero conectado (o principal, sem `de`): `nome`, `idioma`,
   * `status` (`approved`, `pending`, `rejected`), `categoria`, `texto` e quantos `parametros`.
   * Os modelos se criam e se aprovam na Meta.
   */
  async modelos(de?: string): Promise<Record<string, unknown>[]> {
    return this.t.pedir<Record<string, unknown>[]>("GET", "mensagens/modelos", { query: { de } });
  }

  /** As mensagens da conta, da mais nova para a mais antiga, sem o texto. */
  async listar(pagina = 1, porPagina = 25): Promise<Pagina> {
    return this.t.pedir<Pagina>("GET", "mensagens", { query: { page: pagina, per_page: porPagina }, envelope: true });
  }

  /** Uma mensagem, com o `texto` enviado. Depois de 30 dias o texto vem `null`. */
  async obter(id: string): Promise<Record<string, unknown>> {
    return this.t.pedir("GET", `mensagens/${encodeURIComponent(id)}`);
  }
}
