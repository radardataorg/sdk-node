# RadarData SDK para Node e TypeScript

SDK oficial do [RadarData](https://radardata.com.br) para Node 18+, em
TypeScript, **sem dependência em tempo de execução**. Embrulha a API pública
(`/api/v2`): consultas, Verify (verificação de identidade), Motor de Análises,
mensagens (SMS), eventos, registro de operações e webhooks.

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

Consulta demorada responde que está em andamento e avisa pelo webhook
`consulta.concluida`. O resultado sai pelo `consulta_id`:

```ts
const r = await radar.consultas.resultado(consultaId);
// r.meta.status: em_andamento | concluida | erro | expirada; o dado em r.data
```

Erro terminal chega aqui como resposta, em `r.error`, e não como exceção: a
consulta existe, o que falhou foi ela.

### Documentos do processo

`processo-documentos-publicos` e `processo-autos` são consultas demoradas. O
resultado traz `documentos`, cada um com um `id` para baixar. O download não
cobra: o valor foi o da consulta.

```ts
import { writeFile } from "node:fs/promises";

const { data } = await radar.consultas.resultado(consultaId);
for (const d of data.documentos as { id: string }[]) {
  const arquivo = await radar.consultas.baixarDocumento(d.id); // { conteudo, tipo, nome }
  await writeFile(arquivo.nome, arquivo.conteudo);
}
```

Os autos pedem o certificado digital da sua empresa no campo `certificado`:

```ts
await radar.consultas.executar("processo-autos", "0018063-19.2013.8.26.0002", { certificado: certificadoId });
```

### Certificado digital

Escopo `certificados`, que só o administrador da conta concede, e só com token
de produção. O arquivo e a senha não voltam em nenhuma resposta, e cada
certificado serve só à sua empresa.

```ts
const c = await radar.certificados.cadastrar("/caminho/escritorio.pfx", process.env.SENHA_DO_PFX!, {
  nome: "Escritório SP",
  // Só para tribunais que pedem código do aplicativo autenticador.
  autenticacoes: [{ tribunal: "TRF2", sistemas: ["EPROC-TRF2"], secret_2fa: process.env.SEGREDO_2FA! }],
});
const certificadoId = String(c.id);

await radar.certificados.listar();
await radar.certificados.remover(certificadoId);
```

Mandar o mesmo arquivo de novo devolve o certificado que já existe. O envio
não é repetido sozinho em erro.

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
  console.log(atual.valorCentavos);   // quanto a sessão custou para você
}
```

`custoCentavos` continua existindo com o mesmo número, mas está depreciado: use
`valorCentavos`.

> **Criar sessão não é idempotente.** Se der timeout, **não chame de novo às
> cegas**: você pagaria duas sessões. Mande um `reference_id` seu e procure por
> ele antes de criar outra.

## Análises

Assíncrono: criar devolve o id, o resultado chega por webhook.

```ts
const analise = await radar.analises.criar(
  "kyc-pf",
  { cpf: "12345678909" },
  {},
  "cadastro-90321",   // um id seu: repetir não cobra de novo
);
const estado = await radar.analises.mostrar(String(analise.id));
```

### Documentos

Produtos que leem documentos recebem o arquivo **antes** da análise. Você envia,
guarda o `id` e manda na entrada:

```ts
const identidade = await radar.documentos.enviar("/tmp/rg.jpg", "identidade");
const contrato = await radar.documentos.enviar(bytesDoPdf, "contrato_social", "contrato.pdf");

await radar.analises.criar("abertura-de-conta", {
  cpf: "52998224725",
  cnpj: "55016784000138",
  documentos: [
    { id: identidade.id, tipo: "identidade" },
    { id: contrato.id, tipo: "contrato_social" },
  ],
});
```

Aceita caminho de arquivo (só no Node), `Blob` ou bytes. JPEG, PNG ou PDF, até
10 MB; os tipos estão em `TIPOS_DE_DOCUMENTO`. Documento que não entra em
análise nenhuma expira em 24 horas. O envio **não se repete sozinho**: a API
não tem idempotência ali.

### Quando a decisão é sua

Quando a análise para esperando o seu time (`pendencia.tipo` = `manual` no
evento `analise.pendente`), responda:

```ts
const r = await radar.analises.decidir(id, "aprovar", {
  motivo: "Confirmado com o titular.",   // obrigatório ao recusar
  responsavel: "ana@sualoja.com.br",     // alguns produtos exigem
});

