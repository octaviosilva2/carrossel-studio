# ADR 0004 — Redesign de UI/UX da plataforma

- **Data:** 2026-07-06
- **Status:** Merge e integração concluídos; aguardando teste pós-merge (smoke manual)
- **Decisor:** CEO (Octavio) e CTO (Claude)
- **Origem:** as 6 sessões do roadmap entregaram o produto funcional (S1–S6), mas nenhuma
  delas incluiu um desenho de UI/UX dedicado — as telas foram implementadas "funcionais"
  sessão a sessão. Com o produto em produção e a caminho do 1º cliente, o CEO pediu um
  redesign completo antes de seguir vendendo.

---

## 1. Contexto

O que é **imutável** e não muda nesta ADR: o visual do **slide renderizado** (canvas
1080×1350, cores por tema, tipografia, selo verificado, ausência de barra de
engajamento/logo/emojis) — ver `docs/REFERENCIA-VISUAL.md`. O que muda é a **casca do
app**: navegação, layout das páginas, sistema de botões, tema claro/escuro da própria
plataforma (distinto do tema do carrossel exportado) e páginas novas exigidas pelo
`docs/PLAYBOOK-CLIENTE.md` (área de admin, painel de uso) que ainda não existiam.

O processo até aqui:
1. Debate estruturado (CEO + CTO) cobrindo `VISAO.md`, `ROADMAP.md`, `PLAYBOOK-CLIENTE.md`
   e `REFERENCIA-VISUAL.md`, definindo escopo, navegação e páginas novas.
2. Mockup HTML estático e navegável, iterado em várias rodadas com o agente
   `dev-agents:05-frontend` (e depois editado diretamente pelo CTO para ajustes finos de
   layout), aprovado em `docs/mockups/redesign-v1.html`.
3. Plano de implementação real dividido em **2 sessões paralelas** (backend e frontend),
   isoladas por `git worktree`, com um terceiro prompt de teste independente após o merge.

---

## 2. Decisão — estrutura do produto

### 2.1 Navegação e páginas
Sidebar fixa colapsável (ícones) em desktop/laptop; vira drawer (`Sheet`) com hambúrguer
em tablet/mobile. Sete telas:

| Tela | Rota | Observação |
|---|---|---|
| Login | `/login` | redesenho visual, lógica de auth intacta |
| Onboarding (1ª vez) | `/onboarding` (nova) | identidade (avatar, nome, @handle) — **sem** campo de tema |
| Dashboard (nova home) | `/dashboard` (nova) | contadores Total/Mês/Semana/Hoje + recentes + atividade 7 dias |
| Criação/edição unificada | `/editor` | 2 colunas: Edição (slides) \| Preview protagonista; Assistente IA em drawer (ver §6) |
| Histórico | `/carousels` | busca + filtro de período, lista única (nunca agrupada por seção) |
| Configurações | `/settings` | abas Identidade / Conta — **sem** campo de tema |
| Admin (CEO) | `/admin` (nova) | criar cliente (e-mail + senha), lista de clientes |

### 2.2 Decisões de produto fixadas no debate
- **Tema claro/escuro do carrossel só se escolhe na hora de criar/editar** — não é mais
  uma preferência fixa da identidade (removido do onboarding e de Configurações).
- **Tema claro/escuro do APP** é um conceito separado (preferência de UI da plataforma,
  toggle no rodapé da sidebar) — não confundir com o anterior.
- **Autosave** substitui o botão "Salvar" manual no editor.
- ~~**Assistente de IA sempre visível** na tela de criação, sem opção de fechar~~
  **REVISADO (2026-07-06, ver §6):** o assistente passou a ser **recolhido por padrão**,
  abrindo por botão no header (drawer sobreposto). Motivo: simplicidade e dar espaço ao
  preview — o CEO avaliou que a coluna fixa do assistente comprimia a tela e obrigava a
  rolar.
