# Story — S3: Persistência + Auth + Storage

> Estágio 02 do pipeline dev-agents. Contrato do **o quê** — não desenha o **como**.
> Decisões do CEO/CTO (STATUS.md) já incorporadas. Ponto de gate humano ao fim.

## User Story

**Como** Octavio (admin operador da plataforma, done-for-you),
**quero** logar com senha e ter meus carrosséis salvos no banco — com imagens reais em storage e a identidade da marca herdada do cliente (com override pontual por carrossel),
**para que** eu feche o navegador, volte depois, reabra qualquer carrossel e continue de onde parei — em vez de perder tudo por ser tudo em memória (S2).

**Valor:** hoje o editor da S2 é 100% em memória — fechar a aba apaga o trabalho. Esta story transforma o Carrossel Studio numa ferramenta de trabalho real: acesso protegido, trabalho persistido e imagens hospedadas. É a primeira fatia com servidor, banco e auth, e prepara (via filtro por dono) o multi-cliente da S6 sem entregá-lo agora.

---

## Fatiamento (contexto)

Esta é uma story grande, mas as 4 partes são um **vertical slice único e indivisível**: sem auth não há dono; sem dono não há como salvar/isolar; sem schema não há onde salvar; sem upload real a imagem não persiste (data-URL não cabe no fluxo de storage). Entregar qualquer parte isolada não gera valor utilizável. Por isso segue como uma story, com critérios de aceite agrupados por área. Fatias explicitamente **adiadas** estão em "Fora de escopo".

---

## Critérios de aceite

### A. Autenticação e proteção de rotas
1. **Login por senha.** Dado um usuário existente no banco (criado por seed/script), quando informo e-mail + senha corretos na tela de login, então sou autenticado e redirecionado para a área do app (editor/lista de carrosséis).
2. **Senha errada falha fechado.** Dado credenciais inválidas, quando tento logar, então recebo mensagem de erro genérica ("e-mail ou senha inválidos" — sem revelar qual dos dois), permaneço deslogado e nenhuma sessão é criada.
3. **Senha hasheada.** As senhas são armazenadas com **bcryptjs** (hash + salt); nenhuma senha em texto puro existe no banco, nos logs ou no código.
4. **Sessão no Postgres.** A sessão usa strategy **database** (registro de sessão persistido no Postgres). Fechar o navegador e reabrir dentro da validade mantém a sessão ativa sem novo login.
5. **Logout.** Dado que estou logado, quando aciono "sair", então a sessão é invalidada no banco e acessar rota protegida volta a exigir login.
6. **Rotas protegidas via `auth()` no server.** Dado que **não** estou autenticado, quando acesso qualquer rota do app (ex.: `/editor`, lista de carrosséis) ou qualquer endpoint de API de dados, então sou barrado (redirecionado ao login / resposta 401) — a checagem roda no server (Server Component / route handler com `auth()`), **não** em middleware Edge.
7. **Sem signup público.** Não existe tela nem endpoint de cadastro público. A conta do admin é criada exclusivamente por **script/seed** rodado por linha de comando pelo Octavio, com a senha já hasheada.

### B. Schema, migrations e isolamento por dono
8. **Schema Drizzle + migrations.** Existem tabelas `users`, `clients`, `carousels`, `slides` (mais as tabelas que o adapter de auth exigir: sessões/contas), criadas por **migration versionada** do drizzle-kit rodável por comando (`db:generate` / `db:migrate`) contra o Neon. Rodar a migration num banco limpo produz o schema esperado.
9. **Toda entidade de conteúdo tem dono.** `carousels` (e por consequência seus `slides`) referenciam o dono via FK. **Todas** as queries de leitura/escrita de carrossel filtram por dono — mesmo havendo hoje 1 usuário real. (Prepara S6; não expõe multi-cliente agora.)
10. **Identidade fixa por cliente com override por carrossel.** A identidade da marca (nome, handle, avatar, tema) tem valor **padrão no `clients`**; o `carousel` pode sobrescrever campos **pontualmente**; **campo nulo no carousel herda do cliente**. Ao carregar um carrossel, o editor recebe a identidade **resolvida** (override quando presente, senão o padrão do cliente).
11. **Contrato de render intacto.** O componente `<Slide>` e o tipo `SlideData` (`src/components/slide/types.ts`) **não mudam**. A persistência mapeia `CarouselIdentity` + `EditorSlide` + `theme` (`src/lib/editor-state.ts`) para/das linhas do banco; `avatarUrl`/`imageUrl` passam a ser URLs https do Blob (o tipo já aceita string).
12. **Sem regressão da S2.** Os 70 testes existentes continuam verdes. Ampliar `EditorState`/`EditorSlide` (ex.: id do banco, `carouselId`) é permitido desde que **não quebre** o shape/reducer que a suíte da S2 depende.

