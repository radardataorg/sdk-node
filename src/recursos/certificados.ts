import type { Transporte } from "../transporte.js";

/** Segundo fator de um tribunal: a sigla, os sistemas e o segredo do aplicativo autenticador. */
export interface Autenticacao {
  tribunal: string;
  sistemas: string[];
  secret_2fa: string;
}

/**
 * Certificado digital da sua empresa, usado nas consultas de autos do processo
 * (`processo-autos`, campo `certificado`). Escopo `certificados`, que so o ADMIN da conta
 * concede, e so com token de producao.
 *
 * O arquivo e a senha nunca voltam: a resposta traz titular, validade e os tribunais com
 * segundo fator. Cada certificado serve so a empresa que o cadastrou.
 *
 * Sem idempotencia na api, entao o SDK NAO repete o envio. Mandar o mesmo arquivo de novo
 * devolve o certificado que ja existe, sem criar outro.
 */
export class Certificados {
  constructor(private readonly t: Transporte) {}

  /**
   * @param arquivo caminho do .pfx ou .p12 (so no Node), `Blob` ou bytes, ate 64 KB
   * @param opcoes `nome` seu para achar na lista, e `autenticacoes` dos tribunais que pedem codigo
   */
  async cadastrar(
    arquivo: string | Blob | Uint8Array | ArrayBuffer,
    senha: string,
    opcoes: { nome?: string; autenticacoes?: Autenticacao[] } = {},
  ): Promise<Record<string, unknown>> {
    let conteudo: Blob;
    if (typeof arquivo === "string") {
      const { readFile } = await import("node:fs/promises");
      conteudo = new Blob([await readFile(arquivo)]);
    } else if (arquivo instanceof Blob) {
      conteudo = arquivo;
    } else {
      conteudo = new Blob([arquivo]);
    }

    const formulario = new FormData();
    formulario.append("certificado", conteudo, "certificado.pfx");
    formulario.append("senha", senha);
    if (opcoes.nome !== undefined) formulario.append("nome", opcoes.nome);
    acrescentarAutenticacoes(formulario, opcoes.autenticacoes ?? []);

    return this.t.pedir("POST", "certificados", { formulario });
  }

  async listar(): Promise<Record<string, unknown>[]> {
    return this.t.pedir<Record<string, unknown>[]>("GET", "certificados");
  }

  async obter(id: string): Promise<Record<string, unknown>> {
    return this.t.pedir("GET", `certificados/${encodeURIComponent(id)}`);
  }

  /** Apaga o certificado e o arquivo guardado. Consulta de autos que ainda nao comecou com ele falha e devolve o valor. */
  async remover(id: string): Promise<Record<string, unknown>> {
    return this.t.pedir("DELETE", `certificados/${encodeURIComponent(id)}`);
  }

  /** Acrescenta ou troca o segundo fator de tribunais. O que nao vier fica como esta. */
  async configurarAutenticacoes(id: string, autenticacoes: Autenticacao[]): Promise<Record<string, unknown>> {
    const formulario = new FormData();
    acrescentarAutenticacoes(formulario, autenticacoes);
    return this.t.pedir("POST", `certificados/${encodeURIComponent(id)}/autenticacoes`, { formulario });
  }
}

/** Formulario nao tem lista aninhada: vira `autenticacoes[0][sistemas][1]`, como a api le. */
function acrescentarAutenticacoes(formulario: FormData, autenticacoes: Autenticacao[]): void {
  autenticacoes.forEach((a, i) => {
    formulario.append(`autenticacoes[${i}][tribunal]`, a.tribunal);
    a.sistemas.forEach((s, j) => formulario.append(`autenticacoes[${i}][sistemas][${j}]`, s));
    formulario.append(`autenticacoes[${i}][secret_2fa]`, a.secret_2fa);
  });
}
