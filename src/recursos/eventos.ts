import { createHmac } from "node:crypto";
import type { Transporte } from "../transporte.js";

/**
 * Gatilho por evento. Escopo `analises`. Seu sistema conta o que aconteceu (`pedido.criado`,
 * `cliente.atualizado`) e a configuracao do lado da RadarData decide que analises acordam.
 * Evento sem gatilho configurado nao e erro: volta com a lista de analises vazia.
 *
 * A `chave` e o seu id do evento: se ele ja acordou analise, mandar a mesma chave de novo
 * devolve `repetido: true` e nao acorda nada outra vez, por isso o SDK pode repetir em falha.
 */
export class Eventos {
  constructor(private readonly t: Transporte) {}

  /**
   * Quando a origem de eventos da sua conta exige assinatura, passe o `segredo` dela: o SDK
   * assina o corpo exato que manda, em `X-RadarData-Signature`.
   */
  async enviar(
    evento: string,
    chave: string,
    dados: Record<string, unknown> = {},
    opcoes: { segredo?: string } = {},
  ): Promise<Record<string, unknown>> {
    const corpo = { evento, chave, dados };
    const cabecalhos: Record<string, string> = {};
    // O transporte serializa com o mesmo `JSON.stringify`, entao o HMAC e do corpo que sai.
    if (opcoes.segredo) {
      cabecalhos["X-RadarData-Signature"] = `sha256=${createHmac("sha256", opcoes.segredo).update(JSON.stringify(corpo)).digest("hex")}`;
    }
    return this.t.pedir("POST", "eventos", { corpo, cabecalhos, chaveIdempotencia: chave, envelope: true });
  }
}
