# STATUS — Onde o projeto está

> **Ponto de entrada para uma nova sessão.** Leia este arquivo primeiro, depois o
> `CLAUDE.md` e `docs/VISAO.md`.

## Última atualização
2026-06-30 — Sessão 02 (planejamento de execução: roadmap, prompts e referência visual).

## Concluído
- ✅ Visão do produto definida (`docs/VISAO.md`).
- ✅ Stack aprovada pelo CEO (`docs/adr/0001-stack-tecnica.md`).
- ✅ Fundação de governança criada (CLAUDE.md, docs, sessões).
- ✅ Restrições registradas (`docs/RESTRICOES.md` — Vercel Hobby).
- ✅ Playbook de venda/configuração de cliente (`docs/PLAYBOOK-CLIENTE.md`).
- ✅ Git + GitHub publicado em `octaviosilva2/carrossel-studio` (branch `main`).
- ✅ Roadmap de execução em 6 sessões (`docs/ROADMAP.md`).
- ✅ Prompt de abertura pronto por sessão (`docs/PROMPTS-SESSOES.md`).
- ✅ Referência visual do slide com tokens exatos (`docs/REFERENCIA-VISUAL.md`).
- ✅ Research da S1 concluído (`.work/s1-fundacao-render/`).

## Próximo passo — iniciar a Sessão 1
Abra uma conversa NOVA do Claude Code no projeto e cole o prompt da **Sessão 1** de
`docs/PROMPTS-SESSOES.md`. Ela roda a esteira (story → spec → build → testes → validação)
parando nos gates. As sessões seguintes seguem a ordem do `ROADMAP.md`, cada uma com seu
prompt pronto.

## Pendências do CEO (necessárias só na implementação)
- Chave **Claude API** (Anthropic, billing ativo).
- **PostgreSQL** (Neon ou Vercel Postgres).
- **Vercel + Vercel Blob**.
- Decidir upgrade **Vercel Pro** antes do primeiro cliente pagante em produção.

## Decisões em aberto
- ✅ Render: **HTML → PNG no browser** (decidido na Sessão 02).
- Valores de **setup/mensalidade/cota** — decisão de negócio do CEO.
- Fonte do slide na web (Segoe UI: embarcar woff2 ou equivalente) — a resolver na spec da S1.
