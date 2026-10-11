import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { confereAssinatura, exigirAssinatura } from "../src/index.js";

/**
 * A conferencia de assinatura e o ponto do SDK em que errar e perigoso: quem
 * aceita um webhook forjado aprova uma verificacao que nunca aconteceu.
 */
describe("assinatura do webhook", () => {
  const SEGREDO = "segredo-do-fluxo";
  const assinar = (corpo: string) => `sha256=${createHmac("sha256", SEGREDO).update(corpo).digest("hex")}`;

  it("aceita a assinatura certa", () => {
    const corpo = '{"event":"verify.completed","outcome":"APROVADO"}';

    expect(confereAssinatura(corpo, assinar(corpo), SEGREDO)).toBe(true);
  });

  it("recusa corpo alterado", () => {
    const corpo = '{"event":"verify.completed","outcome":"REPROVADO"}';
    const assinatura = assinar(corpo);

    // Trocar REPROVADO por APROVADO e exatamente o ataque que isto barra.
    const forjado = corpo.replace("REPROVADO", "APROVADO");

    expect(confereAssinatura(forjado, assinatura, SEGREDO)).toBe(false);
  });

  it("recusa segredo errado", () => {
    const corpo = '{"a":1}';

    expect(confereAssinatura(corpo, assinar(corpo), "outro-segredo")).toBe(false);
  });

  it("recusa assinatura ausente, vazia ou de outro tamanho", () => {
    const corpo = '{"a":1}';

    expect(confereAssinatura(corpo, null, SEGREDO)).toBe(false);
    expect(confereAssinatura(corpo, undefined, SEGREDO)).toBe(false);
    expect(confereAssinatura(corpo, "", SEGREDO)).toBe(false);
    // Tamanho diferente nao pode LANCAR (o timingSafeEqual lança), tem de
    // devolver false.
    expect(confereAssinatura(corpo, "sha256=curta", SEGREDO)).toBe(false);
  });

  it("recusa segredo vazio em vez de aceitar qualquer coisa", () => {
    // Config esquecida nao pode virar "passa tudo".
    const corpo = '{"a":1}';
    const assinatura = `sha256=${createHmac("sha256", "").update(corpo).digest("hex")}`;

    expect(confereAssinatura(corpo, assinatura, "")).toBe(false);
  });

  it("aceita Buffer, que e o que express.raw() entrega", () => {
    const corpo = '{"event":"analise.concluida"}';

    expect(confereAssinatura(Buffer.from(corpo, "utf8"), assinar(corpo), SEGREDO)).toBe(true);
  });

  it("exigir devolve o evento decodificado", () => {
    const corpo = '{"event":"analise.concluida","id":"abc"}';

    expect(exigirAssinatura(corpo, assinar(corpo), SEGREDO)).toMatchObject({ event: "analise.concluida" });
  });

  it("exigir lanca quando nao confere", () => {
    expect(() => exigirAssinatura('{"a":1}', "sha256=errado", SEGREDO)).toThrow(/não confere/i);
  });

  it("reserializar o corpo quebra a conferencia", () => {
    const corpo = '{"event":"verify.completed",  "outcome":"APROVADO"}';
    const assinatura = assinar(corpo);

    // Este teste existe como documentacao executavel do erro mais comum de
    // quem integra: usar express.json() e reserializar em vez de passar o
    // corpo cru muda espacos e ordem, e a assinatura nao bate.
    const reserializado = JSON.stringify(JSON.parse(corpo));

    expect(reserializado).not.toBe(corpo);
    expect(confereAssinatura(reserializado, assinatura, SEGREDO)).toBe(false);
    expect(confereAssinatura(corpo, assinatura, SEGREDO)).toBe(true);
  });
});
