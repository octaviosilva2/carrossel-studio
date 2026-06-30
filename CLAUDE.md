# CLAUDE.md — Carrossel Studio

> Guia do projeto. Lido automaticamente a cada sessão. Mantém o contexto vivo
> entre sessões para máxima eficiência (recurso de contexto persistente do Claude Code).

## O que é
Plataforma web para gerar **carrosséis estilo Twitter/X (modelo Octavio)** prontos
para o Instagram (PNG 1080×1350). **Modelo de negócio:** done-for-you — o Octavio
configura cada cliente, entrega o acesso e cobra setup + manutenção mensal.

## Papéis
- **CEO — Octavio:** decisões de negócio (nome comercial, preço, clientes, escopo).
- **CTO — Claude:** arquitetura, stack, implementação, qualidade e segurança.

## Stack (detalhe em `docs/adr/0001-stack-tecnica.md`)
- **TypeScript** em todo o projeto (front + back).
- **Next.js 15** (App Router) — full-stack, deploy na **Vercel**.
- **PostgreSQL (Neon)** + **Drizzle ORM** — backend e schema 100% nossos (sem Supabase).
- **Auth.js (NextAuth v5)** — auth self-hosted, senhas com hash (bcrypt/argon2), sessões no Postgres.
- **Tailwind + shadcn/ui** — UI.
- **Zod** — validação nas bordas.
- **Anthropic SDK (Claude API)** — server-side. Modelo fixado na spec (consultar skill `claude-api`).
- **Render:** componente React (HTML/CSS) → export PNG no browser; fallback server se necessário.
- **Vercel Blob** — storage de imagens (avatares e imagens de slide).

## Como trabalhamos
- Pipeline oficial: **plugin `dev-agents`** (research → story → spec → backend → frontend → testes → validação), parando nos **gates humanos**.
- **Nada de código de produção sem story e spec aprovadas.**
- Skills do sistema são **fonte de conhecimento** — usar quando o assunto for o delas (instrução do CEO).
- Código em **inglês**, comentários em **português**. Sempre comentar.
- **Sempre rodar testes** antes de considerar algo pronto.
- Ao fim de cada sessão, registrar em `docs/sessoes/`.

## Regras visuais do produto (NUNCA quebrar)
Herança da skill `carrossel-treets-modelo-octavio` (ver `docs/VISAO.md`):
- Tema claro: fundo `#FFFFFF`, texto `#14171A`. Tema escuro: fundo preto, texto branco.
- Selo verificado = **círculo azul `#1D9BF0` com check branco**. Nunca estrela.
- Sem barra de engajamento, sem logo do X, sem emojis no corpo.
- Header (avatar + nome + selo + handle) centralizado na vertical junto ao texto.
- Imagem: borda arredondada (radius 28), escala pela largura, centralizada.
- Cada PNG = exatamente **1080×1350**.

## Estrutura de pastas
- `docs/` — visão, ADRs (decisões), sessões.
- `.work/` — estado do pipeline dev-agents (criado pela esteira).
- código da app (`app/`, `src/`, etc.) — criado na fase de implementação.

## Dependências externas (o CEO provê — o CTO avisa quando travar)
- Conta **Vercel** (deploy) + **Vercel Blob** (storage).
- **PostgreSQL** gerenciado (**Neon** ou Vercel Postgres).
- **Chave da Claude API** (Anthropic) com billing ativo.
- (Depois) domínio e provedor de e-mail (ex.: Resend) para reset de senha.
