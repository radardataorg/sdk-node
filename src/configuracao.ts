/** O que o SDK precisa saber para falar com o RadarData. */
export interface Configuracao {
  /** Token de API da empresa, criado no painel. Nunca o de sessao do painel. */
  token: string;
  /** Base da api. Trocavel para apontar o SDK a um ambiente seu. */
  base?: string;
  /** Milissegundos de espera por resposta. */
  timeoutMs?: number;
  /**
   * Tentativas em chamada IDEMPOTENTE. Vale so onde o SDK manda
   * `Idempotency-Key`; onde nao manda, repetir criaria cobranca nova e o SDK
   * nao repete, qualquer que seja este numero.
   */
  tentativas?: number;
  /** Para teste: um `fetch` seu no lugar do global. */
  fetch?: typeof globalThis.fetch;
}

export const VERSAO = "0.1.0";

/** @internal */
export interface ConfigResolvida extends Required<Omit<Configuracao, "fetch">> {
  fetch: typeof globalThis.fetch;
}

/** @internal */
export function resolver(c: Configuracao): ConfigResolvida {
  if (!c.token) throw new Error("RadarData: token de API é obrigatório.");

  const buscar = c.fetch ?? globalThis.fetch;
  if (typeof buscar !== "function") {
    throw new Error(
      "RadarData: `fetch` não existe neste runtime. Use Node 18 ou mais novo, ou passe um `fetch` na configuração.",
    );
  }

  return {
    token: c.token,
    base: (c.base ?? "https://api.radardata.com.br/api/v2").replace(/\/+$/, ""),
    timeoutMs: c.timeoutMs ?? 30_000,
    tentativas: c.tentativas ?? 3,
    fetch: buscar,
  };
}

/** @internal */
export function userAgent(): string {
  const v = typeof process !== "undefined" ? process.versions?.node : undefined;
  return `radardata-sdk-node/${VERSAO}${v ? ` node/${v}` : ""}`;
}
