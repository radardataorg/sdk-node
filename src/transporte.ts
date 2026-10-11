import { type ConfigResolvida, userAgent } from "./configuracao.js";
import { ErroRadarData, FalhaDeRede, erroDoStatus } from "./erros.js";

/**
 * O transporte: fala HTTP com a `/api/v2` e traduz resposta em dado ou erro.
 *
 * Tres decisoes que valem o comentario, porque sao as que diferenciam um SDK
 * de um `fetch` embrulhado:
 *
 * 1. RETRY SO ONDE E SEGURO. A api aceita `Idempotency-Key` em consulta,
 *    analise e operacao, e e so nessas que repetir e seguro: a mesma chave
 *    devolve a mesma resposta em vez de cobrar de novo. Criar sessao de
 *    Verify NAO tem idempotencia, entao repetir ali criaria uma segunda
 *    sessao faturavel. Por isso o retry nao e uma opcao global: ele e ligado
 *    por chamada, e so quando o SDK manda a chave.
 * 2. A CHAVE E GERADA PELO SDK quando quem chama nao passa uma. Deixar isso
 *    para o integrador significa, na pratica, ninguem usar, e e justamente o
 *    caso em que a falha doi: timeout numa consulta paga.
 * 3. FALHA SEM RESPOSTA NAO E ERRO DE SERVIDOR. `FalhaDeRede` existe porque
 *    nesse caso nao se sabe se a operacao aconteceu, e a acao correta e
 *    consultar pela chave, nao repetir as cegas.
 */
export class Transporte {
  constructor(private readonly config: ConfigResolvida) {}

  async pedir<T = Record<string, unknown>>(
    metodo: string,
    caminho: string,
    opcoes: {
      corpo?: Record<string, unknown> | null;
      query?: Record<string, string | number | undefined>;
      chaveIdempotencia?: string;
    } = {},
  ): Promise<T> {
    const { corpo, query, chaveIdempotencia } = opcoes;

    const cabecalhos: Record<string, string> = {
      Authorization: `Bearer ${this.config.token}`,
      Accept: "application/json",
      "User-Agent": userAgent(),
    };

    // Repetir so e seguro com a chave: sem ela, uma consulta cobrada duas
    // vezes seria dinheiro do cliente.
    const podeRepetir = typeof chaveIdempotencia === "string" && chaveIdempotencia !== "";
    if (podeRepetir) cabecalhos["Idempotency-Key"] = chaveIdempotencia;
    if (corpo != null) cabecalhos["Content-Type"] = "application/json";

    let url = `${this.config.base}/${caminho.replace(/^\/+/, "")}`;
    if (query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined) q.set(k, String(v));
      if ([...q].length > 0) url += `?${q.toString()}`;
    }

    const tentativas = podeRepetir ? this.config.tentativas : 1;
    let ultimo: ErroRadarData | null = null;

    for (let i = 1; i <= tentativas; i++) {
      const abortar = new AbortController();
      const relogio = setTimeout(() => abortar.abort(), this.config.timeoutMs);

      let resposta: Response;
      try {
        resposta = await this.config.fetch(url, {
          method: metodo,
          headers: cabecalhos,
          body: corpo != null ? JSON.stringify(corpo) : undefined,
          signal: abortar.signal,
        });
      } catch (e) {
        ultimo = new FalhaDeRede(
          `Não foi possível falar com o RadarData: ${e instanceof Error ? e.message : String(e)}`,
          "falha_de_rede",
          null,
          {},
          { cause: e },
        );
        if (i < tentativas) {
          await this.esperar(i);
          continue;
        }
        throw ultimo;
      } finally {
        clearTimeout(relogio);
      }

      // 429 e 5xx valem nova tentativa; o resto e resposta final.
      if ((resposta.status === 429 || resposta.status >= 500) && i < tentativas) {
        await this.esperar(i, resposta);
        continue;
      }

      return (await this.interpretar(resposta)) as T;
    }

    throw ultimo ?? new ErroRadarData("Falha desconhecida no transporte.");
  }

  private async interpretar(resposta: Response): Promise<unknown> {
    const cru = await resposta.text();
    let json: unknown;
    try {
      json = cru === "" ? {} : JSON.parse(cru);
    } catch {
      json = {};
    }
    const corpo = (json ?? {}) as Record<string, unknown>;

    if (resposta.ok) {
      // `data` quando a rota embrulha (catalogo, saldo, analises) e o corpo
      // inteiro quando nao (sessao de Verify). Devolver sempre o conteudo
      // util poupa quem chama de saber qual rota faz o que.
      return "data" in corpo && corpo.data !== null && typeof corpo.data === "object" ? corpo.data : corpo;
    }

    const erro = (corpo.error ?? {}) as { code?: string; message?: string };
    const mensagem =
      erro.message ?? (corpo.message as string | undefined) ?? `O RadarData respondeu ${resposta.status} sem detalhe.`;

    throw erroDoStatus(resposta.status, mensagem, erro.code ?? null, corpo);
  }

  /** Espera entre tentativas, respeitando `Retry-After` quando ele vem. */
  private async esperar(tentativa: number, resposta?: Response): Promise<void> {
    const cabecalho = Number(resposta?.headers.get("Retry-After") ?? 0);

    if (cabecalho > 0) {
      await new Promise((r) => setTimeout(r, Math.min(cabecalho, 30) * 1000));
      return;
    }

    // Recuo exponencial com um pouco de aleatorio, para muitos clientes
    // falhando juntos nao voltarem todos no mesmo instante.
    const base = Math.min(8, 2 ** (tentativa - 1));
    await new Promise((r) => setTimeout(r, base * 1000 + Math.random() * 250));
  }
}

/** Chave nova de idempotencia, no formato que a api aceita. */
export function chaveIdempotencia(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
