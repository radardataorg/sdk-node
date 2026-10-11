import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Confere que o webhook veio mesmo do RadarData.
 *
 * Mandamos `X-RadarData-Signature: sha256=<hmac do CORPO CRU com o seu
 * webhook_secret>`, mais `X-RadarData-Event`, `X-RadarData-Delivery` e
 * `X-RadarData-Timestamp`.
 *
 * O CORPO TEM DE SER O CRU. Em Express e `express.raw()`, nao `express.json()`;
 * reserializar o objeto ja decodificado muda espaco e ordem de chave, o HMAC
 * muda junto e a conferencia falha sem motivo aparente. E o erro mais comum
 * nesta parte, em qualquer integracao.
 *
 * LIMITE QUE VOCE PRECISA CONHECER: o timestamp e o id de entrega viajam em
 * CABECALHO, fora do corpo assinado, entao a assinatura prova a ORIGEM e o
 * CONTEUDO, e nao a hora. Ela nao protege contra reenvio de um aviso antigo e
 * autentico por quem o tenha interceptado. A defesa pratica e guardar o
 * `X-RadarData-Delivery` e ignorar o que ja foi processado, que voce deve
 * fazer de qualquer forma, porque reenviamos em caso de falha.
 */
export function confereAssinatura(
  corpoCru: string | Buffer,
  assinatura: string | null | undefined,
  segredo: string,
): boolean {
  if (!assinatura || !segredo) return false;

  const esperada = `sha256=${createHmac("sha256", segredo).update(corpoCru).digest("hex")}`;

  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(assinatura, "utf8");

  // `timingSafeEqual` exige tamanhos iguais e lança quando diferem; comparar
  // o tamanho antes não vaza nada, porque o tamanho da assinatura é fixo e
  // público.
  if (a.length !== b.length) return false;

  // E não `===`: comparação normal vaza, pelo tempo que leva, quantos bytes
  // iniciais bateram, e com isso dá para descobrir a assinatura byte a byte.
  return timingSafeEqual(a, b);
}

/**
 * Confere e devolve o evento decodificado, ou lança.
 *
 * @throws Error quando a assinatura nao confere
 */
export function exigirAssinatura(
  corpoCru: string | Buffer,
  assinatura: string | null | undefined,
  segredo: string,
): Record<string, unknown> {
  if (!confereAssinatura(corpoCru, assinatura, segredo)) {
    throw new Error("Assinatura do webhook do RadarData não confere.");
  }

  try {
    const dados = JSON.parse(typeof corpoCru === "string" ? corpoCru : corpoCru.toString("utf8"));
    return dados && typeof dados === "object" ? (dados as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
