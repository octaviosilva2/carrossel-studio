# ADR 0004 — Redesign de UI/UX da plataforma

- **Data:** 2026-07-06
- **Status:** Em execução (backend e frontend implementando em paralelo)
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
| Criação/edição unificada | `/editor` | 3 colunas: Assistente IA \| Slides manual \| Preview |
| Histórico | `/carousels` | busca + filtro de período, lista única (nunca agrupada por seção) |
| Configurações | `/settings` | abas Identidade / Conta — **sem** campo de tema |
| Admin (CEO) | `/admin` (nova) | criar cliente (e-mail + senha), lista de clientes |

### 2.2 Decisões de produto fixadas no debate
- **Tema claro/escuro do carrossel só se escolhe na hora de criar/editar** — não é mais
  uma preferência fixa da identidade (removido do onboarding e de Configurações).
- **Tema claro/escuro do APP** é um conceito separado (preferência de UI da plataforma,
  toggle no rodapé da sidebar) — não confundir com o anterior.
- **Autosave** substitui o botão "Salvar" manual no editor.
- **Assistente de IA sempre visível** na tela de criação, sem opção de fechar (só recolhe
  a sidebar de navegação, não o assistente).
- **Admin cria cliente só com e-mail + senha provisória** — identidade é preenchida pelo
  próprio cliente no onboarding (mesmo modelo done-for-you do playbook, só que a
  configuração fina passa a ser self-service no primeiro login).
- **Uso de tokens/custo** aparece no painel de gerenciamento de cada cliente dentro do
  Admin — não na tela de Configurações do próprio cliente.

### 2.3 Fora de escopo desta ADR (deferido)
- **Chat conversacional incremental de verdade** (a IA editando o carrossel existente a
  cada mensagem, chamando a Claude API de novo com o estado atual) — é uma mudança de
  arquitetura sobre `generateCarousel` (hoje uma chamada única), com custo e complexidade
  próprios. Nesta ADR o assistente é **visual/mockado**; a implementação real é uma fatia
  futura, com research e spec próprios.
- **Tracking real de uso de tokens/custo por cliente** — não existe tabela para isso;
  o painel de Admin mostra placeholder até essa fatia ser priorizada.
- **Corte real de imagem (crop)** — o modal de ajuste (avatar e imagem de slide) é
  visual por enquanto, sem lógica de recorte de pixels.

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
| Backend (migrations, actions, auth/role) | worktree `carrossel-studio-backend` | Em execução |
| Frontend (páginas, shell, componentes shadcn) | worktree `carrossel-studio-frontend` | Em execução |
| Merge das duas branches em `main` | repo principal | Pendente |
| Teste independente pós-merge (funcional + responsivo + segurança do Admin) | sessão nova | Pendente |

Critério de aceite: `npm run test` + `npm run build` verdes nas duas branches antes do
merge; veredito PASS/FAIL por item no teste pós-merge antes de considerar a ADR
concluída. Commit(s) e push só com confirmação explícita do Octavio.

---

## 5. Próximos passos após esta ADR fechar

- Priorizar (ou não) o chat conversacional incremental como fatia própria.
- Priorizar (ou não) tracking real de tokens/custo por cliente.
- Priorizar (ou não) corte real de imagem (crop) no upload de avatar/slide.
