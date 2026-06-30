# ROADMAP — Construção do Carrossel Studio

> Plano de execução fatiado em sessões. Aprovado pelo CEO em 2026-06-30.
> Cada sessão = 1 fatia vertical fechada de ponta a ponta pela esteira `dev-agents`
> (research → story → spec → backend → frontend → testes → validação), parando nos
> gates humanos. Ao fim de cada sessão, `STATUS.md` e `.work/` são atualizados para a
> próxima sessão retomar pelo resumo (contexto persistente, economia de token).

## Decisões fechadas
- **Render:** HTML → PNG no browser (mesma stack TS, sem runtime Python na Vercel).
  Validado com o primeiro PNG real da S1. Encerra a decisão em aberto HTML × Python.

## Ordem otimizada (S1, S2 e S4 não dependem de credencial do CEO)

| Sessão | Entrega fechada | Depende do CEO |
|---|---|---|
| **S1 — Fundação + Motor de render** | Scaffold Next.js 15 (App Router) + Tailwind/shadcn. Componente do slide (header centralizado, selo azul `#1D9BF0`, imagem radius 28, temas claro/escuro) → **PNG 1080×1350 real**. | nada |
| **S2 — Editor manual** | Montar carrossel slide a slide: header, texto, upload de imagem, reordenar, **preview ao vivo** com o motor. Estado local. | nada |
| **S3 — Persistência + Auth + Storage** | Auth.js (login por senha), Drizzle + schema (users, clients, carousels, slides) no Neon, upload real no Vercel Blob, salvar/abrir carrossel. | Neon + Vercel/Blob |
| **S4 — Export** | Todos os slides → PNGs → download (ZIP). Carrossel pronto pro Instagram. | nada |
| **S5 — Geração com IA** | Entrada de intenção → Claude monta os slides (server-side) → cai no editor pra ajustar/regenerar. | Claude API ativa |
| **S6 — Multi-cliente + deploy + hardening** | Config por cliente (identidade/tema padrão), isolamento de dados, segurança baseline, deploy produção. Pronto pro 1º cliente. | — |

## Estratégia de eficiência de token
- **Fatia fechada + handoff:** ao fim de cada sessão, atualizar `STATUS.md` e `.work/`;
  a próxima sessão lê o resumo, não o histórico.
- **Subagents `dev-agents` no fan-out:** research/spec rodam isolados e devolvem só o
  destilado — o thread principal fica leve.
- **Gates curtos:** resumo + pergunta objetiva (skill `conduzir-gate`), sem despejar o
  artefato inteiro.

## Estado atual
- **S1 em andamento** — esteira disparada nesta sessão (research → story → gate).
