# STATUS — Onde o projeto está

> **Ponto de entrada para uma nova sessão.** Leia este arquivo primeiro, depois o
> `CLAUDE.md` e `docs/VISAO.md`.

## Última atualização
2026-06-30 — Sessão 01.

## Concluído
- ✅ Visão do produto definida (`docs/VISAO.md`).
- ✅ Stack aprovada pelo CEO (`docs/adr/0001-stack-tecnica.md`).
- ✅ Fundação de governança criada (CLAUDE.md, docs, sessões).
- ✅ Restrições registradas (`docs/RESTRICOES.md` — Vercel Hobby).
- ✅ Playbook de venda/configuração de cliente (`docs/PLAYBOOK-CLIENTE.md`).
- ✅ Git + GitHub publicado em `octaviosilva2/carrossel-studio` (branch `main`).

## Próximo passo (nova sessão, working dir = carrossel-studio)
1. **Rodar a esteira `dev-agents`** a partir do planejamento:
   research → **story (GATE)** → **spec (GATE)**.
2. Aprovar story e spec nos gates.
3. Implementação: backend → frontend → testes → validação.
4. **Passo 1 da implementação = teste de render** (HTML × PNG atual) para fechar a
   decisão em aberto de renderização.

## Pendências do CEO (necessárias só na implementação)
- Chave **Claude API** (Anthropic, billing ativo).
- **PostgreSQL** (Neon ou Vercel Postgres).
- **Vercel + Vercel Blob**.
- Decidir upgrade **Vercel Pro** antes do primeiro cliente pagante em produção.

## Decisões em aberto
- Render final: **HTML (recomendado)** vs Python — decidir no teste lado a lado.
- Valores de **setup/mensalidade/cota** — decisão de negócio do CEO.
