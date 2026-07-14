# Carrossel Studio

🇺🇸 [English](#english) · 🇧🇷 [Português](#português)

---

## English

**Done-for-you SaaS platform that generates Twitter/X-style carousels ready for
Instagram** — two content paths (AI-assisted or fully manual) feeding the same
deterministic rendering engine, exported as 1080×1350 PNGs in light or dark theme.

In production since July 2026, sold to real clients under a done-for-you model
(Octavio configures each account; billed as setup + monthly maintenance).

### The problem

Founders, doctors and other busy professionals want to post consistently on
social media, but don't have the time or design skill to turn a raw idea into a
polished, on-brand carousel. This started as a personal Claude Code **skill**
(Python + Pillow) that wrote and rendered carousels for Octavio's own posts on
request. Once other professionals started asking for the same thing, it was
rebuilt from scratch as a multi-tenant web platform — a deliberate architecture
decision, documented in [ADR 0001](docs/adr/0001-stack-tecnica.md).

### What it does

- **Two entry points, same engine.** AI-assisted: paste a topic, link or
  ready text — the AI drafts and assembles the carousel, refine by
  conversation. Manual: a step-by-step wizard (slide count → text per slide →
  optional image → assemble). Both produce the same underlying spec and land
  on the same preview/export.
- Live preview with inline text edit, slide reordering, image upload
  (auto-cropped, bordered and scaled by the rendering engine — never hand-tuned).
- Export to PNG 1080×1350, light or dark theme, single slide or full ZIP.
- Per-client identity (name, @handle, avatar, verified badge on/off, tone of
  voice, default theme) — multiple identities per client account.
- History: reopen, edit and re-export past carousels.
- Admin back-office for onboarding: Octavio provisions each client's account
  and identity ([playbook](docs/PLAYBOOK-CLIENTE.md)).

### Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**, Tailwind + shadcn/ui
- **Auth.js v5** (Credentials + JWT session), bcrypt password hashing
- **PostgreSQL** + **Drizzle ORM**, self-hosted on a VPS (migrated off Neon,
  [ADR 0002](docs/adr/0002-migracao-vps-easypanel.md))
- **MinIO** (S3-compatible object storage), self-hosted alongside Postgres —
  replaced Vercel Blob in the same migration
- **Anthropic Claude API** for the AI-assisted path, structured output
  validated with **Zod**
- Client-side render: React `<Slide>` component → HTML → PNG (`modern-screenshot`)
- **Vitest** (~320 tests), deployed to **Vercel** behind a custom domain

### Running locally

Requirements: Node, npm, a PostgreSQL instance and S3-compatible storage
(MinIO works locally).

```bash
npm install
cp .env.example .env.local   # fill with real values — every var is commented
npm run db:migrate
npm run db:seed              # creates the admin user (SEED_ADMIN_EMAIL/PASSWORD)
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login).

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run test` | Unit tests (Vitest, single run) |
| `npm run type-check` | Type-check only, no build output |
| `npm run db:migrate` | Applies Drizzle migrations |
| `npm run db:seed` | Creates the admin user |
| `npm run client:create` | Provisions a new client account + default identity |

### Example output

A generated slide (light theme, with image slot) — from the project's own test
fixtures, not client content:

![Example carousel slide](tests/fixtures/slide-light-image.png)

### Structure

```
src/
├── app/
│   ├── (app)/         ← protected routes: dashboard, carousels, editor, settings, admin
│   ├── login/, onboarding/
│   └── api/           ← Auth.js route + blob upload/proxy
├── components/
│   ├── slide/         ← the <Slide> component — the deterministic visual engine
│   ├── app-shell/, ui/
├── db/                ← Drizzle schema (users, clients, carousels, slides)
├── lib/
│   ├── actions/       ← server actions (create/save/list/delete carousel, settings, generate)
│   └── ...            ← auth guard, rate limiting, export-to-PNG, Claude client
└── fonts/              ← embedded Selawik (SIL OFL) for pixel-accurate export on Linux

docs/                   ← product vision, ADRs, session log, STATUS.md (entry point)
drizzle/                ← versioned SQL migrations
```

### Case study — building this with Claude Code

**Context.** The rendering rules (colors, spacing, verified badge, no
engagement bar) already existed as a Python skill, proven on real posts. The
open question was whether to keep it as a local tool or turn it into something
sellable to other professionals — the second path meant real auth, real
multi-tenant data isolation and a UI non-technical clients could use unsupervised.

**AI-Workflow.** Built through the `dev-agents` pipeline in six planned slices
(S1 render engine → S2 manual editor → S3 auth/persistence/storage → S4 export
→ S5 AI generation → S6 multi-client hardening), each one run end-to-end
(research → story → spec → backend → frontend → tests → independent
validation) with a human approval gate before code landed — see
[docs/STATUS.md](docs/STATUS.md) for the full trail. Two follow-up ADRs came
from *running* the product, not from planning: [ADR 0002](docs/adr/0002-migracao-vps-easypanel.md)
moved Postgres and storage off managed services onto a self-hosted VPS, and
[ADR 0003](docs/adr/0003-correcoes-seguranca-mvp.md) closed findings from a
security-audit skill (`analise-seguranca`) run right after the production
cutover (HTTP security headers, login rate limiting). A later UI/UX redesign
([ADR 0004](docs/adr/0004-redesign-ui-ux.md)) was built backend and frontend in
parallel git worktrees and merged deliberately rather than developed on a
single branch.

**Architecture.** See [Tech stack](#tech-stack) above. The core design bet:
rendering is a **deterministic component**, never left to the AI — whether a
carousel comes from the AI-assisted path or the manual wizard, both produce
the same typed spec and go through the exact same `<Slide>` renderer, so the
visual output never "drifts" depending on how it was created. The AI path only
ever sees this contract, never raw layout control (Claude API calls with the
visual rules pinned in the system prompt, user intent isolated to the user
message — a deliberate prompt-injection boundary).

**Evidence.** In production since July 2026 on a custom domain
(`carrosselstudio.evoiatecnologia.com`), sold and actively used under a
done-for-you model. Cutover was verified with a full manual smoke test (login,
create/save carousel, image upload, PNG export) before going live. ~320 tests
green, type-check and production build clean at every merge to `main`. A
dedicated security-audit pass ran right after the production cutover, closing
all findings before the first paying client.

---

## Português

**Plataforma SaaS done-for-you que gera carrosséis estilo Twitter/X prontos
para o Instagram** — duas portas de entrada (com IA ou manual) alimentando o
mesmo motor de renderização determinístico, exportado como PNGs 1080×1350 em
tema claro ou escuro.

Em produção desde julho de 2026, vendida a clientes reais no modelo
done-for-you (o Octavio configura cada conta; cobrança de setup + mensalidade).

### O problema

Fundadores, médicos e outros profissionais ocupados querem postar com
consistência nas redes, mas não têm tempo nem habilidade de design para
transformar uma ideia em carrossel pronto e alinhado à própria marca. Isso
começou como uma **skill** pessoal do Claude Code (Python + Pillow) que
escrevia e renderizava carrosséis para os próprios posts do Octavio, sob
pedido. Quando outros profissionais passaram a pedir a mesma coisa, o projeto
foi reconstruído do zero como plataforma web multi-cliente — uma decisão de
arquitetura deliberada, documentada na [ADR 0001](docs/adr/0001-stack-tecnica.md).

### O que faz

- **Duas portas, mesmo motor.** Com IA: cola um tema, link ou texto pronto — a
  IA escreve/monta o carrossel, refino por conversa. Manual: wizard passo a
  passo (nº de slides → texto de cada um → imagem opcional → montar). As duas
  portas geram o mesmo spec por baixo e caem no mesmo preview/exportação.
- Preview ao vivo com edição de texto inline, reordenação de slides, upload de
  imagem (recorte, borda e escala automáticos pelo motor de render — nunca
  ajustado à mão).
- Exportação em PNG 1080×1350, tema claro ou escuro, slide único ou ZIP completo.
- Identidade por cliente (nome, @handle, avatar, selo verificado on/off, tom de
  voz, tema padrão) — múltiplas identidades por conta.
- Histórico: reabre, edita e reexporta carrosséis antigos.
- Back-office de admin para onboarding: o Octavio provisiona conta e
  identidade de cada cliente ([playbook](docs/PLAYBOOK-CLIENTE.md)).

### Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**, Tailwind + shadcn/ui
- **Auth.js v5** (Credentials + sessão JWT), hash de senha com bcrypt
- **PostgreSQL** + **Drizzle ORM**, self-hosted em VPS (migrado do Neon,
  [ADR 0002](docs/adr/0002-migracao-vps-easypanel.md))
- **MinIO** (storage compatível com S3), self-hosted junto do Postgres —
  substituiu o Vercel Blob na mesma migração
- **Claude API (Anthropic)** para a porta com IA, saída estruturada validada
  com **Zod**
- Render no cliente: componente React `<Slide>` → HTML → PNG (`modern-screenshot`)
- **Vitest** (~320 testes), deploy na **Vercel** atrás de domínio próprio

### Rodando localmente

Pré-requisitos: Node, npm, uma instância PostgreSQL e storage compatível com S3
(MinIO funciona localmente).

```bash
npm install
cp .env.example .env.local   # preencher com valores reais — cada var tem comentário
npm run db:migrate
npm run db:seed              # cria o usuário admin (SEED_ADMIN_EMAIL/PASSWORD)
npm run dev
```

Abra [http://localhost:3000/login](http://localhost:3000/login).

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run test` | Testes unitários (Vitest, uma passada) |
| `npm run type-check` | Só checagem de tipos, sem build |
| `npm run db:migrate` | Aplica as migrations do Drizzle |
| `npm run db:seed` | Cria o usuário admin |
| `npm run client:create` | Provisiona uma conta de cliente + identidade padrão |

### Exemplo de saída

Um slide gerado (tema claro, com espaço de imagem) — vem das fixtures de teste
do próprio projeto, não é conteúdo de cliente:

![Exemplo de slide do carrossel](tests/fixtures/slide-light-image.png)

### Estrutura

```
src/
├── app/
│   ├── (app)/         ← rotas protegidas: dashboard, carousels, editor, settings, admin
│   ├── login/, onboarding/
│   └── api/           ← rota do Auth.js + upload/proxy de blob
├── components/
│   ├── slide/         ← o componente <Slide> — o motor visual determinístico
│   ├── app-shell/, ui/
├── db/                ← schema Drizzle (users, clients, carousels, slides)
├── lib/
│   ├── actions/       ← server actions (criar/salvar/listar/apagar carrossel, settings, generate)
│   └── ...            ← auth guard, rate limit, export para PNG, cliente Claude
└── fonts/              ← Selawik embarcada (SIL OFL) para export fiel no Linux

docs/                   ← visão de produto, ADRs, registro de sessões, STATUS.md (ponto de entrada)
drizzle/                ← migrations SQL versionadas
```

### Case study — construção com Claude Code

**Context.** As regras visuais (cores, espaçamento, selo verificado, sem barra
de engajamento) já existiam como skill em Python, provadas em posts reais. A
pergunta em aberto era manter como ferramenta local ou transformar em algo
vendável a outros profissionais — o segundo caminho exigia autenticação de
verdade, isolamento multi-cliente real e uma interface que um cliente não
técnico usasse sozinho.

**AI-Workflow.** Construído pela esteira `dev-agents` em seis fatias
planejadas (S1 motor de render → S2 editor manual → S3 auth/persistência/
storage → S4 export → S5 geração com IA → S6 hardening multi-cliente), cada
uma rodada de ponta a ponta (research → story → spec → backend → frontend →
testes → validação independente) com gate humano de aprovação antes do código
entrar — ver [docs/STATUS.md](docs/STATUS.md) para o histórico completo. Duas
ADRs de acompanhamento nasceram de *rodar* o produto, não do planejamento
original: a [ADR 0002](docs/adr/0002-migracao-vps-easypanel.md) tirou Postgres
e storage de serviços gerenciados para uma VPS self-hosted, e a
[ADR 0003](docs/adr/0003-correcoes-seguranca-mvp.md) fechou achados de uma
skill de auditoria de segurança (`analise-seguranca`) rodada logo após o
cutover de produção (headers HTTP de segurança, rate limit no login). Um
redesign posterior de UI/UX ([ADR 0004](docs/adr/0004-redesign-ui-ux.md)) foi
construído com backend e frontend em paralelo em git worktrees isolados e
mesclado de forma deliberada, em vez de desenvolvido numa única branch.

**Architecture.** Ver [Stack](#stack) acima. A aposta central de arquitetura:
a renderização é um **componente determinístico**, nunca fica a cargo da IA —
seja o carrossel vindo da porta com IA ou do wizard manual, os dois produzem o
mesmo spec tipado e passam pelo mesmíssimo renderizador `<Slide>`, então o
resultado visual nunca "varia" dependendo de como foi criado. A porta com IA
só enxerga esse contrato, nunca controle de layout bruto (a chamada à Claude
API tem as regras visuais fixadas no system prompt, a intenção do usuário
isolada na mensagem user — uma fronteira deliberada contra prompt injection).

**Evidence.** Em produção desde julho de 2026 em domínio próprio
(`carrosselstudio.evoiatecnologia.com`), vendida e em uso ativo no modelo
done-for-you. O cutover foi verificado com smoke test manual completo (login,
criar/salvar carrossel, upload de imagem, export PNG) antes de ir ao ar. ~320
testes verdes, type-check e build de produção limpos a cada merge para `main`.
Uma auditoria de segurança dedicada rodou logo após o cutover de produção,
fechando todos os achados antes do primeiro cliente pagante.

---

## License

MIT — see [LICENSE](./LICENSE).
