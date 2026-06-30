# STATUS — S1: Fundação + Motor de render

## Feature
Scaffold Next.js 15 (App Router, TS, Tailwind, shadcn/ui) + componente do slide
(regras visuais) → PNG 1080×1350 no browser. Render fechado em HTML→PNG.

## Ponto de entrada
Estágio **01 (research)** — feature nova, greenfield, cruza camadas.

## Estágio atual
01-research **concluído** (research.md escrito). Próximo: 02-story — será conduzido na
**sessão dedicada da S1** (Octavio abre conversa nova com o prompt em docs/PROMPTS-SESSOES.md).

## Lacunas do research — RESOLVIDAS
Os 4 [PRECISA CLARIFICAR] (hex dark, fonte, margens/tamanhos, lib) foram fechados
extraindo os valores exatos da skill original `../carrossel-treets-modelo-octavio/render_pillow.py`.
Tokens consolidados em `docs/REFERENCIA-VISUAL.md`. Ponto aberto p/ a spec: fonte Segoe UI
na web (embarcar woff2 ou equivalente).

## Gates
- [ ] Story aprovada (após 02)
- [ ] Spec aprovada (após 03)
- [ ] Validação aprovada (após 07)

## Decisões fixadas
- Render: HTML → PNG no browser (sem Python). Validar com PNG real.
- Stack conforme docs/adr/0001-stack-tecnica.md.
- Restrições: docs/RESTRICOES.md (Vercel Hobby).
