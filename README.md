# RadarData SDK para Node e TypeScript

SDK oficial do [RadarData](https://radardata.com.br) para Node 18+, em
TypeScript, **sem dependência em tempo de execução**. Embrulha a API pública
(`/api/v2`): consultas, Verify (verificação de identidade), Motor de Análises e
webhooks.

A API continua disponível para quem preferir chamá-la direto. Este pacote
existe para você não precisar.

```bash
npm i @radardata/sdk
```

## Começando

```ts
import { RadarData, emReais } from "@radardata/sdk";

const radar = new RadarData({ token: process.env.RADARDATA_TOKEN! });

const saldo = await radar.catalogo.saldo();
console.log(emReais(saldo.centavos));   // 5.000,00
console.log(saldo.disponivelCentavos);  // 500000
```

O token é o **token de API**, criado no painel, e não o da sua sessão do
painel. Ele carrega escopos (`consultas`, `verify`, `analises`, `leitura`,
`webhooks`): uma chamada fora do escopo volta `SemEscopo`.

Funciona em ESM e em CommonJS:

```js
const { RadarData } = require("@radardata/sdk");
```

## Consultas

```ts
const resultado = await radar.consultas.executar("cpf", "12345678909");
```

Gasta saldo. O retorno não é tipado porque cada serviço devolve um corpo
diferente e a lista cresce: tipar tudo aqui faria o SDK desatualizar a cada
serviço novo sem ninguém perceber.

Para saber o que a **sua** conta pode consultar, e por quanto:

```ts
for (const s of await radar.catalogo.servicos()) {
  console.log(`${s.slug}: ${s.nome} (${s.precoCentavos} centavos)`);
}
```

## Verify

```ts
const sessao = await radar.verify.criarSessao(
  "kyc-cnpj",                               // uuid do fluxo ou o alias dele
  { cnpj: "11222333000181" },
  { reference_id: "pedido-4471", redirect_url: "https://seusite.com/ok" },
);

console.log(sessao.url);   // mande a pessoa para cá
```

O resultado chega por **webhook**. Dá para consultar também:

```ts
const atual = await radar.verify.sessao(sessao.id);

if (atual.status === "completed" && atual.resultado === "APROVADO") {
  // ...
}
```

> **Criar sessão não é idempotente.** Se der timeout, **não chame de novo às
> cegas**: você pagaria duas sessões. Mande um `reference_id` seu e procure por
> ele antes de criar outra.

## Análises

Assíncrono: criar devolve o id, o resultado chega por webhook.

```ts
const analise = await radar.analises.criar("kyc-pf", { cpf: "12345678909" });
const estado = await radar.analises.mostrar(String(analise.id));
```

Um `NaoEncontrado` aqui pode querer dizer **"o Motor não está liberado para a
sua conta"**, e não "caminho errado": enquanto ele não está liberado, nada dele
aparece para o cliente, de propósito.

## Webhooks: conferir que o aviso é nosso

```ts
import express from "express";
import { exigirAssinatura } from "@radardata/sdk";

const app = express();

// `express.raw`, NÃO `express.json`: a assinatura é do corpo cru.
app.post("/radardata/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const evento = exigirAssinatura(
    req.body,                                   // Buffer, o corpo CRU
    req.header("X-RadarData-Signature"),
    process.env.RADARDATA_WEBHOOK_SECRET!,
  );

  // Deduplique: reenviamos em caso de falha.
  const entrega = req.header("X-RadarData-Delivery");

  res.status(204).end();
});
```

Três coisas que costumam dar errado aqui, e valem a leitura:

**Use o corpo cru.** `express.raw()`, não `express.json()`. Reserializar muda
espaços e ordem das chaves, o HMAC muda junto e a conferência falha sem motivo
aparente. É o erro mais comum de qualquer integração deste tipo, e há um teste
neste repositório que o demonstra.

**Deduplique pelo `X-RadarData-Delivery`.** Reenviamos quando a entrega falha,
então o mesmo evento pode chegar duas vezes.

**A assinatura prova origem e conteúdo, não a hora.** O timestamp e o id de
entrega viajam em cabeçalho, fora do corpo assinado, então ela não protege
contra o reenvio de um aviso antigo e autêntico por quem o tenha interceptado.
A dedup acima é a defesa prática.

## Erros

Cada situação tem a sua classe, para você não comparar strings:

| Classe | Quando |
|---|---|
| `NaoAutenticado` | 401, token ausente, inválido ou revogado |
| `SaldoInsuficiente` | 402, a conta não tem saldo para a operação |
| `SemEscopo` | 403, o token não tem o escopo daquela rota |
| `NaoEncontrado` | 404 |
| `EntradaInvalida` | 422, veja `.corpo` para os campos |
| `MuitasTentativas` | 429, teto de chamadas |
| `ErroDoServidor` | 5xx, falha nossa |
| `FalhaDeRede` | **sem resposta**: timeout, DNS, conexão recusada |

Todas estendem `ErroRadarData`, que traz `.codigo`, `.status` e `.corpo`. O
`.codigo` é o que vale para decidir no código; a mensagem é escrita para pessoa
e muda.

`FalhaDeRede` é separado de propósito: ali o SDK **não sabe** se a operação
aconteceu. Numa chamada que gasta saldo isso importa, e o caminho é consultar
pela mesma chave de idempotência, não repetir às cegas.

## Teto de chamadas

A API limita por token, **5 requisições por segundo** no plano padrão, e o
grupo de webhooks tem teto próprio. Ao passar do teto vem `MuitasTentativas`
(429); o SDK já respeita o `Retry-After` quando ele aparece.

## Repetição automática, e por que ela não é global

O SDK repete em 429 e 5xx **somente** nas chamadas em que manda
`Idempotency-Key`: consultas, análises e operações. A mesma chave faz a API
devolver a resposta anterior em vez de cobrar de novo.

Criar sessão de Verify **não** tem idempotência na API, então o SDK **não
repete** ali, qualquer que seja a configuração. Repetir criaria uma segunda
sessão faturável, e um SDK que cobra duas vezes do seu cliente é pior do que
um SDK que devolve erro.

A chave é gerada automaticamente quando você não passa uma. Guarde a sua se
quiser poder reconsultar o resultado depois de um timeout:

```ts
import { chaveIdempotencia } from "@radardata/sdk";

const chave = chaveIdempotencia();
await radar.consultas.executar("cpf", "12345678909", {}, chave);
```

## Apontando para outro ambiente

```ts
const radar = new RadarData({
  token: process.env.RADARDATA_TOKEN!,
  base: "https://api.radardata.dev.local/api/v2",
  timeoutMs: 10_000,
});
```

## Desenvolvimento

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Licença

MIT.