- **Admin cria cliente só com e-mail + senha provisória** — identidade é preenchida pelo
  próprio cliente no onboarding (mesmo modelo done-for-you do playbook, só que a
  configuração fina passa a ser self-service no primeiro login).
- **Uso de tokens/custo** aparece no painel de gerenciamento de cada cliente dentro do
  Admin — não na tela de Configurações do próprio cliente.

### 2.3 Fora de escopo desta ADR (deferido)
- **Chat conversacional incremental de verdade** (a IA editando o carrossel existente a
  cada mensagem, chamando a Claude API de novo com o estado atual) — é uma mudança de
  arquitetura sobre `generateCarousel` (hoje uma chamada única), com custo e complexidade
  próprios. **PARCIALMENTE ENTREGUE (2026-07-06, ver §6):** o assistente deixou de ser
  mockado e agora **gera de verdade** a partir do prompt (geração única, aplicada no
  carrossel aberto). O *chat incremental* (reeditar slide a slide com contexto) segue
  deferido.
- **Tracking real de uso de tokens/custo por cliente** — não existe tabela para isso;
  o painel de Admin mostra placeholder até essa fatia ser priorizada.
- ~~**Corte real de imagem (crop)**~~ **ENTREGUE (2026-07-06, ver §6):** o modal de ajuste
  passou a recortar de verdade (react-easy-crop), com arrastar/zoom reais, avatar em
  círculo 1:1 e imagem de slide com escolha de proporção.

---

## 3. Decisão técnica — execução em paralelo isolada

Como o CEO pediu para não passar pela esteira `dev-agents:feature` completa desta vez
(execução direta, mais rápida) **e** rodar backend e frontend em 2 sessões simultâneas,
o risco principal era conflito de arquivos/pacotes entre as duas. Mitigado com:

- **`git worktree`**: duas pastas-irmãs isoladas, `feature/redesign-backend` e
  `feature/redesign-frontend`, ambas a partir de `main` — cada sessão com seu próprio
  `node_modules`/`package-lock.json`, sem risco de uma sobrescrever a outra.
- **Fronteira de arquivos sem sobreposição**: backend nunca toca `src/app/**`; frontend
  nunca toca `src/db/schema.ts`, `src/lib/actions/*.ts` ou `src/auth.ts` (exceto um único
  arquivo novo de mocks temporários, `src/lib/mock-redesign.ts`, para não esperar o
  backend terminar).
- **Contrato definido antes de rodar** (assinatura de funções novas, campos de schema)
  para as duas sessões convergirem sem precisar se comunicar durante a execução.
- **Contagens e filtros (Dashboard/Histórico) resolvidos client-side** sobre o
  `listCarousels()` já existente (estendido com `createdAt`/`slideCount`), evitando criar
  endpoints novos só para isso.

Prompts completos usados em cada sessão (backend, frontend, teste pós-merge) estão
registrados em `docs/sessoes/2026-07-06-adr0004-redesign-ui-ux.md`.

---

## 4. Plano de execução

| Etapa | Onde | Status |
|---|---|---|
| Backend (migrations, actions, auth/role) | worktree `carrossel-studio-backend` | ✅ Concluído (commit `4935629`) |
| Frontend (páginas, shell, componentes shadcn) | worktree `carrossel-studio-frontend` | ✅ Concluído (commit `ffdf9f3`) |
| Merge das duas branches em `main` | repo principal | ✅ Concluído (conflito único em `src/lib/auth-guard.ts`, resolvido mantendo a versão real do backend) |
| Integração dos mocks pelas actions reais + rota `/generate` aposentada | repo principal | ✅ Concluído (commit `bac89f4`) — **322 testes (321 passed, 1 skip), type-check e build limpos** |
| Teste independente pós-merge (funcional + responsivo + segurança do Admin) | sessão nova | Pendente |
| Push para `main` (dispara deploy Vercel no domínio de produção) | repo principal | Pendente confirmação explícita do Octavio |