### C. Upload real de imagem (Vercel Blob)
13. **Upload real de avatar e de imagem de slide.** Dado um arquivo válido, quando faço upload do avatar (painel de identidade) ou da imagem de um slide, então o arquivo vai para o **Vercel Blob via client upload** e a **URL https retornada** é guardada no estado/carrossel — substituindo o data-URL local da S2.
14. **Validação 6 MB + tipo, no client E no server.** A validação de tipo de imagem e de tamanho **≤ 6 MB** (reusando `validateImageFile` / `MAX_IMAGE_BYTES` de `src/lib/image-upload.ts`) roda no client antes do envio **e** é reforçada no route handler que gera o token do Blob (o limite client é burlável). Arquivo inválido é rejeitado com erro inline e **não** é enviado nem persistido.
15. **Nota de dependência S4 (não implementar aqui).** Fica registrado que, no export (S4), a imagem do Blob será convertida para **data-URL antes do canvas** para evitar tainted canvas. Nesta story **não** se implementa export nem conversão; apenas não se introduz nada que impossibilite essa conversão futura.

### D. Salvar, listar e reabrir carrosséis (ligar o editor da S2)
16. **Salvar.** Dado que estou editando um carrossel, quando aciono "Salvar", então o carrossel (identidade/override + tema + slides na ordem atual + imagens já em URL do Blob) é persistido sob o meu dono, e a UI mostra estado de "salvando → salvo" (e "erro" em falha).
17. **Reordenação persistida.** Dado que reordeno os slides no editor e salvo, quando reabro o carrossel, então os slides voltam na **mesma ordem** salva.
18. **Listar.** Dado que tenho carrosséis salvos, quando abro a lista, então vejo **apenas os meus** carrosséis, com informação suficiente para identificá-los e reabrir cada um.
19. **Reabrir.** Dado um carrossel salvo meu, quando o abro pela lista (via `id`), então o editor carrega identidade resolvida + tema + slides na ordem correta, e o preview (`<Slide>` via `toSlideData`) reflete o conteúdo salvo.
20. **Novo carrossel.** Consigo iniciar um carrossel novo (estado inicial, herdando a identidade padrão do cliente) e salvá-lo pela primeira vez.
21. **Texto desatualizado removido.** A frase "Nada é salvo nesta fatia" no editor (`src/app/editor/page.tsx`) é removida/atualizada, pois passa a ser mentira.

### E. Baseline de segurança
22. **Zod nas bordas.** Toda entrada externa que chega ao server — credenciais de login e payloads das APIs de salvar/listar/reabrir/upload — é validada com **Zod** antes de tocar o banco ou o Blob; entrada malformada é rejeitada (400) sem efeito colateral.
23. **Authz por dono em toda leitura/escrita.** Nenhuma operação de carrossel confia em `id` vindo do client sem verificar que o recurso pertence ao usuário logado (ver edge case "carrossel de outro dono").
24. **Sem segredo no código.** `DATABASE_URL`, `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN` vêm de env (não commitados); existe `.env.example` documentando as chaves sem valores reais.

---

## Edge cases

- **Sessão expirada / inválida** → ao acessar rota protegida ou chamar API de dados com sessão expirada, o usuário é redirecionado ao login (ou recebe 401); nenhum dado é lido/gravado.
- **Upload inválido (tipo errado ou > 6 MB)** → rejeitado com erro inline; nada é enviado ao Blob nem persistido; o server também recusa caso o client seja burlado.
- **Carrossel de outro dono** → ao tentar abrir/salvar/listar um carrossel cujo dono não é o usuário logado (id adivinhado/manipulado), a resposta é "não encontrado"/negado (404/403), **nunca** vaza conteúdo alheio. Vale mesmo com 1 usuário real — a query filtra por dono sempre.
- **Override parcial de identidade** → carrossel com alguns campos de identidade sobrescritos e outros nulos → os nulos herdam do `clients`; os preenchidos usam o valor do carrossel. Salvar não deve "materializar" (copiar) os herdados como override (campo continua nulo → segue herdando se o cliente mudar). 
- **Reordenação persistida** → ordem dos slides no momento do salvar é a ordem ao reabrir (coberto por AC 17).
- **Salvar com falha de rede/banco** → a UI mostra estado de "erro" e **não** afirma "salvo"; o trabalho em memória do editor não é perdido pela falha (permite tentar de novo).
- **Reabrir carrossel inexistente/removido** → resposta "não encontrado", sem quebrar o editor.
- **Avatar nunca vazio** → o placeholder SVG same-origin (`DEFAULT_AVATAR_DATA_URL`) permanece o fallback quando não há avatar; upload real só substitui quando bem-sucedido.