// Se o próximo passo é a prova de vida, o link já vem aqui:
const link = (r.pendencia as { url?: string } | undefined)?.url;
```

> Até a 0.2.0 este método mandava `decisao` e a API recusava toda chamada com
> 422. A partir da 0.3.0 manda `acao`, que é o contrato da API.

Um `NaoEncontrado` aqui pode querer dizer **"o Motor não está liberado para a
sua conta"**, e não "caminho errado": enquanto ele não está liberado, nada dele
aparece para o cliente, de propósito.

### Seus próprios fluxos

Quem monta o pipeline por código usa `radar.fluxos`, com um token de escopo
`fluxos`, separado do de `analises` de propósito:

```ts
const { preco } = await radar.fluxos.validar(definicao, "PF");   // não grava nada
await radar.fluxos.publicar("meu-kyc", "Meu KYC", "PF", definicao); // mesma definição não cria versão nova
await radar.analises.criar("meu-kyc", { cpf: "12345678909" });
```

Também há `listar()`, `mostrar(slug)` e `remover(slug)`.

## Mensagens (SMS)

Escopo `mensagens`, que **não vem ligado por padrão**: marque ao criar o token.
Cobra por mensagem aceita; o que falha volta para o saldo.

```ts
const { mensagem, meta } = await radar.mensagens.enviar(
  "+5511999999999",
  "Seu código de acesso é 482913.",
  { chave: "pedido-48213-codigo" },   // repetir com a mesma chave não manda de novo
);

mensagem.status;   // "aceita": saiu para a operadora
meta.saldo;        // em centavos
```

- Até 160 caracteres. **Acento sai** antes do envio e **emoji recusa** a
  mensagem (`EntradaInvalida`, `codigo` = `texto_invalido`), sem cobrar.
- `aceita` não é entrega confirmada: para código de acesso, ofereça reenviar.
- `envio_incerto` (`ErroDoServidor`, 504): não confirmamos se saiu e não foi
  cobrado. Reenviar com chave nova pode fazer a pessoa receber duas.
- `limite_destino` e `limite_diario` (`MuitasTentativas`): 5 por número por
  hora e 1.000 por conta por dia.
- O aviso chega pelos webhooks `mensagem.aceita` e `mensagem.falhou`.
- **A resposta se perdeu?** O erro traz a chave usada em `erro.chaveIdempotencia`.
  Repita com **ela**: `Conflito` (`idempotency_em_processamento`) quer dizer que
  a primeira ainda está saindo; espere e repita com a mesma chave. Chave nova
  pode fazer a pessoa receber duas. Para código de acesso, passe sempre uma
  chave sua.

```ts
const { data, meta: paginacao } = await radar.mensagens.listar(1, 25); // sem o texto
const uma = await radar.mensagens.obter(id);                           // com o texto, por 30 dias
```

## Eventos

O seu sistema conta o que aconteceu e a configuração do lado da RadarData
decide que análises acordam. Evento sem gatilho configurado não é erro.

```ts
const r = await radar.eventos.enviar("pedido.criado", `pedido-${pedido.id}`, { valor: 15000 }, {
  segredo: process.env.RADARDATA_EVENTOS_SECRET,  // quando a origem exige assinatura
});
```

## Operações (COAF)

Para factoring: cada operação registrada é conferida, e a que precisa de olhar
humano volta com `revisar`.

```ts
const op = await radar.operacoes.registrar(
  { cliente_documento: "11222333000181", sacado_documento: "52998224725", valor: 150000 },
  `operacao-${titulo}`,   // repetir não cobra de novo
);
const pendentes = await radar.operacoes.listar({ revisar: true });
await radar.operacoes.decidir(String(op.id), "ARQUIVAR", "Operação conferida com o cliente.");
```

## Monitoramentos judiciais

Cobrança adiantada a cada 30 dias. A novidade chega pelo webhook
`monitoramento_judicial.evento`, com o conteúdo, que some da RadarData em 30 dias.

```ts
const m = await radar.monitoramentosJudiciais.criar("monitoramento-documento", { documento: "12345678909", nome: "Fornecedor principal" });
const { data: eventos, meta } = await radar.monitoramentosJudiciais.eventos(String(m.id)); // meta.paginas
await radar.monitoramentosJudiciais.cancelar(String(m.id)); // vale até o fim do período pago
```

O aviso de diário oficial traz `conteudo.pagina_pdf` quando o diário informa a
página:

```ts
if (evento.conteudo.pagina_pdf) {
  const pdf = await radar.monitoramentosJudiciais.paginaDoDiario(evento.conteudo.pagina_pdf);
}
```

No catálogo, `servico.monitoramento` diz quais serviços se usam assim, e
`servico.rota`, onde.

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
| `Conflito` | 409, a mesma chave ainda em andamento ou usada em outro pedido |
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
`Idempotency-Key`: consultas, análises, mensagens, eventos e operações. A mesma
chave faz a API devolver a resposta anterior em vez de cobrar de novo. Não
repete o que a mesma chave devolveria igual (`limite_destino`, `limite_diario`,
`teto_excedido`, `envio_incerto`, `envio_recusado`), e todo erro traz a chave
usada em `erro.chaveIdempotencia`.

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

# contrato contra uma api de verdade, com token de SANDBOX
RADARDATA_CONTRATO_BASE=http://127.0.0.1:8000/api/v2 RADARDATA_CONTRATO_TOKEN=... npm run contrato
```

## Licença

MIT.
