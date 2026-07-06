# Sessão 2026-07-06 — ADR 0004: Redesign de UI/UX

## Objetivo
Redesenhar a casca do app (navegação, layout, sistema de botões, temas, páginas novas
exigidas pelo playbook) sem alterar o motor de render do slide (`REFERENCIA-VISUAL.md`,
imutável). Ver `docs/adr/0004-redesign-ui-ux.md` para o contexto completo e as decisões.

## Processo

### 1. Debate estruturado
Leitura conjunta de `VISAO.md`, `ROADMAP.md`, `PLAYBOOK-CLIENTE.md`,
`REFERENCIA-VISUAL.md`. Perguntas dirigidas (escopo, páginas novas, direção visual,
navegação) até fechar a estrutura: sidebar fixa + 7 telas (login, onboarding, dashboard,
criação unificada em 3 colunas, histórico, configurações, admin).

### 2. Mockup HTML iterativo
Gerado por `dev-agents:05-frontend` em `docs/mockups/redesign-v1.html` (arquivo único,
Tailwind CDN, JS vanilla, SPA-fake navegável). Iterado em ~8 rodadas de feedback do CEO
(prints anotados), cobrindo: identidade visual (logo, ícones, densidade), sistema de
botões, dois temas (app vs. carrossel) independentes, fluxo de criação (chat sempre
aberto, sidebar colapsável em desktop, drawer em mobile), dashboard, histórico
(filtro sem agrupamento), admin simplificado (só e-mail+senha), responsividade
desktop/laptop/tablet/mobile. Últimas rodadas de ajuste fino foram aplicadas
diretamente pelo CTO (sem passar pelo agente) a pedido do Octavio, por velocidade.

### 3. Plano de implementação real — 2 sessões paralelas + 1 de teste
Por pedido do CEO, sem passar pela esteira `dev-agents:feature` completa desta vez, e
rodando backend e frontend em sessões simultâneas. Isolamento via `git worktree`
(`feature/redesign-backend` e `feature/redesign-frontend`, ambas a partir de `main`) —
decisão tomada com o Octavio para eliminar risco de conflito de arquivos/pacotes entre
as duas sessões rodando ao mesmo tempo.

Fronteira de arquivos definida para as duas sessões nunca se sobreporem (backend não
toca `src/app/**`; frontend não toca `src/db/schema.ts`/`src/lib/actions/*.ts`/
`src/auth.ts` exceto um único arquivo de mocks temporários). Contrato de funções/campos
novos definido antes de rodar, para convergirem sem se comunicar durante a execução.

## Prompts usados

