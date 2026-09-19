# Tarefas pendentes

Backlog do que **já foi identificado mas ainda não foi pedido**. Não é um plano
de produto: é a lista das dívidas e pontas soltas que apareceram enquanto outra
coisa era feita, com o porquê de cada uma, pra ninguém ter que redescobrir o
raciocínio depois.

**Combinado:** ler este arquivo antes de começar qualquer tarefa, pra saber onde
estamos. Quando um item for feito, sair daqui e virar commit — e quando for
descartado, descer pra "Decididos a não fazer" com o motivo, em vez de sumir.

Última revisão: 2026-09-19.

---

## Segurança e autenticação

### 1. O master não tem limite de tentativas de login

A conta com mais poder no sistema é a única sem trava de força bruta. Em
[`src/app/api/auth/login/route.ts`](src/app/api/auth/login/route.ts), o caminho
do master compara a senha e segue; as 3 tentativas erradas e o `isActive` que
bloqueiam todo mundo vivem só na tabela `users` do tenant. A tabela
`master_users` ([`prisma/catalog/schema.prisma`](prisma/catalog/schema.prisma))
não tem nem `is_active` nem `failed_login_attempts` — e ela fica no catalog, que
é o banco de onde saem todas as empresas.

Pede duas colunas novas e migration no catalog. A parte a pensar é o desbloqueio:
o admin de empresa libera o usuário comum, mas quem libera o master? Provavelmente
só expiração por tempo, senão a trava vira um jeito de derrubar o sistema inteiro.

**Peso:** médio. É o item mais sério da lista.

### 2. Trocar a senha não derruba as outras sessões

O JWT é auto-contido, vale 30 dias e não existe lista de revogação: depois de
`PUT /api/settings/password`, quem estiver logado em outro dispositivo com o
cookie antigo continua dentro. Está comentado na rota
([`src/app/api/settings/password/route.ts`](src/app/api/settings/password/route.ts))
e avisado na tela, mas é exatamente o que alguém espera que a troca resolva.

O caminho seria versionar o token: um contador na conta, incrementado na troca e
conferido a cada request. O complicador é que a checagem natural fica no
[`src/proxy.ts`](src/proxy.ts), que roda no Edge e de propósito não acessa banco
— foi por isso que `allowedMenus` acabou embutido no próprio JWT. Ou a conferência
desce pras rotas, ou o proxy ganha uma consulta.

**Peso:** médio.

### 3. "Esqueci minha senha" não atende o master — adiado de propósito

`POST /api/auth/forgot-password` só consulta a tabela `users` do tenant, então
um pedido com o e-mail do master cai no `if (!user)`, responde `{ ok: true }` e
não manda nada. Silêncio, que é pior do que recusar.

Foi adiado com motivo, não esquecido: a conta SMTP é única do sistema e só o
master configura (`requireMaster()` em
[`src/app/api/settings/smtp/route.ts`](src/app/api/settings/smtp/route.ts)), então
recuperar master por e-mail é circular — a pessoa trancada pra fora é a mesma que
conserta o envio. O `UPDATE master_users` pelo psql continua sendo o fundo do poço
de qualquer jeito, e a tela de trocar a senha logado já cobre o caso do dia a dia.

Se um dia for feito: token com `kind` próprio (o `self_reset` de hoje aplica no
tenant), aplicado no catalog pelo `/ativar`.

**Peso:** baixo. Só vale se aparecer um segundo master, ou se o de hoje perder a
senha com o SMTP no ar.

---

## Infraestrutura

### 4. O rate limiter vive na memória do processo

[`src/lib/server/rate-limit.ts`](src/lib/server/rate-limit.ts) conta em um `Map`
local. Com mais de uma instância atrás do balanceador, cada uma conta o seu
quinhão e o limite efetivo vira N × o configurado. Já está comentado no arquivo.

Para a instalação atual — um container — está **correto**, e trocar agora seria
complicar de graça. Vira dívida de verdade no dia da primeira réplica; aí o
contador muda de casa (Redis, ou uma tabela no catalog).

Hoje dependem dele: `forgot-password` (3/h por conta, 10/h por IP) e
`settings/password` (5/15min por conta).

**Peso:** nenhum hoje; bloqueante no dia em que escalar.

---

## Limpeza

### 5. `eslint` inválido no next.config.ts

[`next.config.ts`](next.config.ts) tem `eslint: { ignoreDuringBuilds: true }`,
chave que o Next 16 não aceita mais. O `npm run type-check` acusa como erro e o
`next dev` avisa em toda subida. O `typescript: { ignoreBuildErrors: true }` ao
lado continua válido e tem motivo (poupa RAM no build do container, que dava OOM
em VPS enxuto) — é só a linha do eslint.

Antes de remover, confirmar como o Next 16 quer que o lint seja pulado no build,
pra não reintroduzir o passo pesado que a linha existia pra evitar.

**Peso:** pequeno, mas suja toda execução de type-check.

### 6. `SmtpConfig` órfão no schema do tenant

[`prisma/schema.prisma`](prisma/schema.prisma) ainda declara `model SmtpConfig`,
com o comentário de que é preenchido pelo master nas Configurações. Só que o
[`src/lib/server/mailer.ts`](src/lib/server/mailer.ts) usa `SystemSmtpConfig`, do
catalog — e o próprio arquivo explica por quê: a conta de envio é única do
sistema, e quando era por tenant o convite de uma empresa tentava usar um SMTP
que só o master havia preenchido. Nada em `src/` referencia `smtpConfig`.

Confirmar que a tabela está de fato vazia/sem uso e derrubar modelo e tabela numa
migration. Enquanto ficar, é uma armadilha pra quem for mexer em e-mail e achar
primeiro o modelo errado.

**Peso:** pequeno.

---

## Decididos a não fazer

Nada aqui ainda. Item descartado desce pra cá com o motivo — serve pra não
reabrirmos a mesma discussão daqui a três meses.
