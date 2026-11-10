import { type Transporte, chaveIdempotencia } from "../transporte.js";
import type { Pagina } from "./monitoramentos-judiciais.js";

/** O resultado do envio: a mensagem e o saldo depois dela. */
export interface EnvioDeMensagem {
  /** `id`, `canal`, `para` (mascarado), `status` (`aceita` | `falhou` | `processando`), `erro`, `preco`... */
  readonly mensagem: Record<string, unknown>;
  /** `saldo` e `preco` em centavos, e `sandbox`. */
  readonly meta: { saldo?: number; preco?: number; sandbox?: boolean };
}

/**
 * Mensagens: SMS hoje, WhatsApp, Instagram e Messenger no mesmo metodo depois, mudando so
 * o `canal`. Escopo `mensagens`, que NAO vem ligado por padrao no token. GASTA SALDO por
 * mensagem aceita; o que falha volta para o saldo.
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
   * Manda uma mensagem. `para` e um celular brasileiro (`+5511999999999`,
   * `11999999999` ou `(11) 99999-9999`), e `texto` tem ate 160 caracteres.
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
    texto: string,
    opcoes: { canal?: "sms"; chave?: string } = {},
  ): Promise<EnvioDeMensagem> {
    const r = await this.t.pedir<{ data: Record<string, unknown>; meta: EnvioDeMensagem["meta"] }>("POST", "mensagens", {
      corpo: { canal: opcoes.canal ?? "sms", para, texto },
      chaveIdempotencia: opcoes.chave || chaveIdempotencia(),
      envelope: true,
    });
    return { mensagem: r.data, meta: r.meta ?? {} };
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