### Prompt 1 — Backend (worktree `carrossel-studio-backend`)
```text
Você está no worktree `feature/redesign-backend` do Carrossel Studio (Next.js 15 +
Drizzle + Postgres). Implemente estas mudanças de backend, SEM tocar em nada dentro
de `src/app/**` (páginas/UI são de outra sessão trabalhando em paralelo no mesmo
repositório, em outra pasta) — se perceber necessidade de mexer em UI, PARE e reporte
em vez de fazer.

## 1. Migration aditiva (Drizzle)
Em `src/db/schema.ts`:
- `users`: adicionar coluna `role` (text, not null, default `'client'`). Valores
  esperados: `'admin' | 'client'`.
- `clients`: adicionar coluna `onboardingCompletedAt` (timestamptz, nullable).
Gere a migration com o fluxo já usado no projeto (`drizzle-kit generate`, ver
migrations existentes em `drizzle/` ou pasta equivalente para o padrão). Migration
deve ser aditiva e não-destrutiva.

## 2. Papel do usuário na sessão
Em `src/auth.ts`: incluir `role` no callback `jwt`/`session` do NextAuth, para que
`session.user.role` fique disponível no resto do app (`'admin' | 'client'`).
Em `src/lib/auth-guard.ts`: adicionar `requireAdmin()`, no mesmo padrão de
`requireUser()` (falha fechado).

## 3. Estender listCarousels (Histórico + Dashboard vão consumir isso)
Em `src/lib/actions/carousel-types.ts`: estender `CarouselListItem` (aditivo):
createdAt (string), slideCount (number), firstSlideBody (string, snippet ~60 chars).
Em `src/lib/actions/carousels.ts`, `listCarousels()`: trazer esses campos novos
(mantendo filtro por ownerId). NÃO adicionar parâmetros de busca/filtro — isso é
client-side no front-end.

## 4. Admin (novas actions)
`src/lib/actions/admin-types.ts` + `src/lib/actions/admin.ts` (requireAdmin() no
topo de cada função, Zod na borda):
- createClientAccount({ email, password }) — cria user (role 'client') + client
  placeholder, bcrypt cost 12, idempotente por e-mail.
- listClientsAdmin() — lista users role 'client' + nome/handle + contagem de
  carrosséis.
- deleteClientAccount(userId) — apaga user (cascade).
Sem tracking de uso de tokens/custo (não existe tabela ainda — fatia futura).

## 5. Onboarding
getClientSettings() passa a retornar onboardingCompletedAt (string | null).
Nova completeOnboarding(input) — igual updateClientSettings + seta
onboardingCompletedAt = now().

## 6. Troca de senha
changePassword({ currentPassword, newPassword }) em settings.ts — requireUser(),
confirma senha atual (bcryptjs.compare), grava novo hash (cost 12).

## Critério de pronto
npm run test + npm run build verdes. Nenhum arquivo em src/app/** alterado. Commit
local na branch atual, sem push, sem merge. Listar arquivos alterados/criados e
funções exportadas novas ao final.
```

### Prompt 2 — Frontend (worktree `carrossel-studio-frontend`)
```text
Você está no worktree `feature/redesign-frontend` do Carrossel Studio (Next.js 15
App Router + Tailwind + shadcn/ui já configurado — lucide-react já é dependência,
Button já tem variantes default/secondary/destructive/ghost, dark mode já é class
com tokens CSS em globals.css). Implemente o redesign visual completo com base no
mockup aprovado em docs/mockups/redesign-v1.html (leia inteiro antes de começar).
Caminho absoluto (caso untracked no worktree):
C:\Users\Octavio\Desktop\Skill- Gerador de Tweets\carrossel-studio\docs\mockups\redesign-v1.html

SEM tocar em src/db/schema.ts, src/lib/actions/*.ts ou src/auth.ts — outra sessão
está implementando backend em paralelo. Se precisar de um dado que ainda não existe
na action real, use um único arquivo novo src/lib/mock-redesign.ts com funções mock
comentadas // TODO(integração pós-merge).

Componentes shadcn a adicionar: dialog, sheet, tabs, avatar, table, badge,
separator (npx shadcn@latest add <nome>). Ícones via lucide-react.

Páginas: /login (redesenho), /onboarding (nova, sem campo de tema), /dashboard
(nova home, 4 contadores calculados client-side + recentes + atividade 7 dias),
/editor (redesenho 3 colunas: Assistente IA sempre visível sem botão de fechar |
Slides manual reaproveitando editor-state.ts | Preview maior com export ZIP/PNG
via export-png.ts existente; autosave substitui botão Salvar), /carousels
(redesenho, busca + pills de período client-side sobre listCarousels(), lista
única nunca agrupada), /settings (abas Identidade sem tema / Conta com trocar
senha), /admin (nova, checagem de role client-side temporária com TODO, form só
e-mail+senha, tabela de clientes, uso de tokens como placeholder "Em breve").

Shell: sidebar fixa colapsável (ícones) em desktop/laptop, vira Sheet (drawer)
com hambúrguer em tablet/mobile. Toggle de tema do app no rodapé (classe dark no
html, localStorage). Botões = variantes já existentes do Button do shadcn.

Crop de imagem: modal (Dialog) visual apenas (máscara + slider de zoom fake),
sem lógica real de corte — fatia futura, comentar no código.

## Critério de pronto
npm run test + npm run build verdes. Casts temporários (as any) com TODO
explicando o motivo. Nenhum arquivo em src/db/schema.ts, src/lib/actions/*.ts
(exceto mock-redesign.ts) ou src/auth.ts alterado. Testar em desktop (~1440px) e
mobile (~390px). Commit local, sem push, sem merge. Listar TODOs de integração
ao final.
```

### Prompt 3 — Teste pós-merge (sessão nova, após merge manual das 2 branches)
```text
Contexto: acabamos de mergear feature/redesign-backend e feature/redesign-frontend
na branch principal, e de substituir os mocks/TODOs do front-end pelas actions
reais do backend. Preciso de validação objetiva e independente antes de aprovar.

1. npm run test e npm run build — colar resultado completo.
2. npm run dev e percorrer manualmente: onboarding no 1º login → Dashboard;
   contadores e recentes coerentes; criar carrossel (3 colunas, slides editáveis,
   preview atualiza, autosave sem clicar Salvar, exportar ZIP/PNG); Histórico
   (busca + pills de período); Configurações (Identidade salva, Conta troca
   senha de verdade — confirmar com logout/login); Admin (criar cliente,
   login com a conta criada cai no onboarding); responsivo em
   desktop/laptop/tablet/mobile (sidebar colapsa/vira drawer).
3. Segurança: /admin redireciona se não-admin; actions de admin falham sem
   requireAdmin() para usuário client comum.
4. Veredito PASS/FAIL por item com evidência. NÃO corrigir bugs — só reportar.
```

## Status ao fim desta sessão
Backend e frontend rodando em paralelo (worktrees isolados). Merge e teste
pós-merge pendentes — próxima sessão retoma por aqui.