---

## Fora de escopo (explícito — não será feito nesta story)

- **Export / geração de PNG / download ZIP** → é a **S4**. Aqui só se registra a nota de CORS/data-URL como dependência (AC 15), sem implementar.
- **IA (geração de conteúdo via Claude API)** → é a **S5**.
- **Multi-cliente pleno, tela/painel de admin, gestão de vários clientes e usuários** → é a **S6**. A S3 só deixa o schema/queries **preparados** (filtro por dono), sem UI de administração.
- **Signup público / tela de cadastro** → não existe; conta criada só por seed/script.
- **Reset/troca de senha por e-mail, provedor de e-mail (Resend), verificação de e-mail** → adiado (pós-S3).
- **Múltiplas identidades reutilizáveis por cliente (biblioteca de identidades)** → adiado. Nesta fase: 1 identidade padrão por `clients` + override por carrossel (não uma tabela de identidades selecionáveis).
- **Proteção via middleware Edge** → decidido usar `auth()` no server; middleware fica fora.
- **Embarcar a fonte Segoe UI/Selawik via `next/font/local`** (dívida herdada de S1) → fora; registrada como follow-up, não é S3.
- **Otimização de imagem / `next/image` remotePatterns** → só se estritamente necessário; o `<Slide>` usa `<img>` cru hoje. Não é objetivo desta story melhorar isso.

---

## Perguntas abertas

- [PRECISA CLARIFICAR: **Nome/título do carrossel.** O `EditorState` atual não tem `title`, mas listar/reabrir fica muito melhor com um rótulo humano. Adiciono um campo "título do carrossel" no editor nesta story, ou a lista identifica o carrossel por outro meio (data de criação/atualização, primeiras palavras do slide 1)? Recomendação: campo `title` simples agora — barato e melhora muito a lista. Confirmar.]
- [PRECISA CLARIFICAR: **Campos `status`/datas do carrossel.** `VISAO.md` menciona "status, datas". Nesta story basta `createdAt`/`updatedAt` (timestamps automáticos) para ordenar a lista, ou o CEO quer um campo `status` (rascunho/pronto) já agora? Recomendação: só timestamps agora; `status` adiado. Confirmar.]
- [PRECISA CLARIFICAR: **Semente de dados do cliente.** O seed cria o `user` admin (Octavio). Ele também cria automaticamente **um `client` padrão** (com identidade default: nome/handle/avatar/tema) para o admin operar, ou o primeiro carrossel define a identidade? Para o "novo carrossel herdar a identidade do cliente" (AC 20) funcionar, precisa existir ao menos 1 `client` com identidade. Recomendação: seed cria user + 1 client padrão vinculado. Confirmar valores default (nome/handle/avatar/tema) do client — ou usar placeholders editáveis.]

---

## Notas para o Spec (03) — não são requisitos, são heads-up do research

- 🔴 **CORS/export (S4):** decisão já tomada — converter Blob→data-URL antes do canvas na S4. A S3 deve guardar a **URL do Blob** (não bloquear essa conversão futura).
- **Session `database` + `auth()` no server:** decidido. Implica runtime **Node** (não Edge) nas rotas que leem sessão; driver Neon serverless para o app e **conexão direta** para migrations (STATUS).
- **Testes:** o coração testável é a **serialização pura row↔EditorState** (segue o padrão `toSlideData`). Estratégia de banco em teste (mock do adapter/queries vs banco de teste) fica para a spec — jsdom não conecta a Postgres.

---

## Definição de "feito" (desta story)
Um humano lê em 30s: entende que a S3 dá **login + salvar/reabrir carrosséis com imagens reais**, isolados por dono, com identidade herdada do cliente e override por carrossel. Os 24 critérios de aceite são objetivos o bastante para o Validator (07) julgar a entrega. As 3 perguntas abertas são de **granularidade** (título/status/seed do client), não bloqueiam a arquitetura — mas devem ser respondidas no gate antes da spec.

---

## GATE HUMANO
Story pronta para aprovação. **Parar aqui.** Preciso da decisão do Octavio nas 3 perguntas abertas (título do carrossel, status/datas, seed do client padrão) e do OK geral antes de seguir para o estágio 03-spec.
