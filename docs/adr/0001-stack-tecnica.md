# ADR 0001 — Stack Técnica

- **Data:** 2026-06-30
- **Status:** Aprovada pelo CEO (2026-06-30)
- **Decisor:** CTO (Claude), delegado pelo CEO (Octavio)

## Contexto
Transformar a skill local `carrossel-treets-modelo-octavio` (Python + Pillow,
rodando no Claude Code) em um produto web vendável (done-for-you). Requisitos do CEO:
- **Sem Supabase.** Backend, autenticação e banco construídos por nós sobre PostgreSQL.
- **Deploy na Vercel** (fixo).
- Produto completo e profissional (não um MVP capado).

## Decisão
| Camada | Escolha |
|---|---|
| Linguagem | TypeScript (front + back) |
| Framework | Next.js 15 (App Router) |
| Banco | PostgreSQL (Neon) |
| ORM/migrations | Drizzle |
| Auth | Auth.js (NextAuth v5) — self-hosted, hash de senha (bcrypt/argon2), sessões no Postgres |
| UI | Tailwind + shadcn/ui |
| Validação | Zod |
| IA | Anthropic SDK (Claude API), server-side |
| Render | React (HTML/CSS) → export PNG no browser; fallback server (Satori/Playwright) |
| Storage | Vercel Blob |
| Deploy | Vercel |

## Alternativas consideradas
- **Supabase (BaaS):** rejeitado pelo CEO — queremos controle total do backend.
- **Auth do zero (cripto própria):** rejeitado pelo CTO — risco de segurança. "Próprio"
  significa self-hosted e controlado por nós, com bibliotecas consolidadas, não reinventar criptografia.
- **Manter render em Python (Pillow) num micro-serviço:** mantido como alternativa de
  fidelidade; decisão final após teste lado a lado HTML × PNG atual.

## Consequências
- Um único repositório TypeScript, deploy simples na Vercel.
- Precisaremos de: conta Vercel + Blob, Postgres (Neon), chave Claude API.
- Banco gerenciado (Neon) não contradiz "backend próprio": o servidor de banco é
  gerenciado, mas schema, queries, auth e regras de negócio são 100% nossos.
- **Vercel plano Hobby** durante a construção (ver `docs/RESTRICOES.md`): exige render
  no browser e funções leves; upgrade para Pro antes do primeiro cliente pagante.