Critério de aceite: `npm run test` + `npm run build` verdes (cumprido); veredito
PASS/FAIL por item no teste pós-merge antes do push. Commit(s) e push só com
confirmação explícita do Octavio.

### Decisões tomadas durante a integração (não previstas no plano original)
- Redirect pós-login trocado de `/carousels` para `/dashboard` (nova home).
- Admin sem coluna "status"/suspender cliente — não existe no schema; cortado
  do form e da tabela (YAGNI, mesma lógica do resto da ADR).
- Cards de Dashboard/Histórico passaram a mostrar `slideCount` e um trecho do
  primeiro slide (`firstSlideBody`) como preview textual, já que o backend
  estendeu `CarouselListItem` com esses campos.
- `/generate` (página de geração por IA de S5) foi **removida** por decisão do
  CEO — mas a action `generateCarousel` e seus testes permanecem intactos,
  disponíveis para uma futura integração com o Assistente de IA do editor.

### Achado na aplicação da migration em produção
A migration `role text DEFAULT 'client' NOT NULL` aplica o default a **todas** as
linhas existentes — inclusive a conta do próprio CEO (`SEED_ADMIN_EMAIL`), que
ficou `role='client'` até ser promovida manualmente (`UPDATE users SET
role='admin' WHERE email=...`) logo após a migration rodar na VPS. Verificado
via query direta em produção antes e depois do UPDATE. **Follow-up sugerido:**
um script `scripts/promote-admin.mjs` (mesmo padrão de `create-client.mjs`) para
não depender de UPDATE manual da próxima vez que precisar promover alguém.

---

## 5. Próximos passos após esta ADR fechar

- Priorizar (ou não) o chat conversacional incremental como fatia própria.
- Priorizar (ou não) tracking real de tokens/custo por cliente.
- ~~Priorizar (ou não) corte real de imagem (crop)~~ — feito (§6).

---

## 6. Revisão do editor (2026-07-06)

Após o merge, o CEO revisou a tela `/editor` — excesso de informação empilhada
obrigava a rolar, contra o objetivo de simplicidade. Três mudanças, executadas
direto (sem esteira `dev-agents`, como o resto da ADR), com testes e build verdes.

### 6.1 Layout — 2 colunas, preview protagonista
- Assistente saiu da grade fixa de 3 colunas → sobram **2 colunas**: Edição
  (`SlideNav` + `SlideEditor`, ~380px) à esquerda e **Preview protagonista**
  (`flex-1`) à direita.
- Na coluna do preview: botões de **exportação acima** do preview e **Identidade
  do perfil abaixo** (decisão do CEO). Preview escalado de 420→460px.

### 6.2 Assistente de IA — drawer + geração real
- Vira botão **"Assistente IA"** no header, abrindo um `Sheet` (drawer à direita)
  com banner **"Crie com IA"**, `x` para fechar e input **"Descreva o que criar…"**.
- Deixou de ser mock: nova server action **`generateForEditor`** reusa a defesa em
  camadas de `generateCarousel` (auth → Zod → Claude API → sanitização), mas
  **devolve o resultado por união** (`{ ok, title, slides } | { ok:false, code }`)
  em vez de persistir/redirecionar. O client aplica via novo reducer
  **`APPLY_GENERATED`** (substitui título + slides do carrossel aberto); o autosave
  persiste. `generateCarousel` original e seus testes seguem **intactos**.

### 6.3 Crop real de imagem
- Nova dependência **`react-easy-crop`** (`^6`). `ImageCropDialog` recorta de
  verdade (util `src/lib/crop-image.ts`, via canvas): arrastar/zoom reais.
- **Avatar**: círculo 1:1 (proporção de foto de perfil). **Imagem de slide**:
  seletor de proporção (Original/1:1/4:5/16:9), padrão **Original** (preserva o
  comportamento anterior). `onConfirm` agora entrega o **arquivo recortado** ao
  upload (antes subia o original).

**Verificação:** `npm run test` → 332 passed, 1 skip; `npm run type-check` e
`npm run build` limpos.
