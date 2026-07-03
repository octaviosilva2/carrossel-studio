# STATUS — S1: Fundação + Motor de render

## Feature
Scaffold Next.js 15 (App Router, TS, Tailwind, shadcn/ui) + componente do slide
(regras visuais) → PNG 1080×1350 no browser. Render fechado em HTML→PNG.

## Ponto de entrada
Estágio **01 (research)** — feature nova, greenfield, cruza camadas.

## Estágio atual
**FATIA CONCLUÍDA e VALIDADA.** Build + componente + export implementados; testes 15/15;
4 PNGs reais 1080×1350 gerados e conferidos a olho (fidelidade ao modelo Octavio); validador
independente emitiu veredito APROVAR (zero achado bloqueante). validation.md escrito.

## Lacunas do research — RESOLVIDAS
Os 4 [PRECISA CLARIFICAR] (hex dark, fonte, margens/tamanhos, lib) foram fechados
extraindo os valores exatos da skill original `../carrossel-treets-modelo-octavio/render_pillow.py`.
Tokens consolidados em `docs/REFERENCIA-VISUAL.md`. Ponto aberto p/ a spec: fonte Segoe UI
na web (embarcar woff2 ou equivalente).

## Gates
- [x] Story aprovada (após 02) — 2026-06-30
- [x] Spec aprovada (após 03) — 2026-06-30 (CEO autorizou seguir pelas recomendações)
- [x] Validação aprovada (após 07) — 2026-06-30 (veredito APROVAR, ressalvas não-bloqueantes)

## Follow-ups conhecidos (fora do escopo S1 — agendar)
- **Embarcar woff2 (Selawik/Segoe UI) via next/font/local ANTES de qualquer deploy Linux.**
  Hoje a fidelidade depende da Segoe UI do sistema Windows. Crítico para S6/deploy.
- Configurar ESLint (hoje `ignoreDuringBuilds: true`) — fatia futura.
- Auto-fit de texto por overflow — S2/editor.
- Teste automatizado do caminho de erro do export (asset ausente) — quando útil.

## Decisões do gate da spec (2026-06-30)
- **Fonte:** Selawik (livre, OFL, métrica-compatível com Segoe UI). Segoe UI é proprietária → não redistribuível no bundle. `next/font/local` com woff2 same-origin.
- **Teste de dimensão:** opção A — fixture PNG real gerado uma vez + `sharp` lê 1080×1350. Vitest para contrato/componente.
- **Sem estágio 04-backend nesta fatia:** S1 é 100% client-side (sem API/DB/auth). Build = scaffold + componente + export (papel de frontend/05).

## Decisões fixadas
- Render: HTML → PNG no browser (sem Python). Validar com PNG real.
- Stack conforme docs/adr/0001-stack-tecnica.md.
- Restrições: docs/RESTRICOES.md (Vercel Hobby).

## Decisões do gate da story (2026-06-30)
- **Auto-fit de texto (overflow): FORA da S1** — fica para S2/fatia futura. Dados fixos da S1 já cabem no slide.
- **Validação = 4 cenários de PNG real:** claro/sem imagem, claro/com imagem, escuro/sem imagem, escuro/com imagem.
- Deixado para a spec decidir: lib de HTML→PNG, estratégia de DPR/pixelRatio, como embarcar Segoe UI (woff2 ou equivalente fiel).
